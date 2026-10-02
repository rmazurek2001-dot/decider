"""Prompt evaluation CLI: `python -m evals.run` (offline fixtures) or `python -m evals.run --live`."""
import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, List, Optional, Sequence, Tuple

from core.llm.context import format_tree_summary
from core.llm.records import CallRecord, Recorder
from evals.dataset import (
    EVALS_DIR,
    FIXTURES_DIR,
    EvalCase,
    NotesInput,
    OptionsInput,
    load_cases,
    load_fixture,
    select_cases,
)
from evals.judge import DEFAULT_JUDGE_MODEL, judge_output
from evals.metrics import evaluate
from evals.report import CaseResult, build_report, render_markdown, write_report

DEFAULT_MODELS = 'gemini-2.5-flash'
FIXTURE_MODEL = 'fixture'

ClientFactory = Callable[[str, Recorder], Any]
ServiceFactory = Callable[[Any], Any]


class RecordCollector:
    """In-memory Recorder; never touches the database."""

    def __init__(self) -> None:
        self.records: List[CallRecord] = []

    def __call__(self, record: CallRecord) -> None:
        self.records.append(record)


def run_offline(cases: Sequence[EvalCase], fixtures_dir: Path = FIXTURES_DIR) -> List[CaseResult]:
    results = []
    for case in cases:
        output = load_fixture(case.id, fixtures_dir).get('output')
        results.append(CaseResult(
            case_id=case.id, operation=case.operation, language=case.language, model=FIXTURE_MODEL,
            output=output, metrics=evaluate(case, output),
        ))
    return results


def invoke(service: Any, case: EvalCase) -> Any:
    """Call the GeminiService method under test with the case input."""
    data, language = case.input, case.language
    if isinstance(data, OptionsInput):
        return service.generate_options(
            parent_node_text=data.parent_node_text, project_context=data.project_context,
            budget_context=data.budget_context, language=language,
        )
    if isinstance(data, NotesInput):
        return service.build_project_from_notes(notes=data.notes, budget_total=data.budget_total, language=language)
    nodes = [node.model_dump() for node in data.nodes]
    return getattr(service, case.operation)(
        project_title=data.project.title,
        project_description=data.project.description,
        budget_total=data.project.budget_total,
        tree_summary=format_tree_summary(data.project.model_dump(), nodes, data.weights),
        language=language,
    )


def _run_live_case(case: EvalCase, model: str, client_factory: ClientFactory, service_factory: ServiceFactory,
                   judge_model: Optional[str]) -> CaseResult:
    calls = RecordCollector()
    service = service_factory(client_factory(model, calls))
    started = time.perf_counter()
    error = ''
    try:
        output = invoke(service, case)
    except Exception as exc:
        output, error = None, f'{type(exc).__name__}: {exc}'
    wall_ms = round((time.perf_counter() - started) * 1000)
    if output is None and not error:
        error = next((record.error for record in reversed(calls.records) if record.error), 'service returned None')

    verdict, judge_calls = None, RecordCollector()
    if judge_model and output is not None:
        verdict = judge_output(client_factory(judge_model, judge_calls), case, output)

    records = calls.records
    return CaseResult(
        case_id=case.id, operation=case.operation, language=case.language, model=model,
        output=output, metrics=evaluate(case, output), error=error,
        judge=verdict.model_dump() if verdict else None,
        latency_ms=sum(record.latency_ms for record in records) if records else wall_ms,
        input_tokens=sum(record.input_tokens for record in records),
        output_tokens=sum(record.output_tokens for record in records),
        cost_usd=sum(record.cost_usd for record in records),
        attempts=sum(record.attempts for record in records),
        judge_cost_usd=sum(record.cost_usd for record in judge_calls.records),
    )


def run_live(cases: Sequence[EvalCase], models: Sequence[str], client_factory: ClientFactory,
             service_factory: ServiceFactory, judge_model: Optional[str] = None, workers: int = 1) -> List[CaseResult]:
    jobs = [(case, model) for model in models for case in cases]
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return list(pool.map(
            lambda job: _run_live_case(job[0], job[1], client_factory, service_factory, judge_model), jobs,
        ))


def _setup_django() -> None:
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.test_settings')
    import django

    django.setup()


def gemini_factories() -> Tuple[ClientFactory, ServiceFactory]:
    from core.llm.client import LLMClient
    from core.services.ai_service import GeminiService

    def client_factory(model: str, recorder: Recorder) -> Any:
        return LLMClient(model=model, recorder=recorder)

    return client_factory, lambda client: GeminiService(client=client)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog='python -m evals.run', description='Evaluate Decider LLM prompts.')
    parser.add_argument('--live', action='store_true', help='call Gemini instead of replaying fixtures')
    parser.add_argument('--models', default=DEFAULT_MODELS, help='comma-separated models to compare (live)')
    parser.add_argument('--judge-model', default=DEFAULT_JUDGE_MODEL, help='model for LLM-as-judge (live)')
    parser.add_argument('--no-judge', action='store_true', help='skip LLM-as-judge scoring')
    parser.add_argument('--cases', default='', help='operation names and/or case-id globs, comma-separated')
    parser.add_argument('--workers', type=int, default=1, help='parallel live cases')
    parser.add_argument('--out', default=str(EVALS_DIR / 'reports'), help='report directory')
    parser.add_argument('--fail-under', type=float, default=None,
                        help='exit 1 if any model overall score is below this value')
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(errors='replace')

    cases = select_cases(load_cases(), args.cases)
    if not cases:
        print(f'No cases match {args.cases!r}.', file=sys.stderr)
        return 2

    judge_model = None
    if args.live:
        _setup_django()
        if not os.getenv('GEMINI_API_KEY'):
            print('--live requires GEMINI_API_KEY in the environment; run without --live to replay fixtures.',
                  file=sys.stderr)
            return 2
        models = [model.strip() for model in args.models.split(',') if model.strip()]
        judge_model = None if args.no_judge else args.judge_model
        client_factory, service_factory = gemini_factories()
        results = run_live(cases, models, client_factory, service_factory, judge_model, args.workers)
    else:
        results = run_offline(cases)

    report = build_report(results, mode='live' if args.live else 'offline', judge_model=judge_model)
    json_path, markdown_path = write_report(report, Path(args.out))
    print(render_markdown(report))
    print(f'Report: {json_path}\nSummary: {markdown_path}')

    if args.fail_under is not None and any(m['overall_score'] < args.fail_under for m in report['models']):
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
