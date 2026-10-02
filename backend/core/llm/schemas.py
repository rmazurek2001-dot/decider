from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Language = Literal['en', 'pl']
NodeStatus = Literal['pending', 'selected', 'rejected']
Section = Literal[
    'general', 'transport', 'accommodation', 'food', 'entertainment',
    'activities', 'services', 'equipment', 'other',
]
ActionType = Literal['update_node_status', 'update_node_scores', 'update_node_cost', 'add_buffer_node']

Score = Field(ge=0, le=100)


class ScoredItem(BaseModel):
    score_comfort: int = Score
    score_risk: int = Score
    score_time: int = Score
    score_pleasure: int = Score


class GeneratedOption(ScoredItem):
    title: str = Field(max_length=80)
    description: str = Field(max_length=300)
    estimated_cost: float = Field(ge=0)


class OptionList(BaseModel):
    options: List[GeneratedOption] = Field(min_length=3, max_length=3)


class ProjectAnalysis(BaseModel):
    summary: str
    risks: List[str] = Field(min_length=1, max_length=5)
    missing_items: List[str] = Field(min_length=1, max_length=5)
    recommendations: List[str] = Field(min_length=1, max_length=5)


class SuggestionChanges(BaseModel):
    status: Optional[NodeStatus] = None
    title: Optional[str] = None
    description: Optional[str] = None
    estimated_cost: Optional[float] = Field(default=None, ge=0)
    score_comfort: Optional[int] = Field(default=None, ge=0, le=100)
    score_risk: Optional[int] = Field(default=None, ge=0, le=100)
    score_time: Optional[int] = Field(default=None, ge=0, le=100)
    score_pleasure: Optional[int] = Field(default=None, ge=0, le=100)


class Suggestion(BaseModel):
    action_type: ActionType
    node_title: Optional[str] = None
    parent_title: Optional[str] = None
    changes: SuggestionChanges
    reason: str
    impact: str


class SuggestionList(BaseModel):
    suggestions: List[Suggestion] = Field(min_length=1, max_length=5)


class OptionSpec(ScoredItem):
    title: str = Field(max_length=80)
    description: str = Field(max_length=300)
    estimated_cost: float = Field(ge=0)


class MilestoneSpec(BaseModel):
    title: str = Field(max_length=80)
    description: str = Field(max_length=300)
    section: Section
    order: int = Field(ge=0)
    options: List[OptionSpec] = Field(min_length=1, max_length=5)


class ProjectStructure(BaseModel):
    title: str = Field(max_length=120)
    description: str
    milestones: List[MilestoneSpec] = Field(min_length=1, max_length=10)


class TaskList(BaseModel):
    tasks: List[str] = Field(min_length=1, max_length=5)
