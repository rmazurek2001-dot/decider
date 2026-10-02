import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Repeat, XCircle } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { LLMCall } from './types'
import {
  formatCompact,
  formatDateTime,
  formatInteger,
  formatLatency,
  formatRelativeTime,
  formatUsd,
  interpolate,
} from './format'

interface RecentCallsTableProps {
  calls: LLMCall[]
}

const RecentCallsTable = ({ calls }: RecentCallsTableProps) => {
  const { t } = useLanguage()
  const o = t.observability
  const locale = t.timeline.locale
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set())

  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [calls])

  const toggleError = (id: number) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const headers = [
    { label: o.time, align: 'left' },
    { label: o.operation, align: 'left' },
    { label: o.model, align: 'left' },
    { label: o.status, align: 'left' },
    { label: o.latency, align: 'right' },
    { label: o.tokens, align: 'right' },
    { label: o.cost, align: 'right' },
    { label: o.project, align: 'right' },
    { label: o.error, align: 'left' },
  ]

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h3 className="text-lg font-bold text-slate-800">{o.recentCalls}</h3>
        {calls.length > 0 && (
          <p className="text-xs text-slate-500">{interpolate(o.recentCallsDesc, { count: calls.length })}</p>
        )}
      </div>

      {calls.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">{o.emptyTitle}</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {headers.map((header) => (
                  <th
                    key={header.label}
                    scope="col"
                    className={`px-2 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap ${
                      header.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => {
                const expanded = expandedErrors.has(call.id)
                return (
                  <tr
                    key={call.id}
                    className={`border-b border-slate-100 last:border-0 align-top transition-colors ${
                      call.success ? 'hover:bg-slate-50' : 'bg-red-50/40 hover:bg-red-50'
                    }`}
                  >
                    <td
                      className="px-2 py-2.5 text-slate-600 whitespace-nowrap"
                      title={formatDateTime(call.created_at, locale)}
                    >
                      {formatRelativeTime(call.created_at, locale, now)}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-slate-800 whitespace-nowrap">{call.operation}</td>
                    <td className="px-2 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap">{call.model}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {call.success ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            {o.success}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                            <XCircle className="w-3 h-3" />
                            {o.failed}
                          </span>
                        )}
                        {call.attempts > 1 && (
                          <span
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
                            title={interpolate(o.attemptsCount, { count: call.attempts })}
                          >
                            <Repeat className="w-3 h-3" />
                            {call.attempts}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">
                      {formatLatency(call.latency_ms)}
                    </td>
                    <td
                      className="px-2 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap"
                      title={`${o.input}: ${formatInteger(call.input_tokens, locale)} · ${o.output}: ${formatInteger(call.output_tokens, locale)}`}
                    >
                      {formatCompact(call.input_tokens, locale)} / {formatCompact(call.output_tokens, locale)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-800 whitespace-nowrap">
                      {formatUsd(call.cost_usd)}
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {call.project !== null ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/project/${call.project}`)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium tabular-nums"
                        >
                          #{call.project}
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-xs">
                      {call.error ? (
                        <button
                          type="button"
                          onClick={() => toggleError(call.id)}
                          title={call.error}
                          aria-expanded={expanded}
                          className={`text-left text-red-700 hover:text-red-900 ${
                            expanded ? 'whitespace-pre-wrap break-words max-w-md' : 'block truncate max-w-[16rem]'
                          }`}
                        >
                          {call.error}
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default RecentCallsTable
