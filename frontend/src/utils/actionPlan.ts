import type { DecisionNode, Project } from '../types/tree'

export interface ActionPlan {
  projectId: number
  projectTitle?: string
  budget: number
  selectedOptions: Array<{
    id: number
    title: string
    description: string
    cost: number
    section?: string
    order?: number
    scores: { comfort?: number; risk?: number; time?: number; pleasure?: number }
  }>
  summary: {
    totalCost: number
    avgJoy: string
    optionsCount: number
    budgetUsage: string | number
  }
  generatedAt: string
}

export const selectedOptionsOf = (nodes: Iterable<DecisionNode>): DecisionNode[] =>
  Array.from(nodes).filter(node => node.status === 'selected' && node.node_type !== 'milestone')

export const buildActionPlan = (projectId: number, project: Project | null, nodes: Iterable<DecisionNode>): ActionPlan => {
  const selectedOptions = selectedOptionsOf(nodes).map(node => ({
    id: node.id,
    title: node.title,
    description: node.description,
    cost: parseFloat(node.estimated_cost),
    section: node.section,
    order: node.order,
    scores: {
      comfort: node.score_comfort,
      risk: node.score_risk,
      time: node.score_time,
      pleasure: node.score_pleasure,
    },
  }))

  const totalCost = selectedOptions.reduce((sum, option) => sum + option.cost, 0)
  const avgJoy = selectedOptions.length > 0
    ? selectedOptions.reduce((sum, option) => sum + (option.scores.pleasure || 0), 0) / selectedOptions.length
    : 0

  return {
    projectId,
    projectTitle: project?.title,
    budget: project ? parseFloat(project.budget_total) : 0,
    selectedOptions,
    summary: {
      totalCost,
      avgJoy: avgJoy.toFixed(1),
      optionsCount: selectedOptions.length,
      budgetUsage: project ? ((totalCost / parseFloat(project.budget_total)) * 100).toFixed(1) : 0,
    },
    generatedAt: new Date().toISOString(),
  }
}

export const downloadJson = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
