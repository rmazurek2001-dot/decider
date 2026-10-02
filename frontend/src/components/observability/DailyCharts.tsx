import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useLanguage } from '../../contexts/LanguageContext'
import type { DailyMetrics } from './types'
import { fillDailySeries, formatDay, formatInteger, formatUsd, formatUsdAxis } from './format'

const COLORS = {
  successful: '#6366f1',
  failures: '#ef4444',
  cost: '#8b5cf6',
  grid: '#e2e8f0',
  cursor: '#f1f5f9',
}

const CHART_HEIGHT = 260
const axisTick = { fontSize: 12, fill: '#64748b' }

interface ChartDatum extends DailyMetrics {
  label: string
  successful: number
}

interface TooltipRow {
  label: string
  value: string
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: ChartDatum }>
  buildRows: (datum: ChartDatum) => TooltipRow[]
  locale: string
}

const ChartTooltip = ({ active, payload, buildRows, locale }: ChartTooltipProps) => {
  const datum = payload?.[0]?.payload
  if (!active || !datum) return null

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[150px]">
      <p className="font-semibold text-slate-800 mb-1.5">{formatDay(datum.date, locale, true)}</p>
      <div className="space-y-1">
        {buildRows(datum).map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500">
              {row.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />}
              {row.label}
            </span>
            <span className="font-semibold text-slate-800 tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const ChartCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="bg-white rounded-xl shadow-lg p-6">
    <h3 className="text-lg font-bold text-slate-800 mb-4">{title}</h3>
    {children}
  </div>
)

const EmptyChart = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: CHART_HEIGHT }}>
    {message}
  </div>
)

interface DailyChartsProps {
  daily: DailyMetrics[]
  windowDays: number
  hasCalls: boolean
}

const DailyCharts = ({ daily, windowDays, hasCalls }: DailyChartsProps) => {
  const { t } = useLanguage()
  const o = t.observability
  const locale = t.timeline.locale

  const data = useMemo<ChartDatum[]>(
    () =>
      fillDailySeries(daily, windowDays).map((d) => ({
        ...d,
        label: formatDay(d.date, locale),
        successful: Math.max(0, d.calls - d.failures),
      })),
    [daily, windowDays, locale]
  )

  const legendFormatter = (value: string) => <span className="text-xs text-slate-600">{value}</span>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title={o.dailyCalls}>
        {hasCalls ? (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: COLORS.grid }} minTickGap={16} />
              <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                cursor={{ fill: COLORS.cursor }}
                content={
                  <ChartTooltip
                    locale={locale}
                    buildRows={(d) => [
                      { label: o.successful, value: formatInteger(d.successful, locale), color: COLORS.successful },
                      { label: o.failures, value: formatInteger(d.failures, locale), color: COLORS.failures },
                      { label: o.calls, value: formatInteger(d.calls, locale) },
                    ]}
                  />
                }
              />
              <Legend iconType="circle" iconSize={8} formatter={legendFormatter} />
              <Bar
                dataKey="successful"
                name={o.successful}
                stackId="calls"
                fill={COLORS.successful}
                stroke="#ffffff"
                strokeWidth={1}
                maxBarSize={28}
                shape={(props: any) => (
                  <Rectangle {...props} radius={props.payload?.failures > 0 ? 0 : [4, 4, 0, 0]} />
                )}
              />
              <Bar
                dataKey="failures"
                name={o.failures}
                stackId="calls"
                fill={COLORS.failures}
                stroke="#ffffff"
                strokeWidth={1}
                maxBarSize={28}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message={o.noDataInWindow} />
        )}
      </ChartCard>

      <ChartCard title={o.dailyCost}>
        {hasCalls ? (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: COLORS.grid }} minTickGap={16} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={64} tickFormatter={formatUsdAxis} />
              <Tooltip
                cursor={{ fill: COLORS.cursor }}
                content={
                  <ChartTooltip
                    locale={locale}
                    buildRows={(d) => [
                      { label: o.cost, value: formatUsd(d.cost_usd), color: COLORS.cost },
                      { label: o.calls, value: formatInteger(d.calls, locale) },
                    ]}
                  />
                }
              />
              <Bar dataKey="cost_usd" name={o.cost} fill={COLORS.cost} maxBarSize={28} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message={o.noDataInWindow} />
        )}
      </ChartCard>
    </div>
  )
}

export default DailyCharts
