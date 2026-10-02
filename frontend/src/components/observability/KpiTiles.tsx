import type { ReactNode } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Coins, Hash, Repeat, Timer, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { LLMTotals } from './types'
import {
  formatCompact,
  formatInteger,
  formatLatency,
  formatPercent,
  formatUsd,
  interpolate,
  successLevel,
} from './format'

interface KpiTileProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon: LucideIcon
  accentClass: string
}

const KpiTile = ({ label, value, detail, icon: Icon, accentClass }: KpiTileProps) => (
  <div className={`bg-white rounded-xl shadow-lg p-5 border-l-4 ${accentClass}`}>
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="text-sm font-semibold text-slate-600">{label}</h3>
      <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
    </div>
    <div className="text-3xl font-bold text-slate-800 tabular-nums">{value}</div>
    {detail && <div className="mt-1.5 text-xs text-slate-500">{detail}</div>}
  </div>
)

const successStyles = {
  good: { accent: 'border-emerald-500', icon: CheckCircle2, iconClass: 'text-emerald-600' },
  warning: { accent: 'border-amber-500', icon: AlertTriangle, iconClass: 'text-amber-600' },
  critical: { accent: 'border-red-500', icon: XCircle, iconClass: 'text-red-600' },
}

interface KpiTilesProps {
  totals: LLMTotals
}

const KpiTiles = ({ totals }: KpiTilesProps) => {
  const { t } = useLanguage()
  const o = t.observability
  const locale = t.timeline.locale
  const hasCalls = totals.calls > 0
  const failed = Math.round(totals.calls * (1 - totals.success_rate))
  const success = successStyles[successLevel(totals.success_rate)]
  const SuccessIcon = success.icon

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <KpiTile
        label={o.totalCalls}
        value={formatInteger(totals.calls, locale)}
        detail={hasCalls ? interpolate(o.failedCount, { count: failed }) : undefined}
        icon={Activity}
        accentClass="border-indigo-500"
      />
      <KpiTile
        label={o.successRate}
        value={
          hasCalls ? (
            <span className="inline-flex items-center gap-2">
              {formatPercent(totals.success_rate)}
              <SuccessIcon className={`w-5 h-5 ${success.iconClass}`} aria-hidden="true" />
            </span>
          ) : (
            '—'
          )
        }
        icon={CheckCircle2}
        accentClass={hasCalls ? success.accent : 'border-slate-300'}
      />
      <KpiTile
        label={o.avgAttempts}
        value={hasCalls ? totals.avg_attempts.toFixed(2) : '—'}
        detail={o.avgAttemptsHint}
        icon={Repeat}
        accentClass="border-purple-500"
      />
      <KpiTile
        label={o.latency}
        value={
          <span className="inline-flex items-baseline gap-1.5">
            {formatLatency(totals.p50_latency_ms)}
            <span className="text-xs font-semibold text-slate-400">{o.p50}</span>
          </span>
        }
        detail={`${o.p95}: ${formatLatency(totals.p95_latency_ms)}`}
        icon={Timer}
        accentClass="border-sky-500"
      />
      <KpiTile
        label={o.tokens}
        value={formatCompact(totals.input_tokens + totals.output_tokens, locale)}
        detail={`${o.input} ${formatCompact(totals.input_tokens, locale)} · ${o.output} ${formatCompact(totals.output_tokens, locale)}`}
        icon={Hash}
        accentClass="border-teal-500"
      />
      <KpiTile
        label={o.totalCost}
        value={formatUsd(totals.cost_usd)}
        detail={o.costHint}
        icon={Coins}
        accentClass="border-pink-500"
      />
    </div>
  )
}

export default KpiTiles
