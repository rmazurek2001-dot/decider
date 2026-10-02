from typing import Any, Dict

from rest_framework import serializers

from core.llm.context import CRITERIA, DEFAULT_WEIGHTS

from .models import ChatMessage, Comment, DecisionNode, LLMCall, Project, Task

MAX_CRITERION_WEIGHT = 5.0


class CriteriaWeightsField(serializers.JSONField):
    def to_internal_value(self, data: Any) -> Dict[str, float]:
        data = super().to_internal_value(data)
        if not isinstance(data, dict):
            raise serializers.ValidationError('Expected an object mapping criteria to weights.')
        unknown = sorted(set(data) - set(CRITERIA))
        if unknown:
            raise serializers.ValidationError(
                f"Unknown criteria: {', '.join(unknown)}. Allowed: {', '.join(CRITERIA)}."
            )
        weights = {}
        for name, value in data.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise serializers.ValidationError(f'Weight for {name} must be a number.')
            if not 0 <= value <= MAX_CRITERION_WEIGHT:
                raise serializers.ValidationError(
                    f'Weight for {name} must be between 0 and {MAX_CRITERION_WEIGHT:g}.'
                )
            weights[name] = float(value)
        return weights

    def to_representation(self, value: Any) -> Dict[str, float]:
        return {**DEFAULT_WEIGHTS, **(value if isinstance(value, dict) else {})}


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ['id', 'node', 'title', 'is_completed', 'due_date', 'created_at']
        read_only_fields = ['created_at']


class ProjectTaskSerializer(serializers.ModelSerializer):
    """Task with its node details, used by the project-wide action board."""
    node_title = serializers.CharField(source='node.title', read_only=True)
    node_id = serializers.IntegerField(source='node.id', read_only=True)
    node_section = serializers.CharField(source='node.section', read_only=True)
    
    class Meta:
        model = Task
        fields = ['id', 'node', 'node_id', 'node_title', 'node_section', 'title', 'is_completed', 'due_date', 'created_at']
        read_only_fields = ['created_at', 'node_title', 'node_id', 'node_section']


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ['id', 'node', 'author_name', 'content', 'created_at']
        read_only_fields = ['created_at']


class DecisionNodeSerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    vote_count = serializers.SerializerMethodField()
    path_cost = serializers.SerializerMethodField()
    tasks = TaskSerializer(many=True, read_only=True)
    comments = CommentSerializer(many=True, read_only=True)
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = DecisionNode
        fields = [
            'id', 'title', 'description', 'estimated_cost', 'actual_cost',
            'parent', 'project', 'children', 'vote_count', 'path_cost',
            'score_comfort', 'score_risk', 'score_time', 'score_pleasure',
            'status', 'section', 'order', 'node_type', 'tasks', 'comments', 
            'comment_count', 'position_x', 'position_y', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'children', 'vote_count', 'path_cost', 'tasks', 'comments', 'comment_count']

    def get_children(self, obj):
        children = obj.children.all()
        return DecisionNodeSerializer(children, many=True).data

    def get_vote_count(self, obj):
        return obj.votes.count()
    
    def get_path_cost(self, obj):
        total = 0
        current = obj
        while current:
            total += float(current.estimated_cost)
            current = current.parent
        return total
    
    def get_comment_count(self, obj):
        return obj.comments.count()


class ProjectSerializer(serializers.ModelSerializer):
    decision_nodes = DecisionNodeSerializer(many=True, read_only=True)
    criteria_weights = CriteriaWeightsField(required=False)

    class Meta:
        model = Project
        fields = [
            'id', 'title', 'description', 'budget_total', 'share_token',
            'decision_nodes', 'ui_state', 'criteria_weights', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'share_token']

    def validate_criteria_weights(self, value: Dict[str, float]) -> Dict[str, float]:
        current = getattr(self.instance, 'criteria_weights', None)
        return {**DEFAULT_WEIGHTS, **(current if isinstance(current, dict) else {}), **value}


class PublicProjectSerializer(serializers.ModelSerializer):
    decision_nodes = DecisionNodeSerializer(many=True, read_only=True)
    criteria_weights = CriteriaWeightsField(read_only=True)

    class Meta:
        model = Project
        fields = [
            'id', 'title', 'description', 'budget_total',
            'decision_nodes', 'ui_state', 'criteria_weights', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class DecisionNodeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DecisionNode
        fields = [
            'id', 'title', 'description', 'estimated_cost', 'actual_cost',
            'parent', 'project',
            'score_comfort', 'score_risk', 'score_time', 'score_pleasure',
            'status', 'section', 'order', 'position_x', 'position_y'
        ]
    
    def validate(self, data):
        parent = data.get('parent')
        cost = float(data.get('estimated_cost', 0))
        project = data.get('project')
        
        if self.instance:
            project = project or self.instance.project
            parent = parent if 'parent' in data else self.instance.parent
        
        path_cost = cost
        current = parent
        while current:
            path_cost += float(current.estimated_cost)
            current = current.parent
        
        if project and path_cost > float(project.budget_total):
            raise serializers.ValidationError(
                f"Path cost ${path_cost:.2f} exceeds project budget ${project.budget_total}"
            )
        
        return data


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'project', 'role', 'content', 'created_at']
        read_only_fields = ['created_at']


class LLMCallSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMCall
        fields = [
            'id', 'created_at', 'operation', 'model', 'latency_ms', 'input_tokens', 'output_tokens',
            'cost_usd', 'attempts', 'success', 'error', 'project'
        ]
        read_only_fields = fields
