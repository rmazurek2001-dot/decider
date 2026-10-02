import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, XCircle } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { OperationMetrics } from './types'
import {
  formatCompact,
  formatInteger,
  formatLatency,
  formatPercent,
  formatUsd,
  interpolate,
  successLevel,
} from './format'

type SortKey =
  | 'operation'
  | 'calls'
  | 'success_rate'
  | 'avg_attempts'
  | 'p50_latency_ms'
  | 'p95_latency_ms'
  | 'tokens'
  | 'cost_usd'

type SortDirection = 'asc' | 'desc'

const sortValue = (row: OperationMetrics, key: SortKey): number | string =>
  key === 'tokens' ? row.input_tokens + row.output_tokens : row[key]

const SuccessRate =({ rate }: { rate: number }) => {
  const level = successLevel(rate)
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {level === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />}
      {level === 'critical' && <XCircle className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />}
      {formatPercent(rate)}
    </span>
  )
}

interface OperationsTableProps {
  operations: OperationMetrics[]
}

const OperationsTable = ({ operations }: OperationsTableProps) => {
  const { t } = useLanguage()
  const o = t.observability
  const locale = t.timeline.locale
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'calls', direction: 'desc' })

  const columns: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'operation', label: o.operation, align: 'left' },
    { key: 'calls', label: o.calls, align: 'right' },
    { key: 'success_rate', label: o.successRate, align: 'right' },
    { key: 'avg_attempts', label: o.attempts, align: 'right' },
    { key: 'p50_latency_ms', label: o.p50, align: 'right' },
    { key: 'p95_latency_ms', label: o.p95, align: 'right' },
    { key: 'tokens', label: o.tokens, align: 'right' },
    { key: 'cost_usd', label: o.cost, align: 'right' },
  ]

  const sorted = useMemo(() => {
    const rows = [...operations]
    rows.sort((a, b) => {
      const av = sortValue(a, sort.key)
      const bv = sortValue(b, sort.key)
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : av - Number(bv)
      return sort.direction === 'asc' ? cmp : -cmp
    })
    return rows
  }, [operations, sort])

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'operation' ? 'asc' : 'desc' }
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-bold text-slate-800 mb-4">{o.byOperation}</h3>
      {operations.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">{o.noDataInWindow}</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                {columns.map((column) => {
                  const active = sort.key === column.key
                  const SortIcon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-2 pb-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap ${
                        column.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(column.key)}
                        title={interpolate(o.sortBy, { column: column.label })}
                        className={`inline-flex items-center gap-1 transition-colors ${
                          active ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {column.label}
                        <SortIcon className={`w-3 h-3 ${active ? '' : 'opacity-40'}`} />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.operation} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-2 py-2.5 font-mono text-xs text-slate-800 whitespace-nowrap">{row.operation}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{formatInteger(row.calls, locale)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">
                    <SuccessRate rate={row.success_rate} />
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">{row.avg_attempts.toFixed(2)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{formatLatency(row.p50_latency_ms)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap">{formatLatency(row.p95_latency_ms)}</td>
                  <td
                    className="px-2 py-2.5 text-right tabular-nums text-slate-700 whitespace-nowrap"
                    title={`${o.input}: ${formatInteger(row.input_tokens, locale)} · ${o.output}: ${formatInteger(row.output_tokens, locale)}`}
                  >
                    {formatCompact(row.input_tokens, locale)} / {formatCompact(row.output_tokens, locale)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-medium text-slate-800 whitespace-nowrap">{formatUsd(row.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default OperationsTable
