import type { DailyMetrics } from './types'

const DAY_MS = 86400000

export const interpolate = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))

export const formatUsd = (value: number): string => {
  if (value === 0) return '$0.00'
  const abs = Math.abs(value)
  if (abs < 0.0001) return '<$0.0001'
  if (abs < 1) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

export const formatUsdAxis = (value: number): string => {
  if (value === 0) return '$0'
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`
  if (Math.abs(value) < 1) return `$${value.toFixed(2)}`
  return `$${value.toFixed(0)}`
}

export const formatLatency = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`

export const formatPercent = (rate: number): string => {
  const pct = rate * 100
  return `${pct === 100 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`
}

export const formatInteger = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale).format(Math.round(value))

export const formatCompact = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)

export const formatRelativeTime = (iso: string, locale: string, now: number): string => {
  const timestamp = new Date(iso).getTime()
  if (Number.isNaN(timestamp)) return '—'
  const diffSeconds = Math.round((timestamp - now) / 1000)
  const abs = Math.abs(diffSeconds)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (abs < 45) return rtf.format(0, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour')
  return rtf.format(Math.round(diffSeconds / 86400), 'day')
}

export const formatDateTime = (iso: string, locale: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale)
}

export const formatDay = (isoDate: string, locale: string, withYear = false): string =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })

const isoDay = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10)

export const fillDailySeries = (daily: DailyMetrics[], windowDays: number): DailyMetrics[] => {
  const byDate = new Map(daily.filter((d) => d.date).map((d) => [d.date, d]))
  const dates = [...byDate.keys()].sort()
  const today = isoDay(Date.now())
  const last = dates.length > 0 && dates[dates.length - 1] > today ? dates[dates.length - 1] : today
  const end = Date.parse(`${last}T00:00:00Z`)
  let start = end - (Math.max(1, windowDays) - 1) * DAY_MS
  if (dates.length > 0) start = Math.min(start, Date.parse(`${dates[0]}T00:00:00Z`))

  const series: DailyMetrics[] = []
  for (let ts = start; ts <= end; ts += DAY_MS) {
    const date = isoDay(ts)
    series.push(byDate.get(date) ?? { date, calls: 0, cost_usd: 0, failures: 0 })
  }
  return series
}

export type SuccessLevel = 'good' | 'warning' | 'critical'

export const successLevel = (rate: number): SuccessLevel => {
  if (rate >= 0.95) return 'good'
  if (rate >= 0.8) return 'warning'
  return 'critical'
}
