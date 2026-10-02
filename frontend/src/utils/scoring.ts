import type { CriteriaWeights, Criterion, DecisionNode, ScoreFields } from '../types/tree'

export const CRITERIA: readonly Criterion[] = ['comfort', 'risk', 'time', 'pleasure']
export const DEFAULT_WEIGHTS: Readonly<CriteriaWeights> = Object.freeze({ comfort: 1, risk: 1, time: 1, pleasure: 1 })
export const MIN_WEIGHT = 0
export const MAX_WEIGHT = 5
export const WEIGHT_STEP = 0.5

const DEFAULT_SCORE = 50

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const normalizeWeights = (weights?: Partial<Record<Criterion, unknown>> | null): CriteriaWeights => {
  const result: CriteriaWeights = { ...DEFAULT_WEIGHTS }
  if (!weights) return result
  for (const criterion of CRITERIA) {
    const raw = weights[criterion]
    if (typeof raw !== 'number' && typeof raw !== 'string') continue
    const value = Number(raw)
    if (raw !== '' && Number.isFinite(value)) {
      result[criterion] = clamp(value, MIN_WEIGHT, MAX_WEIGHT)
    }
  }
  return result
}

export const weightsEqual = (a: CriteriaWeights, b: CriteriaWeights) =>
  CRITERIA.every(criterion => a[criterion] === b[criterion])

export const totalWeight = (weights: CriteriaWeights) =>
  CRITERIA.reduce((sum, criterion) => sum + weights[criterion], 0)

export const criterionValue = (node: ScoreFields, criterion: Criterion): number => {
  switch (criterion) {
    case 'comfort':
      return node.score_comfort ?? DEFAULT_SCORE
    case 'risk':
      return 100 - (node.score_risk ?? DEFAULT_SCORE)
    case 'time':
      return node.score_time ?? DEFAULT_SCORE
    case 'pleasure':
      return node.score_pleasure ?? DEFAULT_SCORE
  }
}

export const weightedScore = (node: ScoreFields, weights: CriteriaWeights = DEFAULT_WEIGHTS): number => {
  const total = totalWeight(weights)
  if (total <= 0) return 0
  return CRITERIA.reduce((sum, criterion) => sum + criterionValue(node, criterion) * weights[criterion], 0) / total
}

export const valueRating = (node: ScoreFields, weights: CriteriaWeights = DEFAULT_WEIGHTS): number =>
  Math.round(weightedScore(node, weights))

export const averageWeightedScore = (nodes: ScoreFields[], weights: CriteriaWeights = DEFAULT_WEIGHTS): number =>
  nodes.length > 0 ? nodes.reduce((sum, node) => sum + weightedScore(node, weights), 0) / nodes.length : 0

export const pickBestByScore = <T extends ScoreFields>(options: T[], weights: CriteriaWeights): T | undefined => {
  let best: T | undefined
  let bestScore = -Infinity
  for (const option of options) {
    const score = weightedScore(option, weights)
    if (score > bestScore) {
      best = option
      bestScore = score
    }
  }
  return best
}

export const findBestPath = (nodesMap: Map<number, DecisionNode>, weights: CriteriaWeights = DEFAULT_WEIGHTS): Set<number> => {
  const allNodes = Array.from(nodesMap.values())
  const bestOptions = new Set<number>()

  allNodes.forEach(node => {
    const isMilestone = node.node_type === 'milestone' || (!node.parent && node.children && node.children.length > 0)
    if (!isMilestone) return

    const options = allNodes.filter(n =>
      n.parent === node.id &&
      n.status !== 'rejected' &&
      (n.node_type === 'option' || n.node_type === 'decision')
    )
    const best = pickBestByScore(options, weights)
    if (best) bestOptions.add(best.id)
  })

  return bestOptions
}
