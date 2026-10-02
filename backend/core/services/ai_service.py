from typing import Any, Dict, List, Optional

from core.llm import prompts
from core.llm.client import LLMClient
from core.llm.recorder import db_recorder
from core.llm.schemas import (
    Language,
    OptionList,
    ProjectAnalysis,
    ProjectStructure,
    SuggestionList,
    TaskList,
)

MILESTONE_SCORE = 50


class GeminiService:
    """Domain-level AI operations built on LLMClient structured output."""

    def __init__(self, client: Optional[LLMClient] = None) -> None:
        self.client = client if client is not None else LLMClient()
        self.enabled = self.client.enabled

    def generate_options(
        self,
        parent_node_text: str,
        project_context: str,
        budget_context: str,
        *,
        language: Language = 'en',
        project_id: Optional[int] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        if not self.enabled:
            return None
        result = self.client.generate_structured(
            'generate_options',
            prompts.options_prompt(parent_node_text, project_context, budget_context, language),
            OptionList,
            system_instruction=prompts.SYSTEM_INSTRUCTION,
            temperature=0.7,
            project_id=project_id,
        )
        return [option.model_dump() for option in result.options] if result else None

    def analyze_project(
        self,
        project_title: str,
        project_description: str,
        budget_total: float,
        tree_summary: str,
        *,
        language: Language = 'en',
        project_id: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        result = self.client.generate_structured(
            'analyze_project',
            prompts.analysis_prompt(tree_summary, language),
            ProjectAnalysis,
            system_instruction=prompts.SYSTEM_INSTRUCTION,
            temperature=0.4,
            project_id=project_id,
        )
        return result.model_dump() if result else None

    def generate_actionable_suggestions(
        self,
        project_title: str,
        project_description: str,
        budget_total: float,
        tree_summary: str,
        *,
        language: Language = 'en',
        project_id: Optional[int] = None,
    ) -> Optional[List[Dict[str, Any]]]:
        if not self.enabled:
            return None
        result = self.client.generate_structured(
            'generate_actionable_suggestions',
            prompts.suggestions_prompt(tree_summary, language),
            SuggestionList,
            system_instruction=prompts.SYSTEM_INSTRUCTION,
            temperature=0.3,
            project_id=project_id,
        )
        if not result:
            return None
        return [
            {**suggestion.model_dump(), 'changes': suggestion.changes.model_dump(exclude_none=True)}
            for suggestion in result.suggestions
        ]

    def chat_with_project(
        self,
        project_title: str,
        project_description: str,
        budget_total: float,
        tree_summary: str,
        chat_history: str,
        user_message: str,
        *,
        language: Language = 'en',
        project_id: Optional[int] = None,
    ) -> Optional[str]:
        if not self.enabled:
            return None
        return self.client.generate_text(
            'chat_with_project',
            prompts.chat_prompt(tree_summary, chat_history, user_message, language),
            system_instruction=prompts.SYSTEM_INSTRUCTION,
            temperature=0.7,
            project_id=project_id,
        )

    def build_project_from_notes(
        self,
        notes: str,
        budget_total: float,
        *,
        language: Language = 'en',
        project_id: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None
        result = self.client.generate_structured(
            'build_project_from_notes',
            prompts.project_builder_prompt(notes, budget_total, language),
            ProjectStructure,
            system_instruction=prompts.SYSTEM_INSTRUCTION,
            temperature=0.5,
            project_id=project_id,
        )
        return structure_to_nodes(result) if result else None

    def generate_tasks_for_node(
        self,
        node_title: str,
        node_description: str,
        *,
        language: Language = 'en',
        project_id: Optional[int] = None,
    ) -> Optional[List[str]]:
        if not self.enabled:
            return None
        result = self.client.generate_structured(
            'generate_tasks_for_node',
            prompts.tasks_prompt(node_title, node_description, language),
            TaskList,
            system_instruction=prompts.SYSTEM_INSTRUCTION,
            temperature=0.3,
            project_id=project_id,
        )
        if not result:
            return None
        tasks = [task.strip() for task in result.tasks if task.strip()]
        return tasks[:5] or None


def structure_to_nodes(structure: ProjectStructure) -> Dict[str, Any]:
    """Convert a ProjectStructure into nested milestone/decision node dicts."""
    nodes = []
    for milestone in structure.milestones:
        children = [
            {
                **option.model_dump(),
                'section': milestone.section,
                'order': milestone.order,
                'node_type': 'decision',
                'children': [],
            }
            for option in milestone.options
        ]
        nodes.append({
            'title': milestone.title,
            'description': milestone.description,
            'estimated_cost': 0.0,
            'section': milestone.section,
            'order': milestone.order,
            'node_type': 'milestone',
            'score_comfort': MILESTONE_SCORE,
            'score_risk': MILESTONE_SCORE,
            'score_time': MILESTONE_SCORE,
            'score_pleasure': MILESTONE_SCORE,
            'children': children,
        })
    return {'title': structure.title, 'description': structure.description, 'nodes': nodes}


ai_service = GeminiService(LLMClient(recorder=db_recorder))
