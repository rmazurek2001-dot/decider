from decimal import Decimal
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from core.models import DecisionNode, Project
from core.views import ProjectViewSet

pytestmark = pytest.mark.django_db


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def project() -> Project:
    return Project.objects.create(title='Wedding', description='Summer', budget_total=Decimal('1000'))


@pytest.fixture
def root(project: Project) -> DecisionNode:
    return DecisionNode.objects.create(project=project, title='Venue', estimated_cost=Decimal('400'))


def test_tree_summary_contains_nodes_and_averages(project, root):
    DecisionNode.objects.create(project=project, parent=root, title='Garden', estimated_cost=Decimal('100'),
                                score_comfort=90, section='accommodation', order=1)
    nodes = DecisionNode.objects.filter(project=project).select_related('parent')

    summary = ProjectViewSet()._build_tree_summary(project, nodes)

    assert '- Venue: $400.00' in summary
    assert '  - Garden: $100.00' in summary
    assert '[Section: ACCOMMODATION] [Order: 1]' in summary
    assert 'Budget Utilization: 50.0%' in summary
    assert '- Comfort: 70.0/100' in summary


def test_tree_summary_handles_zero_budget():
    project = Project.objects.create(title='Free', budget_total=Decimal('0'))
    nodes = DecisionNode.objects.filter(project=project)

    summary = ProjectViewSet()._build_tree_summary(project, nodes)

    assert 'Budget Utilization: 0.0%' in summary


def test_node_cost_exceeding_budget_is_rejected(client, project, root):
    response = client.post('/api/decision-nodes/', {
        'project': project.id, 'parent': root.id, 'title': 'Castle', 'estimated_cost': '700.00',
    }, format='json')

    assert response.status_code == 400
    assert 'exceeds project budget' in str(response.data)


def test_ai_endpoints_return_503_when_disabled(client, project, root):
    with patch('core.views.ai_service.enabled', False):
        assert client.get(f'/api/projects/{project.id}/analyze_project/').status_code == 503
        assert client.post(f'/api/decision-nodes/{root.id}/generate_subnodes/').status_code == 503


def test_generate_subnodes_persists_ai_options(client, project, root):
    options = [
        {'title': f'Option {i}', 'description': 'd', 'estimated_cost': '50.00',
         'score_comfort': 60, 'score_risk': 20, 'score_time': 70, 'score_pleasure': 80}
        for i in range(3)
    ]
    with patch('core.views.ai_service.enabled', True), \
            patch('core.views.ai_service.generate_options', return_value=options):
        response = client.post(f'/api/decision-nodes/{root.id}/generate_subnodes/')

    assert response.status_code == 201
    assert root.children.count() == 3
    assert root.children.first().score_pleasure == 80


def test_apply_suggestion_add_buffer_node(client, project):
    suggestion = {
        'action_type': 'add_buffer_node',
        'parent_id': None,
        'changes': {'title': 'Reserve', 'estimated_cost': '150.00', 'score_risk': 10},
    }

    response = client.post(f'/api/projects/{project.id}/apply_suggestion/', {'suggestion': suggestion}, format='json')

    assert response.status_code == 201
    node = project.decision_nodes.get(title='Reserve')
    assert node.estimated_cost == Decimal('150.00')
    assert node.score_risk == 10
    assert node.section == 'other'


def test_apply_suggestion_unknown_action(client, project):
    response = client.post(f'/api/projects/{project.id}/apply_suggestion/',
                           {'suggestion': {'action_type': 'drop_database'}}, format='json')
    assert response.status_code == 400


def test_vote_is_unique_per_session(client, root):
    url = f'/api/decision-nodes/{root.id}/vote/'
    assert client.post(url, {'session_id': 'abc'}, format='json').status_code == 201
    assert client.post(url, {'session_id': 'abc'}, format='json').status_code == 400
    assert client.post(url, {}, format='json').status_code == 400


def test_public_view_by_share_token(client, project, root):
    response = client.get(f'/api/public/projects/{project.share_token}/tree/')
    assert response.status_code == 200
    assert response.data[0]['title'] == 'Venue'


def test_analytics_counts_selected_decisions(client, project, root):
    DecisionNode.objects.create(project=project, parent=root, title='Garden', estimated_cost=Decimal('300'),
                                status='selected')
    DecisionNode.objects.create(project=project, parent=root, title='Hall', estimated_cost=Decimal('200'),
                                status='rejected')

    data = client.get(f'/api/projects/{project.id}/analytics/').data

    assert data['decisions_summary']['selected'] == 1
    assert data['decisions_summary']['rejected'] == 1
    assert data['budget_summary']['total_estimated'] == 300
