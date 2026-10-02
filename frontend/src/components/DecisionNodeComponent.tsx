import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  DollarSign,
  Heart,
  AlertTriangle,
  Target,
  ShoppingCart,
  Home,
  Calendar,
  Users,
} from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

interface DecisionNodeData {
  nodeId: number
  title: string
  description: string
  estimated_cost: string
  vote_count?: number
  pathCost: number
  exceedsBudget: boolean
}

const getNodeIcon = (title: string) => {
  const lowerTitle = title.toLowerCase()
  if (lowerTitle.includes('venue') || lowerTitle.includes('location')) {
    return <Home className="w-4 h-4 text-indigo-600" />
  }
  if (lowerTitle.includes('catering') || lowerTitle.includes('food')) {
    return <ShoppingCart className="w-4 h-4 text-indigo-600" />
  }
  if (lowerTitle.includes('photography') || lowerTitle.includes('photo')) {
    return <Calendar className="w-4 h-4 text-indigo-600" />
  }
  if (lowerTitle.includes('music') || lowerTitle.includes('entertainment')) {
    return <Users className="w-4 h-4 text-indigo-600" />
  }
  return <Target className="w-4 h-4 text-indigo-600" />
}

const getCostBadgeColor = (cost: number) => {
  if (cost < 5000) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (cost < 15000) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-rose-100 text-rose-700 border-rose-200'
}

const DecisionNodeComponent = ({ data }: NodeProps<DecisionNodeData>) => {
  const { t, formatCurrency } = useLanguage()
  const cost = parseFloat(data.estimated_cost) || 0
  const costBadgeClass = getCostBadgeColor(cost)

  return (
    <div className="group relative">
      <div
        className={`bg-white rounded-xl shadow-lg border-2 transition-all duration-200 hover:shadow-xl hover:scale-105 ${
          data.exceedsBudget
            ? 'border-rose-500'
            : 'border-indigo-200 hover:border-indigo-400'
        }`}
        style={{ minWidth: '240px', maxWidth: '280px' }}
      >
        {data.exceedsBudget && (
          <div className="absolute -top-1 left-0 right-0 h-1 bg-rose-500 rounded-t-xl flex items-center justify-center">
            <AlertTriangle className="w-3 h-3 text-white" />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="mt-0.5">{getNodeIcon(data.title)}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm leading-tight mb-1">
                {data.title}
              </h3>
              {data.description && (
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {data.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
            <div
              className={`px-2.5 py-1 rounded-md text-xs font-medium border ${costBadgeClass}`}
            >
              <div className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                {formatCurrency(Math.round(cost))}
              </div>
            </div>

            {data.vote_count !== undefined && data.vote_count > 0 && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-pink-50 text-pink-700 text-xs font-medium">
                <Heart className="w-3 h-3 fill-pink-500 text-pink-500" />
                {data.vote_count}
              </div>
            )}
          </div>

          {data.exceedsBudget && (
            <div className="mt-2 pt-2 border-t border-rose-100">
              <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                <AlertTriangle className="w-3 h-3" />
                {t.public.budgetExceeded}
              </div>
            </div>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-indigo-500 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-indigo-500 border-2 border-white"
      />
    </div>
  )
}

export default memo(DecisionNodeComponent)


