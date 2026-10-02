import type { CriteriaWeights, DecisionNode, ScenarioMode } from '../types/tree'
import { pickBestByScore } from './scoring'

const cheapest = (options: DecisionNode[]) =>
  options.reduce((min, option) =>
    parseFloat(option.estimated_cost) < parseFloat(min.estimated_cost) ? option : min
  )

const mostEnjoyable = (options: DecisionNode[]) =>
  options.reduce((max, option) =>
    (option.score_pleasure || 0) > (max.score_pleasure || 0) ? option : max
  )

export const pickScenarioOption = (
  options: DecisionNode[],
  mode: ScenarioMode,
  weights: CriteriaWeights
): DecisionNode | undefined => {
  if (options.length === 0) return undefined
  switch (mode) {
    case 'budget':
      return cheapest(options)
    case 'balanced':
      return pickBestByScore(options, weights)
    case 'vip':
      return mostEnjoyable(options)
  }
}
