from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from core.llm.context import DEFAULT_WEIGHTS
from core.llm.recorder import db_recorder
from core.llm.records import CallRecord
from core.models import ChatMessage, DecisionNode, LLMCall, Project, Vote
from core.views import build_tree_summary

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


def ai_enabled():
    return patch('core.views.ai_service.enabled', True)


def test_tree_summary_contains_nodes_and_averages(project, root):
    garden = DecisionNode.objects.create(project=project, parent=root, title='Garden', estimated_cost=Decimal('100'),
                                         score_comfort=90, section='accommodation', order=1)
    Vote.objects.create(node=garden, session_id='s1')

    summary = build_tree_summary(project)

    assert '- Venue: $400.00' in summary
    assert '  - Garden: $100.00 (1 votes)' in summary
    assert '[Section: ACCOMMODATION] [Order: 1]' in summary
    assert 'Budget Utilization: 50.0%' in summary
    assert '- Comfort: 70.0/100' in summary
    assert 'User Priorities (weights): comfort=1, risk=1, time=1, pleasure=1' in summary


def test_tree_summary_handles_zero_budget():
    project = Project.objects.create(title='Free', budget_total=Decimal('0'))

    summary = build_tree_summary(project)

    assert 'Budget Utilization: 0.0%' in summary


def test_node_cost_exceeding_budget_is_rejected(client, project, root):
    response = client.post('/api/decision-nodes/', {
        'project': project.id, 'parent': root.id, 'title': 'Castle', 'estimated_cost': '700.00',
    }, format='json')

    assert response.status_code == 400
    assert 'exceeds project budget' in str(response.data)


def test_ai_endpoints_return_503_when_disabled(client, project, root):
    assert client.get(f'/api/projects/{project.id}/analyze_project/').status_code == 503
    assert client.get(f'/api/projects/{project.id}/get_suggestions/').status_code == 503
    assert client.post(f'/api/decision-nodes/{root.id}/generate_subnodes/').status_code == 503
    assert client.post(f'/api/projects/{project.id}/chat/', {'message': 'hi'}, format='json').status_code == 503
    assert client.post('/api/projects/build_from_notes/', {'notes': 'n'}, format='json').status_code == 503


def test_generate_subnodes_persists_ai_options(client, project, root):
    options = [
        {'title': f'Option {i}', 'description': 'd', 'estimated_cost': 50.0,
         'score_comfort': 60, 'score_risk': 20, 'score_time': 70, 'score_pleasure': 80}
        for i in range(3)
    ]
    with ai_enabled(), patch('core.views.ai_service.generate_options', return_value=options) as generate:
        response = client.post(f'/api/decision-nodes/{root.id}/generate_subnodes/', {'language': 'pl'},
                               format='json')

    assert response.status_code == 201
    assert root.children.count() == 3
    assert root.children.first().score_pleasure == 80
    assert root.children.first().estimated_cost == Decimal('50.00')
    assert generate.call_args.kwargs['language'] == 'pl'
    assert generate.call_args.kwargs['project_id'] == project.id


@pytest.mark.parametrize(('query', 'expected'), [('?language=pl', 'pl'), ('?language=de', 'en'), ('', 'en')])
def test_analyze_project_passes_language_from_query(client, project, root, query, expected):
    analysis = {'summary': 's', 'risks': ['r'], 'missing_items': ['m'], 'recommendations': ['x']}
    with ai_enabled(), patch('core.views.ai_service.analyze_project', return_value=analysis) as analyze:
        response = client.get(f'/api/projects/{project.id}/analyze_project/{query}')

    assert response.status_code == 200
    assert response.data == analysis
    kwargs = analyze.call_args.kwargs
    assert kwargs['language'] == expected
    assert kwargs['project_id'] == project.id
    assert '- Venue: $400.00' in kwargs['tree_summary']


@pytest.mark.parametrize(('language', 'needle'), [('en', 'decision nodes'), ('pl', 'węzłów decyzyjnych')])
def test_analyze_project_falls_back_to_rules_in_requested_language(client, project, root, language, needle):
    with ai_enabled(), patch('core.views.ai_service.analyze_project', return_value=None):
        response = client.get(f'/api/projects/{project.id}/analyze_project/?language={language}')

    assert response.status_code == 200
    assert needle in response.data['summary']
    assert len(response.data['recommendations']) == 3


def test_get_suggestions_resolves_node_ids_by_title(client, project, root):
    suggestions = [
        {'action_type': 'update_node_status', 'node_title': 'venue ', 'parent_title': None,
         'changes': {'status': 'selected'}, 'reason': 'r', 'impact': 'i'},
        {'action_type': 'add_buffer_node', 'node_title': None, 'parent_title': 'Venue',
         'changes': {'title': 'Reserve', 'estimated_cost': 50.0}, 'reason': 'r', 'impact': 'i'},
    ]
    with ai_enabled(), patch('core.views.ai_service.generate_actionable_suggestions',
                             return_value=suggestions) as generate:
        response = client.get(f'/api/projects/{project.id}/get_suggestions/?language=pl')

    assert response.status_code == 200
    assert generate.call_args.kwargs['language'] == 'pl'
    assert response.data[0]['node_id'] == root.id
    assert response.data[1]['parent_id'] == root.id


def test_get_suggestions_fallback_rejects_most_expensive_when_over_budget(client, project, root):
    DecisionNode.objects.create(project=project, parent=root, title='Castle', estimated_cost=Decimal('900'))
    with ai_enabled(), patch('core.views.ai_service.generate_actionable_suggestions', return_value=None):
        response = client.get(f'/api/projects/{project.id}/get_suggestions/?language=pl')

    reject, buffer = response.data
    assert reject['action_type'] == 'update_node_status'
    assert reject['node_title'] == 'Castle'
    assert reject['node_id'] == DecisionNode.objects.get(title='Castle').id
    assert buffer['action_type'] == 'add_buffer_node'
    assert buffer['changes']['title'] == 'Rezerwa budżetowa'
    assert buffer['changes']['estimated_cost'] == 150.0


def test_get_suggestions_fallback_in_english(client, project, root):
    with ai_enabled(), patch('core.views.ai_service.generate_actionable_suggestions', return_value=None):
        response = client.get(f'/api/projects/{project.id}/get_suggestions/')

    assert [s['action_type'] for s in response.data] == ['add_buffer_node']
    assert response.data[0]['changes']['title'] == 'Budget reserve'


def test_chat_passes_language_and_history(client, project, root):
    ChatMessage.objects.create(project=project, role='user', content='Earlier question')
    with ai_enabled(), patch('core.views.ai_service.chat_with_project', return_value='Answer') as chat:
        response = client.post(f'/api/projects/{project.id}/chat/', {'message': 'Now?', 'language': 'pl'},
                               format='json')

    assert response.status_code == 200
    assert response.data['assistant_message'] == 'Answer'
    kwargs = chat.call_args.kwargs
    assert kwargs['language'] == 'pl'
    assert kwargs['chat_history'] == 'USER: Earlier question'
    assert kwargs['user_message'] == 'Now?'
    assert ChatMessage.objects.filter(project=project).count() == 3


def test_generate_tasks_passes_language(client, project, root):
    root.status = 'selected'
    root.save()
    with ai_enabled(), patch('core.views.ai_service.generate_tasks_for_node',
                             return_value=['Call', 'Sign']) as generate:
        response = client.post(f'/api/decision-nodes/{root.id}/generate_tasks/', {'language': 'pl'}, format='json')

    assert response.status_code == 201
    assert generate.call_args.kwargs['language'] == 'pl'
    assert root.tasks.count() == 2


def test_build_from_notes_creates_milestones_and_decisions(client):
    structure = {
        'title': 'Trip',
        'description': 'Weekend trip',
        'nodes': [{
            'title': 'Transport', 'description': 'Getting there', 'estimated_cost': 0.0, 'section': 'transport',
            'order': 0, 'node_type': 'milestone', 'score_comfort': 50, 'score_risk': 50, 'score_time': 50,
            'score_pleasure': 50,
            'children': [
                {'title': 'Train', 'description': 'Fast', 'estimated_cost': 120.5, 'section': 'transport', 'order': 0,
                 'node_type': 'decision', 'score_comfort': 70, 'score_risk': 10, 'score_time': 80,
                 'score_pleasure': 60, 'children': []},
                {'title': 'Car', 'description': 'Flexible', 'estimated_cost': 90, 'section': 'transport', 'order': 0,
                 'node_type': 'decision', 'score_comfort': 60, 'score_risk': 30, 'score_time': 60,
                 'score_pleasure': 70, 'children': []},
            ],
        }],
    }
    with ai_enabled(), patch('core.views.ai_service.build_project_from_notes', return_value=structure) as build:
        response = client.post('/api/projects/build_from_notes/',
                               {'notes': 'Trip to the mountains', 'budget_total': 500, 'language': 'pl'},
                               format='json')

    assert response.status_code == 201
    assert build.call_args.kwargs == {'notes': 'Trip to the mountains', 'budget_total': 500.0, 'language': 'pl',
                                      'project_id': None}
    project = Project.objects.get(id=response.data['id'])
    milestone = project.decision_nodes.get(parent=None)
    assert milestone.node_type == 'milestone' and milestone.section == 'transport'
    children = list(milestone.children.order_by('title'))
    assert [c.title for c in children] == ['Car', 'Train']
    assert all(c.node_type == 'decision' for c in children)
    assert children[1].estimated_cost == Decimal('120.50')


def test_build_from_notes_rejects_invalid_budget(client):
    with ai_enabled():
        response = client.post('/api/projects/build_from_notes/', {'notes': 'n', 'budget_total': 'abc'},
                               format='json')
    assert response.status_code == 400


def test_templates_accept_language(client):
    with patch('core.views.template_service.get_all_templates', return_value=[]) as get_all:
        assert client.get('/api/projects/templates/?language=pl').status_code == 200
    get_all.assert_called_once_with(language='pl')


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


def test_apply_suggestion_matches_node_by_title(client, project, root):
    suggestion = {'action_type': 'update_node_status', 'node_title': 'VENUE', 'node_id': None,
                  'changes': {'status': 'selected'}}

    response = client.post(f'/api/projects/{project.id}/apply_suggestion/', {'suggestion': suggestion}, format='json')

    assert response.status_code == 200
    root.refresh_from_db()
    assert root.status == 'selected'


def test_apply_suggestion_rejects_invalid_status(client, project, root):
    suggestion = {'action_type': 'update_node_status', 'node_id': root.id, 'changes': {'status': 'maybe'}}

    response = client.post(f'/api/projects/{project.id}/apply_suggestion/', {'suggestion': suggestion}, format='json')

    assert response.status_code == 400


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


def test_public_project_exposes_criteria_weights(client, project):
    response = client.get(f'/api/public/projects/{project.share_token}/')
    assert response.data['criteria_weights'] == DEFAULT_WEIGHTS


def test_criteria_weights_default_and_partial_update(client, project):
    assert client.get(f'/api/projects/{project.id}/').data['criteria_weights'] == DEFAULT_WEIGHTS

    response = client.patch(f'/api/projects/{project.id}/', {'criteria_weights': {'risk': 3}}, format='json')
    assert response.status_code == 200
    assert response.data['criteria_weights'] == {'comfort': 1.0, 'risk': 3.0, 'time': 1.0, 'pleasure': 1.0}

    response = client.patch(f'/api/projects/{project.id}/', {'criteria_weights': {'time': 0.5}}, format='json')
    project.refresh_from_db()
    assert project.criteria_weights == {'comfort': 1.0, 'risk': 3.0, 'time': 0.5, 'pleasure': 1.0}


@pytest.mark.parametrize('weights', [
    {'risk': 6},
    {'risk': -1},
    {'speed': 1},
    {'risk': 'high'},
    {'risk': True},
    [1, 2, 3],
])
def test_criteria_weights_validation(client, project, weights):
    response = client.patch(f'/api/projects/{project.id}/', {'criteria_weights': weights}, format='json')

    assert response.status_code == 400
    assert 'criteria_weights' in response.data
    project.refresh_from_db()
    assert project.criteria_weights == DEFAULT_WEIGHTS


def test_analytics_counts_selected_decisions(client, project, root):
    DecisionNode.objects.create(project=project, parent=root, title='Garden', estimated_cost=Decimal('300'),
                                status='selected')
    DecisionNode.objects.create(project=project, parent=root, title='Hall', estimated_cost=Decimal('200'),
                                status='rejected')

    data = client.get(f'/api/projects/{project.id}/analytics/').data

    assert data['decisions_summary']['selected'] == 1
    assert data['decisions_summary']['rejected'] == 1
    assert data['budget_summary']['total_estimated'] == 300


def test_analytics_weighted_score_uses_project_weights(client, project, root):
    project.criteria_weights = {'comfort': 0.0, 'risk': 1.0, 'time': 0.0, 'pleasure': 1.0}
    project.save()
    DecisionNode.objects.create(project=project, parent=root, title='A', status='selected',
                                score_comfort=10, score_risk=20, score_time=10, score_pleasure=60)
    DecisionNode.objects.create(project=project, parent=root, title='B', status='selected',
                                score_comfort=90, score_risk=40, score_time=90, score_pleasure=100)
    DecisionNode.objects.create(project=project, title='Milestone', node_type='milestone', status='selected',
                                score_risk=100, score_pleasure=0)

    data = client.get(f'/api/projects/{project.id}/analytics/').data

    # A: (80 + 60) / 2 = 70, B: (60 + 100) / 2 = 80
    assert data['weighted_score'] == 75.0


def test_analytics_weighted_score_is_zero_without_selection(client, project, root):
    assert client.get(f'/api/projects/{project.id}/analytics/').data['weighted_score'] == 0.0


def make_call(**overrides) -> LLMCall:
    values = {'operation': 'generate_options', 'model': 'gemini-2.5-flash', 'latency_ms': 100,
              'input_tokens': 10, 'output_tokens': 5, 'cost_usd': 0.001, 'attempts': 1, 'success': True}
    values.update(overrides)
    return LLMCall.objects.create(**values)


def test_llm_metrics_empty(client):
    data = client.get('/api/llm/metrics/').data

    assert data['window_days'] == 7
    assert data['totals'] == {'calls': 0, 'success_rate': 1.0, 'avg_attempts': 1.0, 'input_tokens': 0,
                              'output_tokens': 0, 'cost_usd': 0.0, 'p50_latency_ms': 0, 'p95_latency_ms': 0}
    assert data['by_operation'] == [] and data['by_model'] == []
    assert len(data['daily']) == 7
    assert data['daily'][-1] == {'date': timezone.localdate().isoformat(), 'calls': 0, 'cost_usd': 0.0, 'failures': 0}


def test_llm_metrics_aggregates_calls(client, project):
    for latency in (100, 200, 300, 400):
        make_call(latency_ms=latency, project=project)
    make_call(operation='analyze_project', model='gemini-2.5-pro', latency_ms=1000, attempts=3, success=False,
              input_tokens=50, output_tokens=0, cost_usd=0.01, error='ValidationError')
    old = make_call(latency_ms=99999)
    LLMCall.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=30))

    data = client.get('/api/llm/metrics/?days=7').data

    totals = data['totals']
    assert totals['calls'] == 5
    assert totals['success_rate'] == 0.8
    assert totals['avg_attempts'] == 1.4
    assert totals['input_tokens'] == 90 and totals['output_tokens'] == 20
    assert totals['cost_usd'] == pytest.approx(0.014)
    assert totals['p50_latency_ms'] == 300
    assert totals['p95_latency_ms'] == 880

    options, analysis = data['by_operation']
    assert options['operation'] == 'generate_options' and options['calls'] == 4
    assert options['success_rate'] == 1.0
    assert options['p50_latency_ms'] == 250 and options['p95_latency_ms'] == 385
    assert analysis == {'operation': 'analyze_project', 'calls': 1, 'success_rate': 0.0, 'avg_attempts': 3.0,
                        'input_tokens': 50, 'output_tokens': 0, 'cost_usd': 0.01, 'p50_latency_ms': 1000,
                        'p95_latency_ms': 1000}

    assert data['by_model'] == [
        {'model': 'gemini-2.5-flash', 'calls': 4, 'cost_usd': 0.004, 'p50_latency_ms': 250},
        {'model': 'gemini-2.5-pro', 'calls': 1, 'cost_usd': 0.01, 'p50_latency_ms': 1000},
    ]
    today = data['daily'][-1]
    assert today['calls'] == 5 and today['failures'] == 1
    assert today['cost_usd'] == pytest.approx(0.014)


@pytest.mark.parametrize(('days', 'expected'), [('0', 1), ('500', 90), ('abc', 7), ('30', 30)])
def test_llm_metrics_clamps_window(client, days, expected):
    data = client.get(f'/api/llm/metrics/?days={days}').data
    assert data['window_days'] == expected
    assert len(data['daily']) == expected


def test_llm_calls_lists_newest_first_with_limit(client, project):
    first = make_call(operation='first', project=project)
    make_call(operation='second', success=False, error='boom')
    LLMCall.objects.filter(pk=first.pk).update(created_at=timezone.now() - timedelta(hours=1))

    data = client.get('/api/llm/calls/').data
    assert [c['operation'] for c in data] == ['second', 'first']
    assert set(data[0]) == {'id', 'created_at', 'operation', 'model', 'latency_ms', 'input_tokens',
                            'output_tokens', 'cost_usd', 'attempts', 'success', 'error', 'project'}
    assert data[0]['error'] == 'boom' and data[0]['project'] is None
    assert data[1]['project'] == project.id

    assert len(client.get('/api/llm/calls/?limit=1').data) == 1
    assert len(client.get('/api/llm/calls/?limit=0').data) == 1


def test_db_recorder_persists_and_handles_missing_project(project):
    db_recorder(CallRecord(operation='analyze_project', model='gemini-2.5-flash', latency_ms=12, input_tokens=3,
                           output_tokens=4, cost_usd=0.5, attempts=2, success=False, error='x',
                           project_id=project.id))
    db_recorder(CallRecord(operation='chat_with_project', model='gemini-2.5-flash', latency_ms=1, input_tokens=0,
                           output_tokens=0, cost_usd=0.0, attempts=1, success=True, project_id=987654))

    calls = list(LLMCall.objects.order_by('id'))
    assert calls[0].project_id == project.id and calls[0].attempts == 2 and not calls[0].success
    assert calls[1].project_id is None


def test_db_recorder_never_raises():
    with patch('core.models.LLMCall.objects.create', side_effect=RuntimeError('db down')):
        db_recorder(CallRecord(operation='x', model='m', latency_ms=1, input_tokens=0, output_tokens=0,
                               cost_usd=0.0, attempts=1, success=True))
