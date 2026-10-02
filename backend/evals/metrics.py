"""Deterministic output-quality metrics, grouped per operation."""
import itertools
import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple, Type, get_args

from pydantic import BaseModel, ValidationError

from core.llm.schemas import NodeStatus, OptionList, ProjectAnalysis, ProjectStructure, Section, SuggestionList
from evals.dataset import EvalCase

SCORE_KEYS = ('score_comfort', 'score_risk', 'score_time', 'score_pleasure')
ANALYSIS_LISTS = ('risks', 'missing_items', 'recommendations')
SECTIONS = frozenset(get_args(Section))
STATUSES = frozenset(get_args(NodeStatus))
DIVERSITY_FULL_L1 = 60.0
COST_TOLERANCE = 0.01

SCHEMAS: Dict[str, Type[BaseModel]] = {
    'generate_options': OptionList,
    'analyze_project': ProjectAnalysis,
    'generate_actionable_suggestions': SuggestionList,
    'build_project_from_notes': ProjectStructure,
}

PL_DIACRITICS = frozenset('ąćęłńóśźż')
PL_STOPWORDS = frozenset((
    'i w z na się nie jest są oraz dla że jak ale lub albo czy po przez od przy tak być może też już tylko '
    'bardzo ze we który która które jego jej ich bez pod nad aby żeby gdy co ten ta te tym tego tej około '
    'można warto jeśli jako także trzeba'
).split())
EN_STOPWORDS = frozenset((
    'the and of for with in is are this that your from or be will at as it an which you can more than '
    'into per should not but all while has have each their its our these those would could'
).split())
WORD_RE = re.compile(r'[^\W\d_]+')


@dataclass(frozen=True)
class MetricResult:
    name: str
    value: float
    passed: bool
    detail: str = ''


def to_float(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def as_dicts(value: Any) -> List[Mapping[str, Any]]:
    return [item for item in value if isinstance(item, Mapping)] if isinstance(value, list) else []


def normalize(text: Any) -> str:
    return ' '.join(re.sub(r'[^\w\s]', ' ', str(text or '')).casefold().split())


def _changes(suggestion: Mapping[str, Any]) -> Mapping[str, Any]:
    changes = suggestion.get('changes')
    return changes if isinstance(changes, Mapping) else {}


def structured_payload(operation: str, output: Any) -> Any:
    """Map a GeminiService return value back onto the payload of its response schema."""
    if operation == 'generate_options':
        return {'options': output}
    if operation == 'generate_actionable_suggestions':
        return {'suggestions': output}
    if operation == 'build_project_from_notes' and isinstance(output, Mapping):
        nodes = output.get('nodes')
        milestones = [
            {**node, 'options': node.get('children')} if isinstance(node, Mapping) else node
            for node in nodes
        ] if isinstance(nodes, list) else nodes
        return {'title': output.get('title'), 'description': output.get('description'), 'milestones': milestones}
    return output


def schema_valid(operation: str, output: Any) -> bool:
    try:
        SCHEMAS[operation].model_validate(structured_payload(operation, output))
    except ValidationError:
        return False
    return True


def _valid_score(value: Any) -> bool:
    number = to_float(value)
    return number is not None and number.is_integer() and 0 <= number <= 100


def score_range(items: Sequence[Mapping[str, Any]], require_all: bool = True) -> float:
    """Share of items whose scores are integers in 0..100; optionally only the scores present."""
    if not items:
        return 0.0

    def valid(item: Mapping[str, Any]) -> bool:
        keys = SCORE_KEYS if require_all else [key for key in SCORE_KEYS if item.get(key) is not None]
        return all(_valid_score(item.get(key)) for key in keys)

    return sum(valid(item) for item in items) / len(items)


def budget_respected(costs: Sequence[Optional[float]], limit: float) -> float:
    if not costs:
        return 0.0
    return sum(cost is not None and cost <= limit + COST_TOLERANCE for cost in costs) / len(costs)


def min_cost_path(milestones: Sequence[Mapping[str, Any]]) -> Optional[float]:
    """Cheapest total when one option is chosen per milestone; None if a milestone has no priced option."""
    if not milestones:
        return None
    total = 0.0
    for milestone in milestones:
        costs = [to_float(child.get('estimated_cost')) for child in as_dicts(milestone.get('children'))]
        priced = [cost for cost in costs if cost is not None]
        if not priced:
            return None
        total += min(priced)
    return total


def build_budget_respected(milestones: Sequence[Mapping[str, Any]], limit: float) -> bool:
    path = min_cost_path(milestones)
    return path is not None and path <= limit + COST_TOLERANCE


def cost_plausible(costs: Sequence[Optional[float]], budget: float, min_share: float = 0.005) -> float:
    """Share of costs that are positive and not negligibly small relative to the budget."""
    if not costs:
        return 0.0
    floor = max(budget, 0.0) * min_share
    return sum(cost is not None and cost > 0 and cost >= floor for cost in costs) / len(costs)


def option_diversity(options: Sequence[Mapping[str, Any]]) -> float:
    """Average of title uniqueness and mean pairwise L1 distance of score vectors (saturating)."""
    if len(options) < 2:
        return 0.0
    titles = [normalize(option.get('title')) for option in options]
    uniqueness = (len(set(titles)) - 1) / (len(titles) - 1)
    vectors = [[to_float(option.get(key)) or 0.0 for key in SCORE_KEYS] for option in options]
    distances = [sum(abs(a - b) for a, b in zip(u, v, strict=False)) for u, v in itertools.combinations(vectors, 2)]
    spread = min(1.0, sum(distances) / len(distances) / DIVERSITY_FULL_L1)
    return 0.5 * uniqueness + 0.5 * spread


def detect_language(text: str) -> Optional[str]:
    """Return 'pl', 'en' or None when the text carries no clear signal."""
    words = WORD_RE.findall(text.casefold())
    polish = sum(word in PL_STOPWORDS for word in words) + sum(any(c in PL_DIACRITICS for c in word) for word in words)
    english = sum(word in EN_STOPWORDS for word in words)
    if polish == english:
        return None
    return 'pl' if polish > english else 'en'


def language_match(texts: Sequence[str], expected: str) -> float:
    """Share of language-identifiable texts written in the expected language."""
    texts = [text for text in texts if isinstance(text, str) and text.strip()]
    if not texts:
        return 0.0
    detected = [language for language in map(detect_language, texts) if language]
    if not detected:
        return 1.0
    return sum(language == expected for language in detected) / len(detected)


def _alternatives(keyword: Any) -> List[str]:
    return [keyword] if isinstance(keyword, str) else list(keyword)


def missing_keywords(texts: Sequence[str], keywords: Sequence[Any]) -> List[str]:
    haystack = ' '.join(texts).casefold()
    return [
        '/'.join(_alternatives(keyword)) for keyword in keywords
        if not any(alternative.casefold() in haystack for alternative in _alternatives(keyword))
    ]


def keyword_coverage(texts: Sequence[str], keywords: Sequence[Any]) -> float:
    """Share of required keywords present; a keyword may be a list of accepted alternatives or stems."""
    if not keywords:
        return 1.0
    return 1 - len(missing_keywords(texts, keywords)) / len(keywords)


def tree_reference(texts: Sequence[str], titles: Sequence[str], required: int = 1) -> float:
    """How many distinct tree node titles the text mentions, relative to the required count."""
    if required <= 0:
        return 1.0
    haystack = normalize(' '.join(texts))
    mentioned = {title for title in map(normalize, titles) if title and title in haystack}
    return min(1.0, len(mentioned) / required)


def analysis_depth(analysis: Any, min_items: int = 2) -> float:
    if not isinstance(analysis, Mapping):
        return 0.0

    def deep(value: Any) -> bool:
        return isinstance(value, list) and sum(isinstance(i, str) and bool(i.strip()) for i in value) >= min_items

    return sum(deep(analysis.get(key)) for key in ANALYSIS_LISTS) / len(ANALYSIS_LISTS)


def reference_checks(
    suggestions: Sequence[Mapping[str, Any]], titles: Sequence[str], project_title: str = '',
) -> List[Tuple[str, bool]]:
    """(referenced title, exists in tree) for every node a suggestion points at."""
    known = {normalize(title) for title in titles}
    parents = known | {'root', normalize(project_title)}
    checks: List[Tuple[str, bool]] = []
    for suggestion in suggestions:
        if suggestion.get('action_type') == 'add_buffer_node':
            parent = suggestion.get('parent_title')
            if parent:
                checks.append((str(parent), normalize(parent) in parents))
        else:
            title = suggestion.get('node_title')
            checks.append((str(title or ''), bool(title) and normalize(title) in known))
    return checks


def grounding(suggestions: Sequence[Mapping[str, Any]], titles: Sequence[str], project_title: str = '') -> float:
    if not suggestions:
        return 0.0
    checks = reference_checks(suggestions, titles, project_title)
    return sum(ok for _, ok in checks) / len(checks) if checks else 1.0


def _consistent(suggestion: Mapping[str, Any]) -> bool:
    action = suggestion.get('action_type')
    changes = _changes(suggestion)
    if action == 'update_node_status':
        return changes.get('status') in STATUSES
    if action == 'update_node_scores':
        return any(changes.get(key) is not None for key in SCORE_KEYS)
    if action == 'update_node_cost':
        return to_float(changes.get('estimated_cost')) is not None
    if action == 'add_buffer_node':
        return bool(changes.get('title')) and to_float(changes.get('estimated_cost')) is not None
    return False


def action_consistency(suggestions: Sequence[Mapping[str, Any]]) -> float:
    """Share of suggestions whose `changes` carry the fields their action_type needs."""
    if not suggestions:
        return 0.0
    return sum(_consistent(suggestion) for suggestion in suggestions) / len(suggestions)


def cost_reduction(suggestions: Sequence[Mapping[str, Any]], nodes: Sequence[Mapping[str, Any]]) -> bool:
    """True if any suggestion lowers committed cost: cheaper cost, deselecting, or switching to a cheaper sibling."""
    by_title = {normalize(node['title']): node for node in nodes}

    def cost(node: Mapping[str, Any]) -> float:
        return float(node.get('estimated_cost') or 0)

    for suggestion in suggestions:
        node = by_title.get(normalize(suggestion.get('node_title')))
        if node is None:
            continue
        action, changes = suggestion.get('action_type'), _changes(suggestion)
        if action == 'update_node_cost':
            new_cost = to_float(changes.get('estimated_cost'))
            if new_cost is not None and new_cost < cost(node):
                return True
        elif action == 'update_node_status':
            if changes.get('status') == 'rejected' and node.get('status') == 'selected' and cost(node) > 0:
                return True
            if changes.get('status') == 'selected' and any(
                other.get('parent_id') == node.get('parent_id') and other.get('status') == 'selected'
                and cost(other) > cost(node) for other in nodes
            ):
                return True
    return False


def milestone_count(milestones: Sequence[Mapping[str, Any]], minimum: int, maximum: int) -> bool:
    return minimum <= len(milestones) <= maximum


def options_per_milestone(milestones: Sequence[Mapping[str, Any]], minimum: int, maximum: int) -> float:
    if not milestones:
        return 0.0
    return sum(minimum <= len(as_dicts(m.get('children'))) <= maximum for m in milestones) / len(milestones)


def valid_sections(milestones: Sequence[Mapping[str, Any]]) -> float:
    nodes = [*milestones, *(child for m in milestones for child in as_dicts(m.get('children')))]
    if not nodes:
        return 0.0
    return sum(node.get('section') in SECTIONS for node in nodes) / len(nodes)


def order_monotonic(milestones: Sequence[Mapping[str, Any]]) -> bool:
    """Milestone `order` never decreases in listing order and actually sequences multiple milestones."""
    orders = [to_float(m.get('order')) for m in milestones]
    if not orders or any(order is None for order in orders):
        return False
    non_decreasing = all(a <= b for a, b in zip(orders, orders[1:], strict=False))
    return non_decreasing and (len(orders) == 1 or len(set(orders)) > 1)


def _strings(*values: Any) -> List[str]:
    found: List[str] = []
    for value in values:
        if isinstance(value, str):
            found.append(value)
        elif isinstance(value, list):
            found.extend(item for item in value if isinstance(item, str))
    return found


def output_texts(operation: str, output: Any) -> List[str]:
    """Natural-language fields of an output, used for language and keyword checks."""
    if operation == 'generate_options':
        return [text for option in as_dicts(output) for text in _strings(option.get('title'), option.get('description'))]
    if operation == 'analyze_project' and isinstance(output, Mapping):
        return _strings(output.get('summary'), *(output.get(key) for key in ANALYSIS_LISTS))
    if operation == 'generate_actionable_suggestions':
        return [
            text for suggestion in as_dicts(output)
            for text in _strings(suggestion.get('reason'), suggestion.get('impact'),
                                 _changes(suggestion).get('title'), _changes(suggestion).get('description'))
        ]
    if operation == 'build_project_from_notes' and isinstance(output, Mapping):
        texts = _strings(output.get('title'), output.get('description'))
        for milestone in as_dicts(output.get('nodes')):
            texts += _strings(milestone.get('title'), milestone.get('description'))
            for child in as_dicts(milestone.get('children')):
                texts += _strings(child.get('title'), child.get('description'))
        return texts
    return []


def _score(name: str, value: float, threshold: float = 1.0, detail: str = '') -> MetricResult:
    value = min(1.0, max(0.0, float(value)))
    return MetricResult(name, round(value, 4), value >= threshold - 1e-9, detail)


def _flag(name: str, ok: bool, detail: str = '') -> MetricResult:
    return MetricResult(name, 1.0 if ok else 0.0, bool(ok), detail)


def _money(value: Optional[float]) -> str:
    return 'n/a' if value is None else f'{value:,.2f}'


def _language_and_keywords(case: EvalCase, texts: List[str]) -> Tuple[MetricResult, List[MetricResult]]:
    detected = Counter(language or 'unknown' for language in map(detect_language, texts))
    language = _score(
        'language_match', language_match(texts, case.language), case.expect.min_language_match,
        'detected ' + ', '.join(f'{k}={v}' for k, v in sorted(detected.items())),
    )
    keywords = case.expect.required_keywords
    extra = [_score(
        'keyword_coverage', keyword_coverage(texts, keywords), case.expect.min_keyword_coverage,
        'missing: ' + ', '.join(missing_keywords(texts, keywords)),
    )] if keywords else []
    return language, extra


def _options_metrics(case: EvalCase, output: Any) -> List[MetricResult]:
    options = as_dicts(output)
    texts = output_texts(case.operation, output)
    costs = [to_float(option.get('estimated_cost')) for option in options]
    remaining = case.input.budget_remaining
    limit = remaining if case.expect.max_option_cost is None else case.expect.max_option_cost
    highest = max((cost for cost in costs if cost is not None), default=None)
    language, extra = _language_and_keywords(case, texts)
    return [
        _flag('schema_valid', schema_valid(case.operation, output)),
        _score('score_range', score_range(options)),
        _score('budget_respected', budget_respected(costs, limit), detail=f'max {_money(highest)} vs limit {_money(limit)}'),
        _score('cost_plausible', cost_plausible(costs, remaining, case.expect.min_cost_share)),
        _score('option_diversity', option_diversity(options), case.expect.min_diversity),
        language,
        *extra,
    ]


def _analysis_metrics(case: EvalCase, output: Any) -> List[MetricResult]:
    texts = output_texts(case.operation, output)
    language, extra = _language_and_keywords(case, texts)
    return [
        _flag('schema_valid', schema_valid(case.operation, output)),
        _score('analysis_depth', analysis_depth(output, case.expect.min_list_items)),
        _score('tree_reference', tree_reference(texts, case.tree_titles(), case.expect.min_tree_references)),
        language,
        *extra,
    ]


def _suggestion_metrics(case: EvalCase, output: Any) -> List[MetricResult]:
    suggestions = as_dicts(output)
    texts = output_texts(case.operation, output)
    titles = case.tree_titles()
    project_title = case.input.project.title
    unknown = [title or '<missing>' for title, ok in reference_checks(suggestions, titles, project_title) if not ok]
    changes = [_changes(suggestion) for suggestion in suggestions]
    language, extra = _language_and_keywords(case, texts)
    results = [
        _flag('schema_valid', schema_valid(case.operation, output)),
        _score('grounding', grounding(suggestions, titles, project_title), detail='unknown: ' + ', '.join(unknown)),
        _score('action_consistency', action_consistency(suggestions)),
        _score('score_range', score_range(changes, require_all=False)),
        language,
    ]
    if case.expect.expect_cost_reduction:
        nodes = [node.model_dump() for node in case.input.nodes]
        results.append(_flag('cost_reduction', cost_reduction(suggestions, nodes)))
    return results + extra


def _build_metrics(case: EvalCase, output: Any) -> List[MetricResult]:
    milestones = as_dicts(output.get('nodes')) if isinstance(output, Mapping) else []
    options = [child for milestone in milestones for child in as_dicts(milestone.get('children'))]
    costs = [to_float(option.get('estimated_cost')) for option in options]
    budget = case.input.budget_total
    limit = budget if case.expect.max_total_cost is None else case.expect.max_total_cost
    expect = case.expect
    texts = output_texts(case.operation, output)
    language, extra = _language_and_keywords(case, texts)
    return [
        _flag('schema_valid', schema_valid(case.operation, output)),
        _flag('milestone_count', milestone_count(milestones, expect.min_milestones, expect.max_milestones),
              f'{len(milestones)} milestones'),
        _score('options_per_milestone', options_per_milestone(milestones, expect.min_options, expect.max_options),
               detail='options: ' + ', '.join(str(len(as_dicts(m.get('children')))) for m in milestones)),
        _score('valid_sections', valid_sections(milestones)),
        _flag('order_monotonic', order_monotonic(milestones),
              'orders: ' + ', '.join(str(m.get('order')) for m in milestones)),
        _score('score_range', score_range(options)),
        _flag('budget_respected', build_budget_respected(milestones, limit),
              f'min-cost path {_money(min_cost_path(milestones))} vs limit {_money(limit)}'),
        _score('cost_plausible', cost_plausible(costs, budget, expect.min_cost_share)),
        language,
        *extra,
    ]


EVALUATORS: Dict[str, Callable[[EvalCase, Any], List[MetricResult]]] = {
    'generate_options': _options_metrics,
    'analyze_project': _analysis_metrics,
    'generate_actionable_suggestions': _suggestion_metrics,
    'build_project_from_notes': _build_metrics,
}


def evaluate(case: EvalCase, output: Any) -> List[MetricResult]:
    return EVALUATORS[case.operation](case, output)


def failed(results: Iterable[MetricResult]) -> List[MetricResult]:
    return [result for result in results if not result.passed]
