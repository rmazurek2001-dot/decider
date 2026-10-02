import json
from types import SimpleNamespace
from typing import List

import pytest

from core.services.ai_service import (
    MAX_ATTEMPTS,
    GeminiService,
    strip_code_fences,
    validate_analysis,
    validate_options,
    validate_project_structure,
    validate_suggestions,
)


def make_option(**overrides):
    option = {
        'title': 'Option',
        'description': 'Description',
        'estimated_cost': '100.00',
        'score_comfort': 50,
        'score_risk': 50,
        'score_time': 50,
        'score_pleasure': 50,
    }
    option.update(overrides)
    return option


class FakeModel:
    def __init__(self, responses: List[str]) -> None:
        self.responses = list(responses)
        self.calls = 0

    def generate_content(self, prompt: str) -> SimpleNamespace:
        self.calls += 1
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return SimpleNamespace(text=response)


def make_service(responses: List[str]) -> GeminiService:
    service = GeminiService.__new__(GeminiService)
    service.api_key = 'test'
    service.enabled = True
    service.model = FakeModel(responses)
    return service


@pytest.mark.parametrize('raw', [
    '{"a": 1}',
    '```json\n{"a": 1}\n```',
    '```\n{"a": 1}\n```',
    '  {"a": 1}  ',
])
def test_strip_code_fences(raw):
    assert json.loads(strip_code_fences(raw)) == {'a': 1}


def test_validate_options_accepts_three_valid_options():
    assert validate_options([make_option(), make_option(), make_option()])


@pytest.mark.parametrize('options', [
    [make_option(), make_option()],
    [make_option(), make_option(), make_option(score_risk=101)],
    [make_option(), make_option(), make_option(estimated_cost='abc')],
    [make_option(), make_option(), {'title': 'missing keys'}],
    {'not': 'a list'},
])
def test_validate_options_rejects_invalid(options):
    assert not validate_options(options)


def test_validate_analysis():
    valid = {'summary': 's', 'risks': [], 'missing_items': [], 'recommendations': []}
    assert validate_analysis(valid)
    assert not validate_analysis({**valid, 'risks': 'not a list'})
    assert not validate_analysis({'summary': 's'})


def test_validate_suggestions():
    assert validate_suggestions([{'action_type': 'x', 'reason': 'r', 'impact': 'i', 'changes': {}}])
    assert not validate_suggestions([{'action_type': 'x'}])
    assert not validate_suggestions({'action_type': 'x'})


def test_validate_project_structure():
    assert validate_project_structure({'title': 't', 'description': 'd', 'nodes': []})
    assert not validate_project_structure({'title': 't', 'description': 'd', 'nodes': {}})


def test_disabled_service_returns_none(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    service = GeminiService()
    assert not service.enabled
    assert service.generate_options('parent', 'ctx', 'budget') is None
    assert service.chat_with_project('t', 'd', 1.0, 'tree', '', 'hi') is None


def test_generate_options_retries_until_schema_is_valid():
    invalid = json.dumps([make_option(), make_option(), make_option(score_time=500)])
    valid = json.dumps([make_option(), make_option(), make_option()])
    service = make_service(['not json', invalid, f'```json\n{valid}\n```'])

    result = service.generate_options('parent', 'ctx', 'budget')

    assert result is not None and len(result) == 3
    assert service.model.calls == 3


def test_generate_json_gives_up_after_max_attempts():
    service = make_service(['nope'] * MAX_ATTEMPTS)
    assert service.analyze_project('t', 'd', 1.0, 'tree') is None
    assert service.model.calls == MAX_ATTEMPTS


def test_generate_text_recovers_from_api_error():
    service = make_service([RuntimeError('boom'), 'Hello!'])
    assert service.chat_with_project('t', 'd', 1.0, 'tree', '', 'hi') == 'Hello!'


def test_generate_tasks_for_node_truncates_to_five():
    tasks = json.dumps({'tasks': [f'Task {i}' for i in range(7)]})
    service = make_service(['{"tasks": []}', tasks])

    result = service.generate_tasks_for_node('Venue', 'Book the venue')

    assert result == [f'Task {i}' for i in range(5)]
    assert service.model.calls == 2
