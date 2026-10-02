from django.contrib import admin

from .models import DecisionNode, LLMCall, Project, Vote


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['title', 'budget_total', 'share_token', 'created_at']
    search_fields = ['title', 'description']
    readonly_fields = ['share_token']


@admin.register(DecisionNode)
class DecisionNodeAdmin(admin.ModelAdmin):
    list_display = ['title', 'project', 'parent', 'estimated_cost']
    list_filter = ['project', 'created_at']
    search_fields = ['title', 'description']


@admin.register(Vote)
class VoteAdmin(admin.ModelAdmin):
    list_display = ['node', 'session_id', 'ip_address', 'created_at']
    list_filter = ['created_at', 'node__project']
    search_fields = ['node__title', 'session_id']


@admin.register(LLMCall)
class LLMCallAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'operation', 'model', 'success', 'attempts', 'latency_ms',
                    'input_tokens', 'output_tokens', 'cost_usd', 'project']
    list_filter = ['operation', 'model', 'success', 'created_at']
    search_fields = ['operation', 'model', 'error']
    date_hierarchy = 'created_at'

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False
