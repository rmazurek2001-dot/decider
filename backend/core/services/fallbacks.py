from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from core.llm.schemas import Language

BUFFER_SHARE = 0.15

MESSAGES: Dict[str, Dict[str, str]] = {
    'en': {
        'summary': ("Project '{title}' has {count} decision nodes. The total estimated cost is ${cost:.2f}, "
                    "which is {utilization:.1f}% of the budget (${budget:.2f})."),
        'risk_budget': 'Budget utilization: {utilization:.1f}% ({state})',
        'state_over': 'over budget',
        'state_ok': 'within budget',
        'risk_no_ai': 'No detailed AI analysis available - check the GEMINI_API_KEY configuration',
        'risk_hidden_costs': 'Some nodes may require additional unforeseen costs',
        'missing_buffer': 'A buffer for unexpected expenses (10-15% of the budget is recommended)',
        'missing_risks': 'A detailed risk assessment for each node',
        'missing_plan_b': 'A contingency plan in case the budget is exceeded',
        'rec_configure': 'Configure GEMINI_API_KEY to get a full AI analysis',
        'rec_cut': 'Reduce costs by ${amount:.0f}',
        'rec_buffer': 'Consider adding a safety buffer',
        'rec_update': 'Keep node costs up to date to maintain an accurate budget',
        'reject_reason': 'The budget is exceeded by {excess:.1f}% - consider rejecting the most expensive option',
        'reject_impact': 'Lower total project cost',
        'buffer_title': 'Budget reserve',
        'buffer_description': 'Buffer for unexpected expenses (15% of the budget)',
        'buffer_reason': 'AI is unavailable - configure GEMINI_API_KEY to get tailored suggestions',
        'buffer_impact': 'Protection against exceeding the budget',
    },
    'pl': {
        'summary': ("Projekt '{title}' zawiera {count} węzłów decyzyjnych. Całkowity szacowany koszt wynosi "
                    "${cost:.2f}, co stanowi {utilization:.1f}% budżetu (${budget:.2f})."),
        'risk_budget': 'Wykorzystanie budżetu: {utilization:.1f}% ({state})',
        'state_over': 'przekroczenie',
        'state_ok': 'w normie',
        'risk_no_ai': 'Brak szczegółowej analizy AI - sprawdź konfigurację GEMINI_API_KEY',
        'risk_hidden_costs': 'Niektóre węzły mogą wymagać dodatkowych, nieprzewidzianych kosztów',
        'missing_buffer': 'Bufor na nieprzewidziane wydatki (zalecane 10-15% budżetu)',
        'missing_risks': 'Szczegółowa analiza ryzyk dla każdego węzła',
        'missing_plan_b': 'Plan awaryjny na wypadek przekroczenia budżetu',
        'rec_configure': 'Skonfiguruj GEMINI_API_KEY, aby uzyskać pełną analizę AI',
        'rec_cut': 'Zmniejsz koszty o ${amount:.0f}',
        'rec_buffer': 'Rozważ dodanie bufora bezpieczeństwa',
        'rec_update': 'Regularnie aktualizuj koszty węzłów, aby utrzymać dokładność budżetu',
        'reject_reason': 'Budżet przekroczony o {excess:.1f}% - rozważ odrzucenie najdroższej opcji',
        'reject_impact': 'Zmniejszenie całkowitego kosztu projektu',
        'buffer_title': 'Rezerwa budżetowa',
        'buffer_description': 'Bufor na nieprzewidziane wydatki (15% budżetu)',
        'buffer_reason': 'AI jest niedostępne - skonfiguruj GEMINI_API_KEY, aby uzyskać dopasowane propozycje',
        'buffer_impact': 'Zabezpieczenie przed przekroczeniem budżetu',
    },
}


def _messages(language: Language) -> Dict[str, str]:
    return MESSAGES.get(language, MESSAGES['en'])


def _totals(nodes: Sequence[Mapping[str, Any]], budget_total: float) -> Tuple[float, float]:
    total_cost = sum(float(node.get('estimated_cost') or 0) for node in nodes)
    utilization = total_cost / budget_total * 100 if budget_total > 0 else 0.0
    return total_cost, utilization


def fallback_analysis(
    title: str,
    nodes: Sequence[Mapping[str, Any]],
    budget_total: float,
    language: Language = 'en',
) -> Dict[str, Any]:
    """Rule-based project analysis used when the LLM is unavailable."""
    m = _messages(language)
    total_cost, utilization = _totals(nodes, budget_total)
    over_budget = utilization > 100
    return {
        'summary': m['summary'].format(title=title, count=len(nodes), cost=total_cost,
                                       utilization=utilization, budget=budget_total),
        'risks': [
            m['risk_budget'].format(utilization=utilization, state=m['state_over' if over_budget else 'state_ok']),
            m['risk_no_ai'],
            m['risk_hidden_costs'],
        ],
        'missing_items': [m['missing_buffer'], m['missing_risks'], m['missing_plan_b']],
        'recommendations': [
            m['rec_configure'],
            m['rec_cut'].format(amount=total_cost - budget_total) if over_budget else m['rec_buffer'],
            m['rec_update'],
        ],
    }


def fallback_suggestions(
    nodes: Sequence[Mapping[str, Any]],
    budget_total: float,
    language: Language = 'en',
) -> List[Dict[str, Any]]:
    """Rule-based suggestions used when the LLM is unavailable."""
    m = _messages(language)
    _, utilization = _totals(nodes, budget_total)
    suggestions: List[Dict[str, Any]] = []

    most_expensive = _most_expensive_option(nodes)
    if utilization > 100 and most_expensive is not None:
        suggestions.append({
            'action_type': 'update_node_status',
            'node_title': most_expensive['title'],
            'node_id': most_expensive['id'],
            'changes': {'status': 'rejected'},
            'reason': m['reject_reason'].format(excess=utilization - 100),
            'impact': m['reject_impact'],
        })

    suggestions.append({
        'action_type': 'add_buffer_node',
        'parent_title': None,
        'parent_id': None,
        'changes': {
            'title': m['buffer_title'],
            'description': m['buffer_description'],
            'estimated_cost': round(budget_total * BUFFER_SHARE, 2),
            'score_comfort': 80,
            'score_risk': 20,
            'score_time': 90,
            'score_pleasure': 60,
        },
        'reason': m['buffer_reason'],
        'impact': m['buffer_impact'],
    })
    return suggestions


def _most_expensive_option(nodes: Sequence[Mapping[str, Any]]) -> Optional[Mapping[str, Any]]:
    candidates = [
        node for node in nodes
        if node.get('node_type') != 'milestone' and node.get('status') != 'rejected'
    ]
    return max(candidates, key=lambda node: float(node.get('estimated_cost') or 0), default=None)
