from typing import Any, Dict, List, Mapping, Optional, Sequence

CRITERIA = ('comfort', 'risk', 'time', 'pleasure')
DEFAULT_WEIGHTS: Dict[str, float] = {name: 1.0 for name in CRITERIA}


def weighted_score(node: Mapping[str, Any], weights: Optional[Mapping[str, float]] = None) -> float:
    weights = {**DEFAULT_WEIGHTS, **(weights or {})}
    total = sum(weights.values())
    if total <= 0:
        return 0.0
    values = {
        'comfort': node.get('score_comfort', 50),
        'risk': 100 - node.get('score_risk', 50),
        'time': node.get('score_time', 50),
        'pleasure': node.get('score_pleasure', 50),
    }
    return sum(values[name] * weights[name] for name in CRITERIA) / total


def format_tree_summary(
    project: Mapping[str, Any],
    nodes: Sequence[Mapping[str, Any]],
    weights: Optional[Mapping[str, float]] = None,
) -> str:
    """Serialize a decision tree into the indented text context used by every LLM prompt.

    `project` needs title, description and budget_total. Each node needs id, parent_id, title,
    description, estimated_cost, status, section, order, score_* and optionally votes.
    """
    budget = float(project.get('budget_total') or 0)
    lines: List[str] = [
        f"Project: {project.get('title', '')}",
        f"Description: {project.get('description') or 'No description'}",
        f"Total Budget: ${budget:.2f}",
        f"Total Nodes: {len(nodes)}",
    ]
    if weights:
        merged = {**DEFAULT_WEIGHTS, **weights}
        lines.append('User Priorities (weights): ' + ', '.join(f'{k}={merged[k]:g}' for k in CRITERIA))
    lines += ['', 'Decision Tree Structure:']

    children: Dict[Optional[int], List[Mapping[str, Any]]] = {}
    for node in nodes:
        children.setdefault(node.get('parent_id'), []).append(node)

    def add(node: Mapping[str, Any], level: int) -> None:
        indent = '  ' * level
        votes = node.get('votes', 0)
        parts = [f"{indent}- {node['title']}: ${float(node.get('estimated_cost') or 0):.2f}"]
        if votes:
            parts.append(f' ({votes} votes)')
        if node.get('status', 'pending') != 'pending':
            parts.append(f" [STATUS: {node['status'].upper()}]")
        parts.append(
            f" [Scores: C:{node.get('score_comfort', 50)} R:{node.get('score_risk', 50)}"
            f" T:{node.get('score_time', 50)} J:{node.get('score_pleasure', 50)}]"
        )
        if node.get('section', 'general') != 'general':
            parts.append(f" [Section: {node['section'].upper()}]")
        if node.get('order', 0) > 0:
            parts.append(f" [Order: {node['order']}]")
        lines.append(''.join(parts))
        if node.get('description'):
            lines.append(f"{indent}  Description: {node['description']}")
        for child in children.get(node['id'], []):
            add(child, level + 1)

    for root in children.get(None, []):
        add(root, 0)

    count = len(nodes)
    total_cost = sum(float(n.get('estimated_cost') or 0) for n in nodes)

    def average(field: str) -> float:
        return sum(n.get(field, 50) for n in nodes) / count if count else 0.0

    lines += [
        '',
        f'Total Estimated Cost (all nodes): ${total_cost:.2f}',
        f'Budget Utilization: {(total_cost / budget * 100 if budget > 0 else 0):.1f}%',
        '',
        'Average Scores Across All Nodes:',
        f"- Comfort: {average('score_comfort'):.1f}/100",
        f"- Risk: {average('score_risk'):.1f}/100 (lower is better)",
        f"- Time Efficiency: {average('score_time'):.1f}/100",
        f"- Pleasure/Joy: {average('score_pleasure'):.1f}/100",
    ]
    return '\n'.join(lines)
