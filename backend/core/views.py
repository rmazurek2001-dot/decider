from decimal import Decimal

from django.core.cache import cache
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from .models import ChatMessage, Comment, DecisionNode, Project, Task, Vote
from .serializers import (
    ChatMessageSerializer,
    CommentSerializer,
    DecisionNodeCreateSerializer,
    DecisionNodeSerializer,
    ProjectSerializer,
    ProjectTaskSerializer,
    PublicProjectSerializer,
    TaskSerializer,
)
from .services import template_service
from .services.ai_service import ai_service


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
    def analyze_project(self, request, pk=None):
        """
        AI Strategic Advisor - analizuje projekt i zwraca strategiczne rady
        """
        project = self.get_object()
        
        if not ai_service.enabled:
            return Response(
                {'error': 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        all_nodes = DecisionNode.objects.filter(project=project).select_related('parent')
        
        tree_summary = self._build_tree_summary(project, all_nodes)
        
        analysis = ai_service.analyze_project(
            project_title=project.title,
            project_description=project.description,
            budget_total=float(project.budget_total),
            tree_summary=tree_summary
        )
        
        if not analysis:
            total_cost = sum(float(node.estimated_cost) for node in all_nodes)
            budget_utilization = (total_cost / float(project.budget_total) * 100) if float(project.budget_total) > 0 else 0
            
            analysis = {
                "summary": f"Projekt '{project.title}' zawiera {all_nodes.count()} węzłów decyzyjnych. Całkowity szacowany koszt wynosi ${total_cost:.2f}, co stanowi {budget_utilization:.1f}% budżetu (${project.budget_total}).",
                "risks": [
                    f"Wykorzystanie budżetu: {budget_utilization:.1f}% - {'przekroczenie' if budget_utilization > 100 else 'w normie'}",
                    "Brak szczegółowej analizy AI - sprawdź konfigurację GEMINI_API_KEY",
                    "Niektóre węzły mogą wymagać dodatkowych kosztów nieprzewidzianych"
                ],
                "missing_items": [
                    "Bufor na nieprzewidziane wydatki (zalecane 10-15% budżetu)",
                    "Szczegółowa analiza ryzyk dla każdego węzła",
                    "Plan awaryjny w przypadku przekroczenia budżetu"
                ],
                "recommendations": [
                    "Skonfiguruj GEMINI_API_KEY aby uzyskać pełną analizę AI",
                    f"{'Zmniejsz koszty o ' + str(int(total_cost - float(project.budget_total))) + '$' if budget_utilization > 100 else 'Rozważ dodanie bufora bezpieczeństwa'}",
                    "Regularnie aktualizuj koszty węzłów aby utrzymać dokładność budżetu"
                ]
            }
        
        return Response(analysis, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'])
    def get_suggestions(self, request, pk=None):
        """
        AI Actionable Suggestions - generuje konkretne propozycje zmian
        """
        project = self.get_object()
        
        if not ai_service.enabled:
            return Response(
                {'error': 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        all_nodes = DecisionNode.objects.filter(project=project).select_related('parent')
        
        tree_summary = self._build_tree_summary(project, all_nodes)
        
        suggestions = ai_service.generate_actionable_suggestions(
            project_title=project.title,
            project_description=project.description,
            budget_total=float(project.budget_total),
            tree_summary=tree_summary
        )
        
        if not suggestions:
            total_cost = sum(float(node.estimated_cost) for node in all_nodes)
            budget_utilization = (total_cost / float(project.budget_total) * 100) if float(project.budget_total) > 0 else 0
            
            suggestions = []
            
            if budget_utilization > 100:
                suggestions.append({
                    "action_type": "update_node_status",
                    "node_title": "Najdroższy węzeł",
                    "node_id": None,
                    "changes": {"status": "rejected"},
                    "reason": f"Budżet przekroczony o {budget_utilization - 100:.1f}% - rozważ odrzucenie najdroższych opcji",
                    "impact": "Zmniejszenie całkowitego kosztu projektu"
                })
            
            suggestions.append({
                "action_type": "add_buffer_node",
                "parent_title": "Root",
                "parent_id": None,
                "changes": {
                    "title": "Rezerwa budżetowa",
                    "description": "Bufor na nieprzewidziane wydatki (15% budżetu)",
                    "estimated_cost": str(float(project.budget_total) * 0.15),
                    "score_comfort": 80,
                    "score_risk": 20,
                    "score_time": 90,
                    "score_pleasure": 60
                },
                "reason": "Brak AI - skonfiguruj GEMINI_API_KEY aby uzyskać pełne propozycje",
                "impact": "Zabezpieczenie przed przekroczeniem budżetu"
            })
        
        return Response(suggestions, status=status.HTTP_200_OK)
    
    def _build_tree_summary(self, project, all_nodes):
        """Zamienia strukturę drzewa na czytelny tekst dla AI"""
        summary_lines = [
            f"Project: {project.title}",
            f"Description: {project.description or 'No description'}",
            f"Total Budget: ${project.budget_total}",
            f"Total Nodes: {all_nodes.count()}",
            "",
            "Decision Tree Structure:",
        ]
        
        root_nodes = [node for node in all_nodes if node.parent is None]
        
        for root in root_nodes:
            self._add_node_to_summary(root, all_nodes, summary_lines, level=0)
        
        total_cost = sum(float(node.estimated_cost) for node in all_nodes)
        
        avg_comfort = sum(node.score_comfort for node in all_nodes) / all_nodes.count() if all_nodes.count() > 0 else 0
        avg_risk = sum(node.score_risk for node in all_nodes) / all_nodes.count() if all_nodes.count() > 0 else 0
        avg_time = sum(node.score_time for node in all_nodes) / all_nodes.count() if all_nodes.count() > 0 else 0
        avg_pleasure = sum(node.score_pleasure for node in all_nodes) / all_nodes.count() if all_nodes.count() > 0 else 0
        
        summary_lines.extend([
            "",
            f"Total Estimated Cost (all nodes): ${total_cost:.2f}",
            f"Budget Utilization: {(total_cost / float(project.budget_total) * 100 if project.budget_total else 0):.1f}%",
            "",
            "Average Scores Across All Nodes:",
            f"- Comfort: {avg_comfort:.1f}/100",
            f"- Risk: {avg_risk:.1f}/100 (lower is better)",
            f"- Time Efficiency: {avg_time:.1f}/100",
            f"- Pleasure/Joy: {avg_pleasure:.1f}/100",
        ])
        
        return "\n".join(summary_lines)
    
    def _add_node_to_summary(self, node, all_nodes, summary_lines, level):
        """Rekurencyjnie dodaje węzeł i jego dzieci do summary"""
        indent = "  " * level
        vote_info = f" ({node.votes.count()} votes)" if node.votes.count() > 0 else ""
        status_info = f" [STATUS: {node.status.upper()}]" if node.status != 'pending' else ""
        scores_info = f" [Scores: C:{node.score_comfort} R:{node.score_risk} T:{node.score_time} J:{node.score_pleasure}]"
        section_info = f" [Section: {node.section.upper()}]" if node.section != 'general' else ""
        order_info = f" [Order: {node.order}]" if node.order > 0 else ""
        
        summary_lines.append(
            f"{indent}- {node.title}: ${node.estimated_cost}{vote_info}{status_info}{scores_info}{section_info}{order_info}"
        )
        if node.description:
            summary_lines.append(f"{indent}  Description: {node.description}")
        
        children = [n for n in all_nodes if n.parent_id == node.id]
        for child in children:
            self._add_node_to_summary(child, all_nodes, summary_lines, level + 1)
    
    @action(detail=True, methods=['post'])
    def apply_suggestion(self, request, pk=None):
        """
        Aplikuje sugestię AI do projektu
        """
        project = self.get_object()
        suggestion = request.data.get('suggestion')
        
        if not suggestion:
            return Response(
                {'error': 'No suggestion provided'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        action_type = suggestion.get('action_type') or suggestion.get('type')
        
        try:
            if action_type == 'update_node_status':
                node_id = suggestion.get('node_id')
                if not node_id:
                    return Response(
                        {'error': 'node_id is required for update_node_status'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                node = DecisionNode.objects.get(id=node_id, project=project)
                changes = suggestion.get('changes', {})
                
                if 'status' in changes:
                    node.status = changes['status']
                node.save()
                
                serializer = DecisionNodeSerializer(node)
                return Response({
                    'success': True,
                    'message': f'Node status updated to {node.status}',
                    'updated_node': serializer.data
                }, status=status.HTTP_200_OK)
            
            elif action_type == 'update_node_scores':
                node_id = suggestion.get('node_id')
                if not node_id:
                    return Response(
                        {'error': 'node_id is required for update_node_scores'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                node = DecisionNode.objects.get(id=node_id, project=project)
                changes = suggestion.get('changes', {})
                
                if 'score_comfort' in changes:
                    node.score_comfort = changes['score_comfort']
                if 'score_risk' in changes:
                    node.score_risk = changes['score_risk']
                if 'score_time' in changes:
                    node.score_time = changes['score_time']
                if 'score_pleasure' in changes:
                    node.score_pleasure = changes['score_pleasure']
                
                node.save()
                
                serializer = DecisionNodeSerializer(node)
                return Response({
                    'success': True,
                    'message': 'Node scores updated successfully',
                    'updated_node': serializer.data
                }, status=status.HTTP_200_OK)
            
            elif action_type == 'update_node_cost':
                node_id = suggestion.get('node_id')
                if not node_id:
                    return Response(
                        {'error': 'node_id is required for update_node_cost'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                node = DecisionNode.objects.get(id=node_id, project=project)
                changes = suggestion.get('changes', {})
                
                if 'estimated_cost' in changes:
                    node.estimated_cost = Decimal(str(changes['estimated_cost']))
                
                node.save()
                
                serializer = DecisionNodeSerializer(node)
                return Response({
                    'success': True,
                    'message': f'Node cost updated to {node.estimated_cost}',
                    'updated_node': serializer.data
                }, status=status.HTTP_200_OK)
            
            elif action_type == 'add_buffer_node':
                parent_id = suggestion.get('parent_id')
                changes = suggestion.get('changes', {})
                
                parent = None
                if parent_id:
                    parent = DecisionNode.objects.get(id=parent_id, project=project)
                
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
                
                serializer = DecisionNodeSerializer(new_node)
                return Response({
                    'success': True,
                    'message': f'New node "{new_node.title}" created successfully',
                    'created_node': serializer.data
                }, status=status.HTTP_201_CREATED)
            
            else:
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
    def chat(self, request, pk=None):
        """
        AI Chat Assistant - ogólny chat do zarządzania projektem
        GET: Pobierz historię chatu
        POST: Wyślij wiadomość i otrzymaj odpowiedź AI
        """
        project = self.get_object()
        
        if request.method == 'GET':
            messages = ChatMessage.objects.filter(project=project)
            serializer = ChatMessageSerializer(messages, many=True)
            return Response(serializer.data)
        
        elif request.method == 'POST':
            user_message = request.data.get('message', '')
            
            if not user_message:
                return Response(
                    {'error': 'Message is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not ai_service.enabled:
                return Response(
                    {'error': 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
            
            ChatMessage.objects.create(
                project=project,
                role='user',
                content=user_message
            )
            
            all_nodes = DecisionNode.objects.filter(project=project).select_related('parent')
            tree_summary = self._build_tree_summary(project, all_nodes)
            
            recent_messages = ChatMessage.objects.filter(project=project).order_by('-created_at')[:10]
            chat_history = "\n".join([
                f"{msg.role.upper()}: {msg.content}"
                for msg in reversed(recent_messages)
            ])
            
            ai_response = ai_service.chat_with_project(
                project_title=project.title,
                project_description=project.description,
                budget_total=float(project.budget_total),
                tree_summary=tree_summary,
                chat_history=chat_history,
                user_message=user_message
            )
            
            if not ai_response:
                return Response(
                    {'error': 'Failed to get AI response. Please try again.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            assistant_message = ChatMessage.objects.create(
                project=project,
                role='assistant',
                content=ai_response
            )
            
            return Response({
                'user_message': user_message,
                'assistant_message': ai_response,
                'message_id': assistant_message.id
            })
    
    @action(detail=False, methods=['post'])
    def build_from_notes(self, request):
        """
        AI Project Builder - buduje cały projekt na podstawie notatek
        POST: { "notes": "...", "budget_total": 5000 }
        """
        notes = request.data.get('notes', '')
        budget_total = float(request.data.get('budget_total', 10000))
        
        if not notes:
            return Response(
                {'error': 'Notes are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not ai_service.enabled:
            return Response(
                {'error': 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        project_structure = ai_service.build_project_from_notes(
            notes=notes,
            budget_total=budget_total
        )
        
        if not project_structure:
            return Response(
                {'error': 'Failed to build project from notes. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        project = Project.objects.create(
            title=project_structure['title'],
            description=project_structure['description'],
            budget_total=budget_total
        )
        
        def create_nodes(nodes_data, parent=None, current_order=0):
            for node_data in nodes_data:
                node = DecisionNode.objects.create(
                    project=project,
                    parent=parent,
                    title=node_data['title'],
                    description=node_data.get('description', ''),
                    estimated_cost=node_data.get('estimated_cost', '0'),
                    section=node_data.get('section', 'general'),
                    order=node_data.get('order', current_order),
                    score_comfort=node_data.get('score_comfort', 50),
                    score_risk=node_data.get('score_risk', 50),
                    score_time=node_data.get('score_time', 50),
                    score_pleasure=node_data.get('score_pleasure', 50),
                    status='pending'
                )
                
                if 'children' in node_data and node_data['children']:
                    create_nodes(node_data['children'], parent=node, current_order=current_order)
        
        create_nodes(project_structure['nodes'])
        
        serializer = ProjectSerializer(project)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    @action(detail=False, methods=['get'])
    def templates(self, request):
        """
        Zwraca listę dostępnych szablonów projektów
        GET: /api/projects/templates/
        """
        templates = template_service.get_all_templates()
        return Response(templates, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def create_from_template(self, request):
        """
        Tworzy projekt na podstawie szablonu
        POST: { "template_id": "wedding", "title": "Moje Wesele", "budget_total": 50000 }
        """
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

        template = template_service.get_template(template_id)
        if not template:
            return Response(
                {'error': f'Template "{template_id}" not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        project_title = title if title else template['title']

        try:
            budget_decimal = Decimal(str(budget_total))
        except (ValueError, TypeError):
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
    def get_all_tasks(self, request, pk=None):
        """
        Pobiera wszystkie zadania dla danego projektu (Global Action Board)
        GET: /api/projects/{id}/get_all_tasks/
        """
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
    def analytics(self, request, pk=None):
        """
        Zwraca zagregowane dane analityczne dla projektu
        GET: /api/projects/{id}/analytics/
        """
        from django.db.models import Avg
        
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
    def generate_subnodes(self, request, pk=None):
        parent_node = self.get_object()
        
        client_ip = self._get_client_ip(request)
        cache_key = f'ai_gen_{pk}_{client_ip}'
        if cache.get(cache_key):
            return Response(
                {'error': 'Please wait 30 seconds between AI requests'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        
        if not ai_service.enabled:
            return Response(
                {'error': 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        
        project = parent_node.project
        project_context = f"Project: {project.title}. {project.description or ''}"
        budget_context = f"Total budget: ${project.budget_total}. Parent node cost: ${parent_node.estimated_cost}"
        parent_node_text = f"{parent_node.title}. {parent_node.description or ''}"
        
        ai_options = ai_service.generate_options(
            parent_node_text=parent_node_text,
            project_context=project_context,
            budget_context=budget_context
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
                    estimated_cost=Decimal(str(option['estimated_cost'])),
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
    def generate_tasks(self, request, pk=None):
        """
        Generuje zadania AI dla wybranego węzła decyzyjnego
        POST /api/decision-nodes/{id}/generate_tasks/
        """
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
            return Response(
                {'error': 'AI service is not configured. Please set GEMINI_API_KEY environment variable.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        tasks_list = ai_service.generate_tasks_for_node(
            node_title=node.title,
            node_description=node.description or ''
        )

        if not tasks_list:
            return Response(
                {'error': 'Failed to generate tasks from AI. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        cache.set(cache_key, True, 30)

        created_tasks = []
        for task_title in tasks_list:
            task = Task.objects.create(
                node=node,
                title=task_title,
                is_completed=False
            )
            created_tasks.append(task)

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
    """
    ViewSet dla zarządzania zadaniami (CRUD)
    """
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
    """
    ViewSet dla zarządzania komentarzami (CRUD)
    Publiczny dostęp - każdy może dodawać komentarze
    """
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
    """
    Publiczny endpoint dla zadań projektu (Read-Only)
    GET: /api/public/projects/<uuid:token>/tasks/
    """
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