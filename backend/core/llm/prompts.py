from typing import Dict

from .schemas import Language

LANGUAGE_NAMES: Dict[str, str] = {'en': 'English', 'pl': 'Polish'}

SECTIONS = 'general, transport, accommodation, food, entertainment, activities, services, equipment, other'

SYSTEM_INSTRUCTION = """You are Decider, an AI planning assistant for budget-constrained, multi-criteria decisions \
(events, trips, renovations and similar projects).
A project is a decision tree: milestones group alternative options; each option has an estimated cost \
and four scores from 0 to 100:
- comfort: convenience and comfort (higher is better)
- risk: how much can go wrong (LOWER is better)
- time: time efficiency, how fast or effortless it is (higher is better)
- pleasure: satisfaction and joy (higher is better)
When the context lists user priority weights, favour the criteria with higher weights.
Be concrete and realistic, ground every statement in the provided data, respect the budget, and never invent \
nodes that are not in the context unless you are explicitly asked to propose new ones."""

SCORE_GUIDE = """Scores are integers 0-100:
- score_comfort: 0 = very uncomfortable, 100 = very comfortable
- score_risk: 0 = very safe, 100 = very risky (lower is better)
- score_time: 0 = very slow or time-consuming, 100 = very fast
- score_pleasure: 0 = no satisfaction, 100 = maximum satisfaction"""

OPTIONS_TEMPLATE = """Suggest exactly 3 concrete sub-options that are logical next steps for the parent decision below.

Parent node: {parent_node_text}
Project context: {project_context}
Budget context: {budget_context}

Guidelines:
- Make the options meaningfully different (for example budget, balanced and premium) and specific, not generic.
- estimated_cost is a realistic number in the project currency that fits the remaining budget.
- Title: up to 50 characters. Description: one or two sentences, up to 200 characters.
{score_guide}"""

ANALYSIS_TEMPLATE = """Act as an expert in project management and budget planning. Analyse the decision tree below, \
paying close attention to the multi-criteria scores.

{tree_summary}

Produce:
- summary: 2-3 sentences describing the project state, citing the average scores and budget utilisation.
- risks: 3 risks such as budget overrun, weak scores or missing elements, each referring to concrete numbers.
- missing_items: 3 elements the plan should include but does not.
- recommendations: 3 concrete, strategic recommendations driven by the scores and user priorities.

Score heuristics:
- average comfort below 50: options are uncomfortable, suggest more comfortable alternatives
- average risk above 70: the plan is risky, suggest safer options or a contingency
- average time below 40: the plan is time-consuming, suggest faster alternatives
- average pleasure below 50: low satisfaction, suggest elements that add enjoyment
- budget utilisation above 100%: the plan is over budget, say where to cut"""

SUGGESTIONS_TEMPLATE = """Act as an expert project manager. Review the decision tree below and propose 3-5 concrete \
changes the user can apply with one click.

{tree_summary}

Allowed action types:
- update_node_status: set changes.status to pending, selected or rejected
- update_node_scores: set one or more of changes.score_comfort, score_risk, score_time, score_pleasure
- update_node_cost: set changes.estimated_cost
- add_buffer_node: add a new safety-buffer node; set changes.title, description, estimated_cost and all four scores

Rules:
- node_title must exactly match the title of an existing node (required for every action except add_buffer_node).
- For add_buffer_node, parent_title is the exact title of an existing node, or null to add it at the root.
- Put only the fields relevant to the action in changes.
- reason: 1-2 sentences citing concrete numbers (scores, costs, budget). impact: the expected effect.
- Prefer changes that improve budget fit and the criteria with the highest user priority."""

CHAT_TEMPLATE = """You are helping the user manage the decision project below.

PROJECT CONTEXT:
{tree_summary}

RECENT CONVERSATION:
{chat_history}

USER MESSAGE:
{user_message}

You can answer questions about the project, analyse costs and scores, give advice, help with chronological \
organisation, and suggest changes (for example adding a section or setting a budget for a node).
Available sections: {sections}. The order field is chronological: 0 = first stage, higher = later.
When the user asks to add or change something, propose concrete parameters: title, section, budget and order.
Reply in plain text without Markdown formatting; short paragraphs or simple "-" lists are fine. Be concise and \
base the answer on the project context."""

PROJECT_BUILDER_TEMPLATE = """Act as an expert project planner. Turn the user's notes into a complete project \
structure.

USER NOTES:
{notes}

BUDGET: ${budget_total:.2f}

Produce:
- title: short and descriptive.
- description: 2-3 sentences.
- milestones: 3-6 key decision areas in chronological order (order 0 = first stage). Each milestone has a section \
(one of: {sections}) and 2-4 alternative options.
- options: concrete alternatives with a realistic estimated_cost and scores.

Options within a milestone are alternatives, so choosing one option per milestone must fit within the budget.
{score_guide}"""

TASKS_TEMPLATE = """The user has selected this decision in their project:
Title: {node_title}
Description: {node_description}

List 3-5 concrete, actionable steps needed to carry out this decision, in logical order. Each task is one short \
imperative sentence."""


def language_instruction(language: Language) -> str:
    name = LANGUAGE_NAMES.get(language, 'English')
    return (
        f'Write all natural-language fields (titles, descriptions, explanations, list items) in {name}. '
        'Keep JSON keys and enumerated values exactly as defined by the schema.'
    )


def _render(template: str, language: Language, **values: object) -> str:
    return f'{template.format(**values)}\n\n{language_instruction(language)}'


def options_prompt(parent_node_text: str, project_context: str, budget_context: str, language: Language) -> str:
    return _render(OPTIONS_TEMPLATE, language, parent_node_text=parent_node_text, project_context=project_context,
                   budget_context=budget_context, score_guide=SCORE_GUIDE)


def analysis_prompt(tree_summary: str, language: Language) -> str:
    return _render(ANALYSIS_TEMPLATE, language, tree_summary=tree_summary)


def suggestions_prompt(tree_summary: str, language: Language) -> str:
    return _render(SUGGESTIONS_TEMPLATE, language, tree_summary=tree_summary)


def chat_prompt(tree_summary: str, chat_history: str, user_message: str, language: Language) -> str:
    name = LANGUAGE_NAMES.get(language, 'English')
    body = CHAT_TEMPLATE.format(tree_summary=tree_summary, chat_history=chat_history or '(no previous messages)',
                                user_message=user_message, sections=SECTIONS)
    return f'{body}\n\nWrite the whole reply in {name}.'


def project_builder_prompt(notes: str, budget_total: float, language: Language) -> str:
    return _render(PROJECT_BUILDER_TEMPLATE, language, notes=notes, budget_total=budget_total, sections=SECTIONS,
                   score_guide=SCORE_GUIDE)


def tasks_prompt(node_title: str, node_description: str, language: Language) -> str:
    return _render(TASKS_TEMPLATE, language, node_title=node_title,
                   node_description=node_description or 'No description')
