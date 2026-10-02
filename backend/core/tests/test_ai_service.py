import json
from typing import Any, Dict, List

import pytest
from google.genai import errors

from core.llm import prompts
from core.llm.client import DEFAULT_MODEL, LLMClient
from core.llm.pricing import PRICING, cost_usd
from core.llm.records import CallRecord
from core.llm.schemas import OptionList, ProjectStructure, SuggestionList, TaskList
from core.services.ai_service import GeminiService
from core.tests.fakes import FakeGenaiClient, FakeResponse, FakeUsage


def make_option(**overrides: Any) -> Dict[str, Any]:
    option = {
        'title': 'Option',
        'description': 'Description',
        'estimated_cost': 100.0,
        'score_comfort': 50,
        'score_risk': 50,
        'score_time': 50,
        'score_pleasure': 50,
    }
    option.update(overrides)
    return option


def options_json(*options: Dict[str, Any]) -> str:
    return json.dumps({'options': list(options) or [make_option(), make_option(), make_option()]})


def make_client(responses: List[Any], max_attempts: int = 3, model: str = 'gemini-2.5-flash'):
    records: List[CallRecord] = []
    fake = FakeGenaiClient(responses)
    client = LLMClient(model=model, recorder=records.append, max_attempts=max_attempts,
                       genai_client=fake, retry_backoff_s=0)
    return client, fake, records


def test_structured_output_uses_parsed_instance():
    parsed = OptionList.model_validate_json(options_json())
    client, fake, records = make_client([FakeResponse(text=None, parsed=parsed, usage=FakeUsage(10, 5))])

    result = client.generate_structured('generate_options', 'prompt', OptionList, system_instruction='sys',
                                        temperature=0.2, project_id=7)

    assert result is parsed
    config = fake.models.calls[0]['config']
    assert config.response_mime_type == 'application/json'
    assert config.response_schema is OptionList
    assert config.system_instruction == 'sys'
    assert config.temperature == 0.2
    assert fake.models.calls[0]['model'] == 'gemini-2.5-flash'
    assert records[0].success and records[0].attempts == 1 and records[0].project_id == 7


def test_structured_output_falls_back_to_text_validation():
    client, _, records = make_client([FakeResponse(text=options_json(), parsed={'options': []})])

    result = client.generate_structured('generate_options', 'prompt', OptionList)

    assert isinstance(result, OptionList)
    assert len(result.options) == 3
    assert records[0].success


def test_retries_on_invalid_output_then_succeeds():
    invalid_scores = options_json(make_option(), make_option(), make_option(score_time=500))
    client, fake, records = make_client([
        FakeResponse(text='not json', usage=FakeUsage(10, 2)),
        FakeResponse(text=invalid_scores, usage=FakeUsage(10, 3)),
        FakeResponse(text=options_json(), usage=FakeUsage(10, 4, thoughts=6)),
    ])

    result = client.generate_structured('generate_options', 'prompt', OptionList)

    assert result is not None
    assert len(fake.models.calls) == 3
    assert len(records) == 1
    record = records[0]
    assert record.success and record.attempts == 3 and record.error == ''
    assert record.input_tokens == 30
    assert record.output_tokens == 15


def test_retries_on_api_error_and_empty_response():
    client, fake, records = make_client([
        errors.ServerError(503, {'error': {'message': 'overloaded'}}),
        FakeResponse(text='   '),
        FakeResponse(text=json.dumps({'tasks': ['Book venue']})),
    ])

    result = client.generate_structured('generate_tasks_for_node', 'prompt', TaskList)

    assert result.tasks == ['Book venue']
    assert records[0].attempts == 3 and records[0].success


def test_gives_up_after_max_attempts_and_records_failure():
    client, fake, records = make_client([FakeResponse(text='nope', usage=FakeUsage(4, 1))] * 2, max_attempts=2)

    assert client.generate_structured('analyze_project', 'prompt', OptionList, project_id=3) is None
    assert len(fake.models.calls) == 2
    assert len(records) == 1
    record = records[0]
    assert not record.success
    assert record.attempts == 2
    assert record.input_tokens == 8 and record.output_tokens == 2
    assert 'ValidationError' in record.error
    assert record.project_id == 3


def test_does_not_retry_non_retryable_client_error():
    client, fake, records = make_client([errors.ClientError(400, {'error': {'message': 'bad request'}})])

    assert client.generate_structured('analyze_project', 'prompt', OptionList) is None
    assert len(fake.models.calls) == 1
    assert records[0].attempts == 1 and not records[0].success
    assert 'ClientError' in records[0].error


def test_generate_text_strips_and_records():
    client, _, records = make_client([RuntimeError('boom'), FakeResponse(text='  Hello!  ', usage=FakeUsage(3, 2))])

    assert client.generate_text('chat_with_project', 'hi') == 'Hello!'
    assert records[0].attempts == 2 and records[0].success
    assert records[0].input_tokens == 3 and records[0].output_tokens == 2


def test_missing_usage_metadata_counts_as_zero():
    client, _, records = make_client([FakeResponse(text='ok', usage=FakeUsage(None, None))])

    client.generate_text('chat_with_project', 'hi')

    assert records[0].input_tokens == 0 and records[0].output_tokens == 0 and records[0].cost_usd == 0.0


def test_cost_is_computed_from_pricing_table():
    client, _, records = make_client([FakeResponse(text='ok', usage=FakeUsage(1_000_000, 200_000))],
                                     model='gemini-2.5-flash')

    client.generate_text('chat_with_project', 'hi')

    input_price, output_price = PRICING['gemini-2.5-flash']
    assert records[0].cost_usd == pytest.approx(input_price + output_price * 0.2)


def test_recorder_failure_does_not_break_call():
    def broken_recorder(record: CallRecord) -> None:
        raise RuntimeError('db down')

    client = LLMClient(recorder=broken_recorder, genai_client=FakeGenaiClient([FakeResponse(text='ok')]))

    assert client.generate_text('chat_with_project', 'hi') == 'ok'


@pytest.mark.parametrize(('model', 'expected'), [
    ('gemini-2.5-flash', 0.30 + 2.50),
    ('models/gemini-2.5-pro', 1.25 + 10.00),
    ('gemini-2.5-flash-lite-preview-06-17', 0.10 + 0.40),
    ('unknown-model', 0.0),
])
def test_cost_usd(model: str, expected: float):
    assert cost_usd(model, 1_000_000, 1_000_000) == pytest.approx(expected)


def test_client_disabled_without_api_key():
    client = LLMClient()

    assert not client.enabled
    assert client.model == DEFAULT_MODEL
    assert client.generate_text('chat_with_project', 'hi') is None


def test_model_resolves_from_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv('GEMINI_MODEL', 'models/gemini-2.5-pro')
    assert LLMClient().model == 'gemini-2.5-pro'


def test_disabled_service_returns_none():
    service = GeminiService(LLMClient())

    assert not service.enabled
    assert service.generate_options('parent', 'ctx', 'budget') is None
    assert service.chat_with_project('t', 'd', 1.0, 'tree', '', 'hi') is None
    assert service.build_project_from_notes('notes', 100.0) is None


def make_service(responses: List[Any]):
    client, fake, records = make_client(responses)
    return GeminiService(client), fake, records


def test_generate_options_returns_dicts_and_passes_language():
    service, fake, records = make_service([FakeResponse(text=options_json())])

    result = service.generate_options('parent', 'ctx', 'budget', language='pl', project_id=5)

    assert len(result) == 3 and result[0]['score_risk'] == 50
    prompt = fake.models.calls[0]['contents']
    assert prompt.endswith(prompts.language_instruction('pl'))
    assert 'Polish' in prompt
    assert fake.models.calls[0]['config'].system_instruction == prompts.SYSTEM_INSTRUCTION
    assert records[0].operation == 'generate_options' and records[0].project_id == 5


def test_suggestions_drop_empty_changes():
    payload = SuggestionList.model_validate({'suggestions': [{
        'action_type': 'update_node_status', 'node_title': 'Venue', 'parent_title': None,
        'changes': {'status': 'selected'}, 'reason': 'r', 'impact': 'i',
    }]})
    service, _, _ = make_service([FakeResponse(parsed=payload)])

    result = service.generate_actionable_suggestions('t', 'd', 1.0, 'tree')

    assert result == [{'action_type': 'update_node_status', 'node_title': 'Venue', 'parent_title': None,
                       'changes': {'status': 'selected'}, 'reason': 'r', 'impact': 'i'}]


def test_build_project_from_notes_returns_milestones_with_decisions():
    structure = ProjectStructure.model_validate({
        'title': 'Trip', 'description': 'Weekend trip',
        'milestones': [{
            'title': 'Transport', 'description': 'Getting there', 'section': 'transport', 'order': 1,
            'options': [make_option(title='Train'), make_option(title='Car', estimated_cost=80.0)],
        }],
    })
    service, _, _ = make_service([FakeResponse(parsed=structure)])

    result = service.build_project_from_notes('notes', 500.0, language='en')

    assert result['title'] == 'Trip'
    milestone = result['nodes'][0]
    assert milestone['node_type'] == 'milestone' and milestone['estimated_cost'] == 0.0
    assert milestone['section'] == 'transport' and milestone['order'] == 1
    assert [child['title'] for child in milestone['children']] == ['Train', 'Car']
    assert all(child['node_type'] == 'decision' and child['section'] == 'transport' and child['children'] == []
               for child in milestone['children'])


def test_generate_tasks_strips_blank_items():
    service, _, _ = make_service([FakeResponse(text=json.dumps({'tasks': [' Call venue ', ' ', 'Sign contract']}))])

    assert service.generate_tasks_for_node('Venue', 'Book it') == ['Call venue', 'Sign contract']


def test_chat_prompt_contains_context_and_language():
    service, fake, _ = make_service([FakeResponse(text='Sure')])

    assert service.chat_with_project('t', 'd', 1.0, 'TREE', 'USER: hi', 'What next?', language='pl') == 'Sure'

    prompt = fake.models.calls[0]['contents']
    assert 'TREE' in prompt and 'USER: hi' in prompt and 'What next?' in prompt
    assert prompt.endswith('Write the whole reply in Polish.')
    assert fake.models.calls[0]['config'].response_schema is None


@pytest.mark.parametrize('render', [
    lambda lang: prompts.options_prompt('p', 'c', 'b', lang),
    lambda lang: prompts.analysis_prompt('tree', lang),
    lambda lang: prompts.suggestions_prompt('tree', lang),
    lambda lang: prompts.project_builder_prompt('notes {with braces}', 1000.0, lang),
    lambda lang: prompts.tasks_prompt('Venue', '', lang),
])
@pytest.mark.parametrize(('language', 'name'), [('en', 'English'), ('pl', 'Polish')])
def test_structured_prompts_end_with_language_instruction(render, language: str, name: str):
    prompt = render(language)
    assert prompt.endswith(prompts.language_instruction(language))
    assert f'in {name}.' in prompt
