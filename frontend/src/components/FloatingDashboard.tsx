import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DollarSign, Heart, AlertCircle, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import type { CriteriaWeights, ScoreFields } from '../types/tree'
import { averageWeightedScore } from '../utils/scoring'

interface SelectedNode {
  nodeId: number
  title: string
  cost: number
  joy: number
  risk: number
  section: string
  scores?: ScoreFields
}

interface FloatingDashboardProps {
  selectedNodes: SelectedNode[]
  totalBudget: number
  weights?: CriteriaWeights
}

const FloatingDashboard = ({ selectedNodes, totalBudget, weights }: FloatingDashboardProps) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const { t, formatCurrency } = useLanguage()
  
  if (selectedNodes.length === 0) return null

  const totalCost = selectedNodes.reduce((sum, node) => sum + node.cost, 0)
  const avgJoy = selectedNodes.length > 0 ? selectedNodes.reduce((sum, node) => sum + node.joy, 0) / selectedNodes.length : 0
  const avgRisk = selectedNodes.length > 0 ? selectedNodes.reduce((sum, node) => sum + node.risk, 0) / selectedNodes.length : 0
  const priorityScore = weights
    ? averageWeightedScore(selectedNodes.map(node => node.scores ?? { score_pleasure: node.joy, score_risk: node.risk }), weights)
    : null
  const remainingBudget = totalBudget - totalCost
  const budgetExceeded = remainingBudget < 0

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed md:top-[45%] md:-translate-y-1/2 md:right-6 bottom-0 left-0 right-0 md:left-auto md:bottom-auto bg-slate-900/95 backdrop-blur-xl border-t md:border border-white/20 md:rounded-2xl shadow-2xl z-40 md:max-w-xs"
      data-testid="floating-dashboard"
    >
      <div 
        className="flex items-center justify-between p-3 md:p-4 cursor-pointer hover:bg-white/5 transition-colors md:rounded-t-2xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-base md:text-lg font-bold text-white">{t.floatingDashboard.summary}</h3>
          <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full">
            {selectedNodes.length}
          </span>
        </div>
        <button className="text-slate-300 hover:text-white transition-colors">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {!isExpanded && (
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: 'auto' }}
          exit={{ opacity: 0, width: 0 }}
          className="px-4 pb-4 border-t border-white/10"
        >
          <div className="flex items-center justify-between text-sm pt-3">
            <span className="text-slate-300 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {t.floatingDashboard.cost}
            </span>
            <span className={`font-semibold ${budgetExceeded ? 'text-rose-400' : 'text-emerald-400'}`}>
              {formatCurrency(totalCost)}
            </span>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 space-y-4 border-t border-white/10">
              <div className="space-y-2 pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    {t.floatingDashboard.cost}
                  </span>
                  <span className={`font-semibold ${budgetExceeded ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatCurrency(totalCost)}
                  </span>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className={`h-full rounded-full transition-all ${budgetExceeded ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min((totalCost / totalBudget) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400">
                  {budgetExceeded ? (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {t.floatingDashboard.exceededBy} {formatCurrency(Math.abs(remainingBudget))}
                    </span>
                  ) : (
                    <span>{t.floatingDashboard.remaining}: {formatCurrency(remainingBudget)}</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    {t.floatingDashboard.pleasure}
                  </div>
                  <div className="text-lg font-bold text-pink-400">{avgJoy.toFixed(0)}/100</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">{t.floatingDashboard.risk}</div>
                  <div className="text-lg font-bold text-amber-400">{avgRisk.toFixed(0)}/100</div>
                </div>
                {priorityScore !== null && (
                  <div className="col-span-2 bg-indigo-500/10 border border-indigo-400/20 rounded-lg p-3 flex items-center justify-between">
                    <div className="text-xs text-slate-300 flex items-center gap-1">
                      <SlidersHorizontal className="w-3 h-3" />
                      {t.weights.priorityScore}
                    </div>
                    <div className="text-lg font-bold text-indigo-300" data-testid="priority-score">{priorityScore.toFixed(0)}/100</div>
                  </div>
                )}
              </div>

              <div className="max-h-32 overflow-y-auto space-y-2">
                {selectedNodes.map((node) => (
                  <div key={node.nodeId} className="text-xs bg-slate-800/30 rounded p-2 border border-slate-700/50">
                    <div className="font-medium text-slate-200 truncate">{node.title}</div>
                    <div className="text-slate-400">{formatCurrency(node.cost)}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default FloatingDashboard
