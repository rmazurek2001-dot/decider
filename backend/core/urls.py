from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CommentViewSet,
    DecisionNodeViewSet,
    ProjectViewSet,
    TaskViewSet,
    llm_calls_view,
    llm_metrics_view,
    public_project_tasks_view,
    public_project_tree_view,
    public_project_view,
    seed_test_project,
)

router = DefaultRouter()
router.register(r'projects', ProjectViewSet, basename='project')
router.register(r'decision-nodes', DecisionNodeViewSet, basename='decision-node')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'comments', CommentViewSet, basename='comment')

urlpatterns = [
    path('', include(router.urls)),
    path('public/projects/<uuid:token>/', public_project_view, name='public-project'),
    path('public/projects/<uuid:token>/tree/', public_project_tree_view, name='public-project-tree'),
    path('public/projects/<uuid:token>/tasks/', public_project_tasks_view, name='public-project-tasks'),
    path('llm/metrics/', llm_metrics_view, name='llm-metrics'),
    path('llm/calls/', llm_calls_view, name='llm-calls'),
    path('testing/seed-project/', seed_test_project, name='seed-test-project'),
]
