"""Per-case results, per-model aggregation and JSON/Markdown report output."""
import json
import math
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Sequence, Tuple

from evals.judge import JUDGE_DIMENSIONS
from evals.metrics import MetricResult


@dataclass
class CaseResult:
    case_id: str
    operation: str
    language: str
    model: str
    output: Any
    metrics: List[MetricResult]
    error: str = ''
    judge: Optional[Dict[str, Any]] = None
    latency_ms: Optional[int] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cost_usd: Optional[float] = None
    attempts: Optional[int] = None
    judge_cost_usd: float = 0.0

    @property
    def passed(self) -> bool:
        return self.output is not None and all(metric.passed for metric in self.metrics)

    @property
    def score(self) -> float:
        return mean(metric.value for metric in self.metrics) if self.metrics else 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {**asdict(self), 'passed': self.passed, 'score': round(self.score, 4)}


def percentile(values: Sequence[float], q: float) -> Optional[float]:
    """Linear-interpolated percentile, q in [0, 100]."""
    if not values:
        return None
    ordered = sorted(values)
    rank = (len(ordered) - 1) * q / 100
    low, high = math.floor(rank), math.ceil(rank)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def _avg(values: Sequence[float]) -> Optional[float]:
    return mean(values) if values else None


def summarize_model(model: str, results: Sequence[CaseResult]) -> Dict[str, Any]:
    metric_names = list(dict.fromkeys(metric.name for result in results for metric in result.metrics))
    metrics = {}
    for name in metric_names:
        values = [metric for result in results for metric in result.metrics if metric.name == name]
        metrics[name] = {
            'pass_rate': sum(metric.passed for metric in values) / len(values),
            'mean': mean(metric.value for metric in values),
            'cases': len(values),
        }

    operations = {}
    for operation in dict.fromkeys(result.operation for result in results):
        subset = [result for result in results if result.operation == operation]
        operations[operation] = {
            'cases': len(subset),
            'passed': sum(result.passed for result in subset),
            'score': mean(result.score for result in subset),
        }

    verdicts = [result.judge for result in results if result.judge]
    judge = {
        **{name: mean(verdict[name] for verdict in verdicts) for name in JUDGE_DIMENSIONS},
        'mean': mean(mean(verdict[name] for name in JUDGE_DIMENSIONS) for verdict in verdicts),
        'cases': len(verdicts),
    } if verdicts else None

    latencies = [result.latency_ms for result in results if result.latency_ms is not None]
    costs = [result.cost_usd for result in results if result.cost_usd is not None]
    return {
        'model': model,
        'cases': len(results),
        'passed_cases': sum(result.passed for result in results),
        'pass_rate': sum(result.passed for result in results) / len(results),
        'overall_score': mean(result.score for result in results),
        'call_failures': sum(result.output is None for result in results),
        'metrics': metrics,
        'operations': operations,
        'judge': judge,
        'latency_ms': {'p50': percentile(latencies, 50), 'p95': percentile(latencies, 95)} if latencies else None,
        'avg_input_tokens': _avg([r.input_tokens for r in results if r.input_tokens is not None]),
        'avg_output_tokens': _avg([r.output_tokens for r in results if r.output_tokens is not None]),
        'total_cost_usd': sum(costs) if costs else None,
        'cost_per_case_usd': _avg(costs),
        'judge_cost_usd': sum(result.judge_cost_usd for result in results),
    }


def build_report(results: Sequence[CaseResult], mode: str, judge_model: Optional[str] = None,
                 created_at: Optional[datetime] = None) -> Dict[str, Any]:
    created_at = created_at or datetime.now(UTC)
    models = list(dict.fromkeys(result.model for result in results))
    return {
        'mode': mode,
        'created_at': created_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'judge_model': judge_model,
        'case_count': len({result.case_id for result in results}),
        'models': [summarize_model(model, [r for r in results if r.model == model]) for model in models],
        'cases': [result.to_dict() for result in results],
    }


def _pct(value: Optional[float]) -> str:
    return '-' if value is None else f'{value * 100:.1f}%'


def _num(value: Optional[float], digits: int = 0) -> str:
    return '-' if value is None else f'{value:,.{digits}f}'


def _usd(value: Optional[float]) -> str:
    return '-' if value is None else f'${value:.4f}'


def _table(header: Sequence[str], rows: Sequence[Sequence[str]]) -> List[str]:
    return [
        '| ' + ' | '.join(header) + ' |',
        '|' + '|'.join('---' for _ in header) + '|',
        *('| ' + ' | '.join(row) + ' |' for row in rows),
    ]


def render_markdown(report: Dict[str, Any]) -> str:
    models = report['models']
    names = [summary['model'] for summary in models]
    lines = [
        '# Decider prompt evaluation',
        '',
        f"Mode: **{report['mode']}** | Cases: {report['case_count']} | Generated: {report['created_at']}"
        + (f" | Judge: {report['judge_model']}" if report.get('judge_model') else ''),
        '',
        '## Summary',
        '',
    ]

    def row(label: str, render) -> List[str]:
        return [label, *(render(summary) for summary in models)]

    def latency(summary: Dict[str, Any]) -> str:
        values = summary['latency_ms']
        return '-' if values is None else f"{values['p50']:,.0f} / {values['p95']:,.0f}"

    def judge(name: str):
        return lambda summary: '-' if summary['judge'] is None else f"{summary['judge'][name]:.2f}"

    summary_rows = [
        row('Overall score', lambda s: f"{s['overall_score']:.3f}"),
        row('Cases passed', lambda s: f"{s['passed_cases']}/{s['cases']} ({_pct(s['pass_rate'])})"),
        row('Call failures', lambda s: str(s['call_failures'])),
        row('Latency p50 / p95 (ms)', latency),
        row('Avg tokens in / out', lambda s: f"{_num(s['avg_input_tokens'])} / {_num(s['avg_output_tokens'])}"),
        row('Total cost', lambda s: _usd(s['total_cost_usd'])),
        row('Cost per case', lambda s: _usd(s['cost_per_case_usd'])),
        row('Judge cost', lambda s: _usd(s['judge_cost_usd']) if s['judge'] else '-'),
        *(row(f'Judge {name} (1-5)', judge(name)) for name in (*JUDGE_DIMENSIONS, 'mean')),
    ]
    lines += _table(['', *names], summary_rows)

    metric_names = list(dict.fromkeys(name for summary in models for name in summary['metrics']))
    lines += ['', '## Metric pass rate', '']
    lines += _table(['Metric', *names], [
        [name, *(
            f"{_pct(s['metrics'][name]['pass_rate'])} (n={s['metrics'][name]['cases']})" if name in s['metrics'] else '-'
            for s in models
        )]
        for name in metric_names
    ])

    operations = list(dict.fromkeys(op for summary in models for op in summary['operations']))
    lines += ['', '## By operation (passed / cases, mean score)', '']
    lines += _table(['Operation', *names], [
        [op, *(
            f"{s['operations'][op]['passed']}/{s['operations'][op]['cases']}, {s['operations'][op]['score']:.3f}"
            if op in s['operations'] else '-'
            for s in models
        )]
        for op in operations
    ])

    failures = [case for case in report['cases'] if not case['passed']]
    lines += ['', f'## Failed cases ({len(failures)})', '']
    if failures:
        lines += _table(['Case', 'Model', 'Failed metrics'], [
            [case['case_id'], case['model'], _failure_text(case)] for case in failures
        ])
    else:
        lines.append('None.')
    return '\n'.join(lines) + '\n'


def _failure_text(case: Dict[str, Any]) -> str:
    if case['output'] is None:
        return 'no output' + (f": {case['error']}" if case['error'] else '')
    parts = []
    for metric in case['metrics']:
        if not metric['passed']:
            detail = f", {metric['detail']}" if metric['detail'] else ''
            parts.append(f"{metric['name']} ({metric['value']:.2f}{detail})")
    return '; '.join(parts).replace('|', '/')


def write_report(report: Dict[str, Any], out_dir: Path) -> Tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = report['created_at'].replace('-', '').replace(':', '')
    json_path = out_dir / f"{stamp}-{report['mode']}.json"
    markdown_path = out_dir / 'latest.md'
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    markdown_path.write_text(render_markdown(report), encoding='utf-8')
    return json_path, markdown_path
