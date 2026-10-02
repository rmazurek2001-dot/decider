import math
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Mapping, Optional, Sequence

from django.core.cache import cache
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.request import Request
from rest_framework.response import Response

from core.llm.context import format_tree_summary, weighted_score
from core.llm.schemas import Language

from .models import ChatMessage, Comment, DecisionNode, LLMCall, Project, Task, Vote
from .serializers import (
    ChatMessageSerializer,
    CommentSerializer,
    DecisionNodeCreateSerializer,
    DecisionNodeSerializer,
    LLMCallSerializer,
    ProjectSerializer,
    ProjectTaskSerializer,
    PublicProjectSerializer,
    TaskSerializer,
)
from .services import template_service
from .services.ai_service import ai_service
from .services.fallbacks import fallback_analysis, fallback_suggestions

SUPPORTED_LANGUAGES = ('en', 'pl')
NODE_STATUSES = {choice for choice, _ in DecisionNode.STATUS_CHOICES}
NODE_TYPES = {choice for choice, _ in DecisionNode.NODE_TYPE_CHOICES}
SECTIONS = {choice for choice, _ in DecisionNode.SECTION_CHOICES}
SUMMARY_FIELDS = (
    'id', 'parent_id', 'title', 'description', 'estimated_cost', 'status', 'section', 'order', 'node_type',
    'score_comfort', 'score_risk', 'score_time', 'score_pleasure',
)
AI_UNAVAILABLE = 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'


def request_language(request: Request) -> Language:
    value = None
    if request.method != 'GET' and isinstance(request.data, Mapping):
        value = request.data.get('language')
    if value is None:
        value = request.query_params.get('language')
    return value if value in SUPPORTED_LANGUAGES else 'en'


def project_nodes(project: Project) -> List[Dict[str, Any]]:
    rows = (
        DecisionNode.objects.filter(project=project)
        .annotate(vote_count=Count('votes'))
        .order_by('order', 'created_at')
        .values(*SUMMARY_FIELDS, 'vote_count')
    )
    nodes = []
    for row in rows:
        row['votes'] = row.pop('vote_count')
        row['estimated_cost'] = float(row['estimated_cost'] or 0)
        nodes.append(row)
    return nodes


def build_tree_summary(project: Project, nodes: Optional[Sequence[Mapping[str, Any]]] = None) -> str:
    return format_tree_summary(
        {'title': project.title, 'description': project.description, 'budget_total': float(project.budget_total)},
        project_nodes(project) if nodes is None else nodes,
        project.criteria_weights,
    )


def _ai_unavailable() -> Response:
    return Response({'error': AI_UNAVAILABLE}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return Decimal('0.00')


def _normalize_title(title: Any) -> str:
    return str(title).strip().casefold() if title else ''


def _attach_node_ids(suggestions: List[Dict[str, Any]], nodes: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    ids_by_title: Dict[str, int] = {}
    for node in nodes:
        ids_by_title.setdefault(_normalize_title(node['title']), node['id'])
    for suggestion in suggestions:
        suggestion.setdefault('node_id', ids_by_title.get(_normalize_title(suggestion.get('node_title'))))
        suggestion.setdefault('parent_id', ids_by_title.get(_normalize_title(suggestion.get('parent_title'))))
    return suggestions


def _node_id_by_title(project: Project, title: Any) -> Optional[int]:
    if not _normalize_title(title):
        return None
    return (
        DecisionNode.objects.filter(project=project, title__iexact=str(title).strip())
        .values_list('id', flat=True)
        .first()
    )


def _int_param(value: Any, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(low, min(high, number))


def _percentile(values: Sequence[float], q: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    rank = (len(ordered) - 1) * q
    low, high = math.floor(rank), math.ceil(rank)
    return round(ordered[low] + (ordered[high] - ordered[low]) * (rank - low))


def _call_stats(calls: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    count = len(calls)
    latencies = [call['latency_ms'] for call in calls]
    return {
        'calls': count,
        'success_rate': round(sum(1 for call in calls if call['success']) / count, 4) if count else 1.0,
        'avg_attempts': round(sum(call['attempts'] for call in calls) / count, 2) if count else 1.0,
        'input_tokens': sum(call['input_tokens'] for call in calls),
        'output_tokens': sum(call['output_tokens'] for call in calls),
        'cost_usd': round(sum(call['cost_usd'] for call in calls), 6),
        'p50_latency_ms': _percentile(latencies, 0.5),
        'p95_latency_ms': _percentile(latencies, 0.95),
    }


def _group_calls(calls: Sequence[Mapping[str, Any]], key: str) -> List[tuple]:
    groups: Dict[str, List[Mapping[str, Any]]] = defaultdict(list)
    for call in calls:
        groups[call[key]].append(call)
    return sorted(groups.items(), key=lambda item: (-len(item[1]), item[0]))


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.prefetch_related('decision_nodes').all()
    serializer_class = ProjectSerializer

    @action(detail=True, methods=['get'])
    def tree(self, request, pk=None):
        project = self.get_object()
        root_nodes = project.decision_nodes.filter(parent=None).prefetch_related('tasks', 'comments')
        serializer = DecisionNodeSerializer(root_nodes, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def analyze_project(self, request: Request, pk: Optional[str] = None) -> Response:
        """Strategic AI analysis of the project, with a rule-based fallback."""
        project = self.get_object()
        if not ai_service.enabled:
            return _ai_unavailable()

        language = request_language(request)
        nodes = project_nodes(project)
        analysis = ai_service.analyze_project(
            project_title=project.title,
            project_description=project.description,
            budget_total=float(project.budget_total),
            tree_summary=build_tree_summary(project, nodes),
            language=language,
            project_id=project.id,
        )
        if not analysis:
            analysis = fallback_analysis(project.title, nodes, float(project.budget_total), language)
        return Response(analysis, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def get_suggestions(self, request: Request, pk: Optional[str] = None) -> Response:
        """One-click change proposals for the decision tree, with a rule-based fallback."""
        project = self.get_object()
        if not ai_service.enabled:
            return _ai_unavailable()

        language = request_language(request)
        nodes = project_nodes(project)
        suggestions = ai_service.generate_actionable_suggestions(
            project_title=project.title,
            project_description=project.description,
            budget_total=float(project.budget_total),
            tree_summary=build_tree_summary(project, nodes),
            language=language,
            project_id=project.id,
        )
        if not suggestions:
            suggestions = fallback_suggestions(nodes, float(project.budget_total), language)
        return Response(_attach_node_ids(suggestions, nodes), status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def apply_suggestion(self, request: Request, pk: Optional[str] = None) -> Response:
        project = self.get_object()
        suggestion = request.data.get('suggestion')

        if not suggestion:
            return Response(
                {'error': 'No suggestion provided'},
                status=status.HTTP_400_BAD_REQUEST
            )

        action_type = suggestion.get('action_type') or suggestion.get('type')
        changes = suggestion.get('changes') or {}

        try:
            if action_type in ('update_node_status', 'update_node_scores', 'update_node_cost'):
                node_id = suggestion.get('node_id') or _node_id_by_title(project, suggestion.get('node_title'))
                if not node_id:
                    return Response(
                        {'error': f'node_id is required for {action_type}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                node = DecisionNode.objects.get(id=node_id, project=project)

                if action_type == 'update_node_status':
                    if 'status' in changes:
                        if changes['status'] not in NODE_STATUSES:
                            return Response(
                                {'error': f"Invalid status: {changes['status']}"},
                                status=status.HTTP_400_BAD_REQUEST
                            )
                        node.status = changes['status']
                    message = f'Node status updated to {node.status}'
                elif action_type == 'update_node_scores':
                    for field in ('score_comfort', 'score_risk', 'score_time', 'score_pleasure'):
                        if field in changes:
                            setattr(node, field, changes[field])
                    message = 'Node scores updated successfully'
                else:
                    if 'estimated_cost' in changes:
                        node.estimated_cost = Decimal(str(changes['estimated_cost']))
                    message = f'Node cost updated to {node.estimated_cost}'

                node.save()
                return Response({
                    'success': True,
                    'message': message,
                    'updated_node': DecisionNodeSerializer(node).data
                }, status=status.HTTP_200_OK)

            if action_type == 'add_buffer_node':
                parent_id = suggestion.get('parent_id') or _node_id_by_title(project, suggestion.get('parent_title'))
                parent = DecisionNode.objects.get(id=parent_id, project=project) if parent_id else None

                new_node = DecisionNode.objects.create(
                    project=project,
                    parent=parent,
                    title=changes.get('title', 'Buffer Node'),
                    description=changes.get('description', ''),
                    estimated_cost=Decimal(str(changes.get('estimated_cost', 0))),
                    score_comfort=changes.get('score_comfort', 50),
                    score_risk=changes.get('score_risk', 50),
                    score_time=changes.get('score_time', 50),
                    score_pleasure=changes.get('score_pleasure', 50),
                    section=changes.get('section', 'other'),
                    order=changes.get('order', 0),
                    node_type=changes.get('node_type', 'decision')
                )
                return Response({
                    'success': True,
                    'message': f'New node "{new_node.title}" created successfully',
                    'created_node': DecisionNodeSerializer(new_node).data
                }, status=status.HTTP_201_CREATED)

            return Response(
                {'error': f'Unknown action type: {action_type}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        except DecisionNode.DoesNotExist:
            return Response(
                {'error': 'Node not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get', 'post'])
    def chat(self, request: Request, pk: Optional[str] = None) -> Response:
        """GET returns the chat history; POST sends a message and returns the assistant reply."""
        project = self.get_object()

        if request.method == 'GET':
            messages = ChatMessage.objects.filter(project=project)
            serializer = ChatMessageSerializer(messages, many=True)
            return Response(serializer.data)

        user_message = request.data.get('message', '')
        if not user_message:
            return Response(
                {'error': 'Message is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not ai_service.enabled:
            return _ai_unavailable()

        recent_messages = list(ChatMessage.objects.filter(project=project).order_by('-created_at')[:10])
        chat_history = '\n'.join(f'{msg.role.upper()}: {msg.content}' for msg in reversed(recent_messages))
        ChatMessage.objects.create(project=project, role='user', content=user_message)

        ai_response = ai_service.chat_with_project(
            project_title=project.title,
            project_description=project.description,
            budget_total=float(project.budget_total),
            tree_summary=build_tree_summary(project),
            chat_history=chat_history,
            user_message=user_message,
            language=request_language(request),
            project_id=project.id,
        )
        if not ai_response:
            return Response(
                {'error': 'Failed to get AI response. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        assistant_message = ChatMessage.objects.create(project=project, role='assistant', content=ai_response)
        return Response({
            'user_message': user_message,
            'assistant_message': ai_response,
            'message_id': assistant_message.id
        })

    @action(detail=False, methods=['post'])
    def build_from_notes(self, request: Request) -> Response:
        """Create a project with milestones and options from free-text notes."""
        notes = request.data.get('notes', '')
        if not notes:
            return Response(
                {'error': 'Notes are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            budget_total = float(request.data.get('budget_total', 10000))
        except (TypeError, ValueError):
            return Response(
                {'error': 'Invalid budget_total value'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not ai_service.enabled:
            return _ai_unavailable()

        structure = ai_service.build_project_from_notes(
            notes=notes,
            budget_total=budget_total,
            language=request_language(request),
            project_id=None,
        )
        if not structure:
            return Response(
                {'error': 'Failed to build project from notes. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        with transaction.atomic():
            project = Project.objects.create(
                title=structure['title'][:200],
                description=structure.get('description', ''),
                budget_total=_money(budget_total)
            )
            self._create_ai_nodes(project, structure.get('nodes', []))

        serializer = ProjectSerializer(project)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _create_ai_nodes(project: Project, nodes_data: Sequence[Mapping[str, Any]],
                         parent: Optional[DecisionNode] = None) -> None:
        for node_data in nodes_data:
            node_type = node_data.get('node_type')
            section = node_data.get('section')
            node = DecisionNode.objects.create(
                project=project,
                parent=parent,
                title=str(node_data['title'])[:200],
                description=node_data.get('description', ''),
                estimated_cost=_money(node_data.get('estimated_cost')),
                node_type=node_type if node_type in NODE_TYPES else 'decision',
                section=section if section in SECTIONS else 'general',
                order=int(node_data.get('order') or 0),
                score_comfort=int(node_data.get('score_comfort', 50)),
                score_risk=int(node_data.get('score_risk', 50)),
                score_time=int(node_data.get('score_time', 50)),
                score_pleasure=int(node_data.get('score_pleasure', 50)),
                status='pending'
            )
            ProjectViewSet._create_ai_nodes(project, node_data.get('children') or [], parent=node)

    @action(detail=False, methods=['get'])
    def templates(self, request: Request) -> Response:
        templates = template_service.get_all_templates(language=request_language(request))
        return Response(templates, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def create_from_template(self, request: Request) -> Response:
        """Create a project from a template: {"template_id", "title", "budget_total", "language"}."""
        template_id = request.data.get('template_id')
        title = request.data.get('title', '')
        budget_total = request.data.get('budget_total')

        if not template_id:
            return Response(
                {'error': 'template_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not budget_total:
            return Response(
                {'error': 'budget_total is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        template = template_service.get_template(template_id, language=request_language(request))
        if not template:
            return Response(
                {'error': f'Template "{template_id}" not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        project_title = title if title else template['title']

        try:
            budget_decimal = Decimal(str(budget_total))
        except (InvalidOperation, ValueError, TypeError):
            return Response(
                {'error': 'Invalid budget_total value'},
                status=status.HTTP_400_BAD_REQUEST
            )

        project = Project.objects.create(
            title=project_title,
            description=template['description'],
            budget_total=budget_decimal
        )

        def create_nodes_from_template(nodes_data, parent=None):
            for node_data in nodes_data:
                cost_percent = node_data.get('estimated_cost_percent', 0)
                estimated_cost = (budget_decimal * Decimal(str(cost_percent))) / Decimal('100')

                node = DecisionNode.objects.create(
                    project=project,
                    parent=parent,
                    title=node_data['title'],
                    description=node_data.get('description', ''),
                    estimated_cost=estimated_cost,
                    node_type=node_data.get('node_type', 'decision'),
                    section=node_data.get('section', 'general'),
                    order=node_data.get('order', 0),
                    score_comfort=node_data.get('score_comfort', 50),
                    score_risk=node_data.get('score_risk', 50),
                    score_time=node_data.get('score_time', 50),
                    score_pleasure=node_data.get('score_pleasure', 50),
                    status='pending'
                )

                if 'children' in node_data and node_data['children']:
                    create_nodes_from_template(node_data['children'], parent=node)

        create_nodes_from_template(template['nodes'])

        serializer = ProjectSerializer(project)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def get_all_tasks(self, request: Request, pk: Optional[str] = None) -> Response:
        """All tasks of the project with completion stats."""
        project = self.get_object()

        tasks = Task.objects.filter(
            node__project=project
        ).select_related('node').order_by('due_date', 'created_at')

        serializer = ProjectTaskSerializer(tasks, many=True)

        total_tasks = tasks.count()
        completed_tasks = tasks.filter(is_completed=True).count()
        completion_percentage = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

        return Response({
            'tasks': serializer.data,
            'stats': {
                'total': total_tasks,
                'completed': completed_tasks,
                'pending': total_tasks - completed_tasks,
                'completion_percentage': round(completion_percentage, 1)
            }
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def analytics(self, request: Request, pk: Optional[str] = None) -> Response:
        """Aggregated budget, score, task and decision statistics."""
        project = self.get_object()

        selected_options = DecisionNode.objects.filter(
            project=project,
            status='selected'
        ).exclude(node_type='milestone')

        total_estimated = Decimal('0')
        total_actual = Decimal('0')

        for node in selected_options:
            total_estimated += node.estimated_cost or Decimal('0')
            total_actual += node.actual_cost or node.estimated_cost or Decimal('0')

        variance = total_actual - total_estimated

        budget_summary = {
            'total_estimated': float(total_estimated),
            'total_actual': float(total_actual),
            'variance': float(variance),
            'variance_percentage': float((variance / total_estimated * 100) if total_estimated > 0 else 0)
        }

        budget_by_section = []
        sections = selected_options.values_list('section', flat=True).distinct()

        for section in sections:
            section_nodes = selected_options.filter(section=section)
            section_estimated = sum(float(node.estimated_cost or 0) for node in section_nodes)
            section_actual = sum(float(node.actual_cost or node.estimated_cost or 0) for node in section_nodes)

            budget_by_section.append({
                'section': section or 'general',
                'estimated': section_estimated,
                'actual': section_actual
            })

        scores_avg = selected_options.aggregate(
            comfort=Avg('score_comfort'),
            risk=Avg('score_risk'),
            time=Avg('score_time'),
            pleasure=Avg('score_pleasure')
        )

        scores_average = {
            'comfort': round(scores_avg['comfort'] or 50, 1),
            'risk': round(scores_avg['risk'] or 50, 1),
            'time': round(scores_avg['time'] or 50, 1),
            'pleasure': round(scores_avg['pleasure'] or 50, 1)
        }

        score_rows = list(selected_options.values('score_comfort', 'score_risk', 'score_time', 'score_pleasure'))
        weights = project.criteria_weights
        project_weighted_score = (
            sum(weighted_score(row, weights) for row in score_rows) / len(score_rows) if score_rows else 0.0
        )

        all_tasks = Task.objects.filter(node__project=project)
        total_tasks = all_tasks.count()
        completed_tasks = all_tasks.filter(is_completed=True).count()

        tasks_summary = {
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'pending_tasks': total_tasks - completed_tasks,
            'completion_percentage': round((completed_tasks / total_tasks * 100) if total_tasks > 0 else 0, 1)
        }

        all_options = DecisionNode.objects.filter(project=project).exclude(node_type='milestone')
        decisions_summary = {
            'total_options': all_options.count(),
            'selected': all_options.filter(status='selected').count(),
            'rejected': all_options.filter(status='rejected').count(),
            'pending': all_options.filter(status='pending').count()
        }

        return Response({
            'budget_summary': budget_summary,
            'budget_by_section': budget_by_section,
            'scores_average': scores_average,
            'weighted_score': round(project_weighted_score, 1),
            'tasks_summary': tasks_summary,
            'decisions_summary': decisions_summary
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def save_layout(self, request, pk=None):
        """
        Batch update node positions for the project
        POST: { "positions": [{"id": 1, "position_x": 100.5, "position_y": 200.3}, ...] }
        """
        project = self.get_object()
        positions_data = request.data.get('positions', [])

        if not positions_data:
            return Response(
                {'error': 'positions array is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            node_ids = [pos['id'] for pos in positions_data if 'id' in pos]
            nodes = DecisionNode.objects.filter(project=project, id__in=node_ids)

            nodes_map = {node.id: node for node in nodes}

            updated_nodes = []
            for pos_data in positions_data:
                node_id = pos_data.get('id')
                if node_id in nodes_map:
                    node = nodes_map[node_id]
                    node.position_x = float(pos_data.get('position_x', 0))
                    node.position_y = float(pos_data.get('position_y', 0))
                    updated_nodes.append(node)

            if updated_nodes:
                DecisionNode.objects.bulk_update(updated_nodes, ['position_x', 'position_y'])

            return Response({
                'success': True,
                'message': f'Updated positions for {len(updated_nodes)} nodes',
                'updated_count': len(updated_nodes)
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DecisionNodeViewSet(viewsets.ModelViewSet):
    queryset = DecisionNode.objects.select_related('parent', 'project').prefetch_related('tasks', 'comments').all()
    serializer_class = DecisionNodeSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'vote', 'generate_subnodes', 'update', 'partial_update', 'create', 'destroy']:
            return [permissions.AllowAny()]
        return [permissions.AllowAny()]

    def get_serializer_class(self):
        if self.action == 'partial_update':
            return DecisionNodeSerializer
        if self.action == 'create' or self.action == 'update':
            return DecisionNodeCreateSerializer
        return DecisionNodeSerializer

    def get_queryset(self):
        queryset = DecisionNode.objects.all()
        project_id = self.request.query_params.get('project', None)
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    @action(detail=True, methods=['post'])
    def generate_subnodes(self, request: Request, pk: Optional[str] = None) -> Response:
        parent_node = self.get_object()

        client_ip = self._get_client_ip(request)
        cache_key = f'ai_gen_{pk}_{client_ip}'
        if cache.get(cache_key):
            return Response(
                {'error': 'Please wait 30 seconds between AI requests'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        if not ai_service.enabled:
            return _ai_unavailable()

        project = parent_node.project
        project_context = f"Project: {project.title}. {project.description or ''}"
        budget_context = f"Total budget: ${project.budget_total}. Parent node cost: ${parent_node.estimated_cost}"
        parent_node_text = f"{parent_node.title}. {parent_node.description or ''}"

        ai_options = ai_service.generate_options(
            parent_node_text=parent_node_text,
            project_context=project_context,
            budget_context=budget_context,
            language=request_language(request),
            project_id=project.id,
        )

        if not ai_options:
            return Response(
                {'error': 'Failed to generate options from AI. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        cache.set(cache_key, True, 30)

        created_nodes = []
        for option in ai_options:
            try:
                node = DecisionNode.objects.create(
                    project=project,
                    parent=parent_node,
                    title=option['title'],
                    description=option['description'],
                    estimated_cost=_money(option['estimated_cost']),
                    score_comfort=int(option.get('score_comfort', 50)),
                    score_risk=int(option.get('score_risk', 50)),
                    score_time=int(option.get('score_time', 50)),
                    score_pleasure=int(option.get('score_pleasure', 50)),
                    status='pending'
                )
                created_nodes.append(node)
            except Exception as e:
                return Response(
                    {'error': f'Failed to create node: {str(e)}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        serializer = DecisionNodeSerializer(created_nodes, many=True)
        return Response({
            'created_nodes': serializer.data,
            'message': f'Successfully created {len(created_nodes)} sub-nodes'
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[permissions.AllowAny])
    def vote(self, request, pk=None):
        node = self.get_object()
        session_id = request.data.get('session_id', None)

        if not session_id:
            return Response(
                {'error': 'Session ID is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ip_address = self._get_client_ip(request)

        if Vote.objects.filter(node=node, session_id=session_id).exists():
            return Response(
                {'error': 'You have already voted for this node'},
                status=status.HTTP_400_BAD_REQUEST
            )

        Vote.objects.create(
            node=node,
            session_id=session_id,
            ip_address=ip_address
        )

        vote_count = node.votes.count()
        return Response({
            'message': 'Vote added successfully',
            'vote_count': vote_count
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def generate_tasks(self, request: Request, pk: Optional[str] = None) -> Response:
        """Generate AI tasks for a selected decision node."""
        node = self.get_object()

        if node.status != 'selected':
            return Response(
                {'error': 'Tasks can only be generated for selected nodes'},
                status=status.HTTP_400_BAD_REQUEST
            )

        client_ip = self._get_client_ip(request)
        cache_key = f'ai_tasks_{pk}_{client_ip}'
        if cache.get(cache_key):
            return Response(
                {'error': 'Please wait 30 seconds between AI requests'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        if not ai_service.enabled:
            return _ai_unavailable()

        tasks_list = ai_service.generate_tasks_for_node(
            node_title=node.title,
            node_description=node.description or '',
            language=request_language(request),
            project_id=node.project_id,
        )

        if not tasks_list:
            return Response(
                {'error': 'Failed to generate tasks from AI. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        cache.set(cache_key, True, 30)

        created_tasks = [Task.objects.create(node=node, title=title[:255], is_completed=False) for title in tasks_list]

        serializer = DecisionNodeSerializer(node)
        return Response({
            'node': serializer.data,
            'message': f'Successfully created {len(created_tasks)} tasks'
        }, status=status.HTTP_201_CREATED)

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip


class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.select_related('node').all()
    serializer_class = TaskSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Task.objects.all()
        node_id = self.request.query_params.get('node', None)
        if node_id:
            queryset = queryset.filter(node_id=node_id)
        return queryset


class CommentViewSet(viewsets.ModelViewSet):
    queryset = Comment.objects.select_related('node').all()
    serializer_class = CommentSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        queryset = Comment.objects.all()
        node_id = self.request.query_params.get('node', None)
        if node_id:
            queryset = queryset.filter(node_id=node_id)
        return queryset


@api_view(['GET'])
def public_project_view(request, token):
    try:
        project = Project.objects.get(share_token=token)
    except Project.DoesNotExist:
        return Response(
            {'error': 'Project not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    serializer = PublicProjectSerializer(project)
    return Response(serializer.data)


@api_view(['GET'])
def public_project_tree_view(request, token):
    try:
        project = Project.objects.get(share_token=token)
    except Project.DoesNotExist:
        return Response(
            {'error': 'Project not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    root_nodes = project.decision_nodes.filter(parent=None)
    serializer = DecisionNodeSerializer(root_nodes, many=True)
    return Response(serializer.data)


@api_view(['GET'])
def public_project_tasks_view(request, token):
    """Read-only project tasks for a shared link."""
    try:
        project = Project.objects.get(share_token=token)
    except Project.DoesNotExist:
        return Response(
            {'error': 'Project not found'},
            status=status.HTTP_404_NOT_FOUND
        )

    tasks = Task.objects.filter(
        node__project=project
    ).select_related('node').order_by('due_date', 'created_at')

    serializer = ProjectTaskSerializer(tasks, many=True)

    total_tasks = tasks.count()
    completed_tasks = tasks.filter(is_completed=True).count()
    completion_percentage = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

    return Response({
        'tasks': serializer.data,
        'stats': {
            'total': total_tasks,
            'completed': completed_tasks,
            'pending': total_tasks - completed_tasks,
            'completion_percentage': round(completion_percentage, 1)
        }
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
def llm_metrics_view(request: Request) -> Response:
    """Aggregated LLM call telemetry over the last `days` calendar days."""
    days = _int_param(request.query_params.get('days'), default=7, low=1, high=90)
    today = timezone.localdate()
    start_date = today - timedelta(days=days - 1)
    start = timezone.make_aware(datetime.combine(start_date, datetime.min.time()))

    calls = list(
        LLMCall.objects.filter(created_at__gte=start).values(
            'created_at', 'operation', 'model', 'latency_ms', 'input_tokens', 'output_tokens',
            'cost_usd', 'attempts', 'success',
        )
    )

    daily = {start_date + timedelta(days=offset): {'calls': 0, 'cost_usd': 0.0, 'failures': 0}
             for offset in range(days)}
    for call in calls:
        bucket = daily.get(timezone.localtime(call['created_at']).date())
        if bucket is None:
            continue
        bucket['calls'] += 1
        bucket['cost_usd'] += call['cost_usd']
        bucket['failures'] += 0 if call['success'] else 1

    by_model = []
    for model, group in _group_calls(calls, 'model'):
        stats = _call_stats(group)
        by_model.append({'model': model, 'calls': stats['calls'], 'cost_usd': stats['cost_usd'],
                         'p50_latency_ms': stats['p50_latency_ms']})

    return Response({
        'window_days': days,
        'totals': _call_stats(calls),
        'by_operation': [{'operation': operation, **_call_stats(group)}
                         for operation, group in _group_calls(calls, 'operation')],
        'by_model': by_model,
        'daily': [{'date': day.isoformat(), **bucket, 'cost_usd': round(bucket['cost_usd'], 6)}
                  for day, bucket in daily.items()],
    })


@api_view(['GET'])
def llm_calls_view(request: Request) -> Response:
    """Most recent LLM calls, newest first."""
    limit = _int_param(request.query_params.get('limit'), default=50, low=1, high=200)
    calls = LLMCall.objects.order_by('-created_at', '-id')[:limit]
    return Response(LLMCallSerializer(calls, many=True).data)


@api_view(['POST'])
def seed_test_project(request):
    """
    Creates a test project with sample nodes for E2E testing.
    Only available when DEBUG=True for security reasons.

    Returns:
        - project: Created project data
        - nodes: List of created nodes
        - share_token: Token for public access
    """
    from django.conf import settings

    if not settings.DEBUG:
        return Response(
            {'error': 'Testing endpoints are only available in DEBUG mode'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        project = Project.objects.create(
            title="E2E Test Project",
            description="Automated test project for Playwright E2E tests",
            budget_total=Decimal('50000.00')
        )

        root_node = DecisionNode.objects.create(
            project=project,
            title="Test Milestone",
            description="Root milestone node for testing",
            estimated_cost=Decimal('10000.00'),
            node_type='milestone',
            score_comfort=80,
            score_risk=30,
            score_time=70,
            score_pleasure=90,
            status='pending',
            order=1
        )

        option_node = DecisionNode.objects.create(
            project=project,
            parent=root_node,
            title="Test Option",
            description="Child option node for testing interactions",
            estimated_cost=Decimal('5000.00'),
            node_type='option',
            score_comfort=75,
            score_risk=25,
            score_time=85,
            score_pleasure=95,
            status='pending',
            order=2
        )

        DecisionNode.objects.create(
            project=project,
            parent=root_node,
            title="Alternative Option",
            description="Second option for testing collapse/expand",
            estimated_cost=Decimal('7500.00'),
            node_type='option',
            score_comfort=60,
            score_risk=40,
            score_time=65,
            score_pleasure=80,
            status='pending',
            order=3
        )

        Task.objects.create(
            node=option_node,
            title="Test Task",
            is_completed=False
        )

        Comment.objects.create(
            node=option_node,
            author_name="Test User",
            content="This is a test comment for E2E testing"
        )

        project_serializer = ProjectSerializer(project)
        nodes = DecisionNode.objects.filter(project=project).order_by('order')
        nodes_serializer = DecisionNodeSerializer(nodes, many=True)

        return Response({
            'success': True,
            'message': 'Test project created successfully',
            'project': project_serializer.data,
            'nodes': nodes_serializer.data,
            'id': project.id,
            'share_token': str(project.share_token),
            'node_count': nodes.count(),
            'root_node_id': root_node.id
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response({
            'success': False,
            'error': f'Failed to create test project: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
