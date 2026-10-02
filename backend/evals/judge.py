"""LLM-as-judge scoring of an operation output against a fixed rubric."""
import json
from typing import Any, Optional, Protocol, Type, TypeVar

from pydantic import BaseModel, Field

from core.llm.context import format_tree_summary
from evals.dataset import EvalCase, NotesInput, OptionsInput, TreeInput

JUDGE_OPERATION = 'eval_judge'
DEFAULT_JUDGE_MODEL = 'gemini-2.5-flash'
JUDGE_DIMENSIONS = ('relevance', 'specificity', 'realism', 'budget_awareness')
LANGUAGE_NAMES = {'en': 'English', 'pl': 'Polish'}

T = TypeVar('T', bound=BaseModel)


class JudgeVerdict(BaseModel):
    relevance: int = Field(ge=1, le=5)
    specificity: int = Field(ge=1, le=5)
    realism: int = Field(ge=1, le=5)
    budget_awareness: int = Field(ge=1, le=5)
    rationale: str = Field(max_length=600)

    @property
    def mean(self) -> float:
        return sum(getattr(self, name) for name in JUDGE_DIMENSIONS) / len(JUDGE_DIMENSIONS)


class StructuredClient(Protocol):
    enabled: bool

    def generate_structured(self, operation: str, prompt: str, schema: Type[T], *,
                            system_instruction: Optional[str] = None, temperature: Optional[float] = None,
                            project_id: Optional[int] = None) -> Optional[T]: ...


SYSTEM_INSTRUCTION = (
    'You are a strict, impartial reviewer of an AI planning assistant. '
    'You grade outputs against a rubric and never reward length or confident tone on their own.'
)

TASK_DESCRIPTIONS = {
    'generate_options': 'Propose exactly 3 concrete, mutually distinct options for the given decision node, '
                        'each with a realistic cost and 0-100 scores (comfort, risk where lower is safer, time, pleasure).',
    'analyze_project': 'Analyze the decision tree: summarize it, list risks, missing items and recommendations.',
    'generate_actionable_suggestions': 'Propose one-click changes to the decision tree '
                                       '(status, scores, cost, or a new buffer node) that improve the plan.',
    'build_project_from_notes': 'Turn free-form notes into a project: milestones in chronological order, '
                                'each with alternative options, costs and scores, fitting the budget.',
}

RUBRIC = """Score the ASSISTANT OUTPUT on four criteria, each an integer from 1 to 5.

relevance - Does the output address this specific request and its context?
  1 = off-topic or generic boilerplate; 3 = on-topic but partly generic; 5 = every item is clearly tailored.
specificity - Are items concrete (named services, quantities, durations, prices) rather than vague?
  1 = vague platitudes; 3 = a mix of concrete and vague; 5 = concrete and immediately actionable.
realism - Are costs, scores and claims plausible for the stated scale and location?
  1 = clearly unrealistic or internally inconsistent; 3 = mostly plausible with notable errors; 5 = all plausible.
budget_awareness - Does the output respect and reason about the stated budget?
  1 = ignores or breaks the budget; 3 = acknowledges it with gaps; 5 = fits the budget and makes trade-offs explicit.

Judge the content only. The expected response language is {language}; language is checked separately.
In `rationale`, explain the lowest score in at most two sentences."""


def describe_input(case: EvalCase) -> str:
    data = case.input
    if isinstance(data, OptionsInput):
        return (f'Decision node: {data.parent_node_text}\nProject: {data.project_context}\n'
                f'Budget: {data.budget_context}\nBudget remaining: ${data.budget_remaining:,.2f}')
    if isinstance(data, TreeInput):
        nodes = [node.model_dump() for node in data.nodes]
        return format_tree_summary(data.project.model_dump(), nodes, data.weights)
    if isinstance(data, NotesInput):
        return f'Notes:\n{data.notes}\n\nTotal budget: ${data.budget_total:,.2f}'
    raise TypeError(f'Unsupported input for {case.operation}')


def build_judge_prompt(case: EvalCase, output: Any) -> str:
    rubric = RUBRIC.format(language=LANGUAGE_NAMES[case.language])
    return '\n\n'.join([
        rubric,
        f'TASK ({case.operation}): {TASK_DESCRIPTIONS[case.operation]}',
        f'INPUT:\n{describe_input(case)}',
        'ASSISTANT OUTPUT (JSON):\n' + json.dumps(output, ensure_ascii=False, indent=2),
    ])


def judge_output(client: Optional[StructuredClient], case: EvalCase, output: Any) -> Optional[JudgeVerdict]:
    """Return the judge's verdict, or None when no enabled judge client is available or there is no output."""
    if client is None or output is None or not getattr(client, 'enabled', False):
        return None
    return client.generate_structured(
        JUDGE_OPERATION, build_judge_prompt(case, output), JudgeVerdict,
        system_instruction=SYSTEM_INSTRUCTION, temperature=0.0,
    )
