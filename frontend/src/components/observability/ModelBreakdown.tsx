import { useMemo } from 'react'
import { Cpu } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { ModelMetrics } from './types'
import { formatInteger, formatLatency, formatPercent, formatUsd } from './format'

interface ModelBreakdownProps {
  models: ModelMetrics[]
}

const ModelBreakdown = ({ models }: ModelBreakdownProps) => {
  const { t } = useLanguage()
  const o = t.observability
  const locale = t.timeline.locale

  const sorted = useMemo(() => [...models].sort((a, b) => b.calls - a.calls), [models])
  const totalCalls = sorted.reduce((sum, m) => sum + m.calls, 0)

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-bold text-slate-800 mb-4">{o.byModel}</h3>
      {sorted.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">{o.noDataInWindow}</p>
      ) : (
        <ul className="space-y-5">
          {sorted.map((model) => {
            const share = totalCalls > 0 ? model.calls / totalCalls : 0
            return (
              <li key={model.model}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <Cpu className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="font-mono text-xs text-slate-800 truncate" title={model.model}>
                      {model.model}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">
                    {formatInteger(model.calls, locale)}
                  </span>
                </div>
                <div
                  className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"
                  role="meter"
                  aria-label={`${model.model} ${o.shareOfCalls}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(share * 100)}
                >
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${share * 100}%` }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500 tabular-nums">
                  <span>
                    {formatPercent(share)} {o.shareOfCalls.toLowerCase()}
                  </span>
                  <span>
                    {formatUsd(model.cost_usd)} · {o.p50} {formatLatency(model.p50_latency_ms)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ModelBreakdown
