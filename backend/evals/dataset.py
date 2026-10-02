"""Evaluation case schema, loading and selection."""
import fnmatch
import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Sequence, get_args

from pydantic import BaseModel, ConfigDict, Field, model_validator

from core.llm.schemas import Language, NodeStatus, Section

EVALS_DIR = Path(__file__).resolve().parent
CASES_DIR = EVALS_DIR / 'cases'
FIXTURES_DIR = EVALS_DIR / 'fixtures'

Operation = Literal[
    'generate_options', 'analyze_project', 'generate_actionable_suggestions', 'build_project_from_notes',
]
OPERATIONS = get_args(Operation)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class OptionsInput(StrictModel):
    parent_node_text: str
    project_context: str
    budget_context: str
    budget_remaining: float = Field(ge=0)


class ProjectInfo(StrictModel):
    title: str
    description: str = ''
    budget_total: float = Field(ge=0)


class TreeNode(StrictModel):
    id: int
    parent_id: Optional[int] = None
    title: str
    description: str = ''
    estimated_cost: float = Field(default=0, ge=0)
    status: NodeStatus = 'pending'
    section: Section = 'general'
    order: int = Field(default=0, ge=0)
    node_type: Literal['milestone', 'decision'] = 'decision'
    score_comfort: int = Field(default=50, ge=0, le=100)
    score_risk: int = Field(default=50, ge=0, le=100)
    score_time: int = Field(default=50, ge=0, le=100)
    score_pleasure: int = Field(default=50, ge=0, le=100)
    votes: int = 0


class TreeInput(StrictModel):
    project: ProjectInfo
    nodes: List[TreeNode] = Field(min_length=1)
    weights: Optional[Dict[str, float]] = None


class NotesInput(StrictModel):
    notes: str
    budget_total: float = Field(gt=0)


INPUT_TYPES = {
    'generate_options': OptionsInput,
    'analyze_project': TreeInput,
    'generate_actionable_suggestions': TreeInput,
    'build_project_from_notes': NotesInput,
}


class Expectations(StrictModel):
    required_keywords: List[str | List[str]] = Field(default_factory=list)
    min_keyword_coverage: float = 0.6
    min_language_match: float = 0.8
    min_diversity: float = 0.6
    min_cost_share: float = 0.005
    max_option_cost: Optional[float] = None
    max_total_cost: Optional[float] = None
    min_milestones: int = 3
    max_milestones: int = 10
    min_options: int = 2
    max_options: int = 5
    min_list_items: int = 2
    min_tree_references: int = 1
    expect_cost_reduction: bool = False


class EvalCase(StrictModel):
    id: str = Field(pattern=r'^[a-z0-9_]+$')
    operation: Operation
    language: Language
    input: OptionsInput | TreeInput | NotesInput
    expect: Expectations = Field(default_factory=Expectations)

    @model_validator(mode='before')
    @classmethod
    def _parse_input(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get('operation') in INPUT_TYPES and isinstance(data.get('input'), dict):
            return {**data, 'input': INPUT_TYPES[data['operation']].model_validate(data['input'])}
        return data

    def tree_titles(self) -> List[str]:
        return [node.title for node in self.input.nodes] if isinstance(self.input, TreeInput) else []


def load_cases(cases_dir: Path = CASES_DIR) -> List[EvalCase]:
    cases: List[EvalCase] = []
    for path in sorted(cases_dir.glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        cases.extend(EvalCase.model_validate(item) for item in (data if isinstance(data, list) else [data]))
    ids = [case.id for case in cases]
    duplicates = sorted({case_id for case_id in ids if ids.count(case_id) > 1})
    if duplicates:
        raise ValueError(f'Duplicate case ids: {", ".join(duplicates)}')
    return cases


def select_cases(cases: Sequence[EvalCase], selector: Optional[str]) -> List[EvalCase]:
    """Filter by comma-separated operation names and/or case-id glob patterns."""
    patterns = [part.strip() for part in (selector or '').split(',') if part.strip()]
    if not patterns:
        return list(cases)
    return [
        case for case in cases
        if any(case.operation == pattern or fnmatch.fnmatchcase(case.id, pattern) for pattern in patterns)
    ]


def load_fixture(case_id: str, fixtures_dir: Path = FIXTURES_DIR) -> Dict[str, Any]:
    return json.loads((fixtures_dir / f'{case_id}.json').read_text(encoding='utf-8'))
