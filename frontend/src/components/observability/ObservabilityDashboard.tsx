import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { motion } from 'framer-motion'
import { Activity, AlertCircle, Inbox, Loader, RefreshCw } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { fetchLLMCalls, fetchLLMMetrics } from './api'
import { interpolate } from './format'
import type { LLMCall, LLMMetrics } from './types'
import KpiTiles from './KpiTiles'
import DailyCharts from './DailyCharts'
import OperationsTable from './OperationsTable'
import ModelBreakdown from './ModelBreakdown'
import RecentCallsTable from './RecentCallsTable'

const WINDOWS = [1, 7, 30] as const
type WindowDays = (typeof WINDOWS)[number]
const RECENT_CALLS_LIMIT = 50

const ObservabilityDashboard = () => {
  const { t } = useLanguage()
  const o = t.observability
  const locale = t.timeline.locale
  const [days, setDays] = useState<WindowDays>(7)
  const [metrics, setMetrics] = useState<LLMMetrics | null>(null)
  const [calls, setCalls] = useState<LLMCall[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(async (windowDays: number) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setRefreshing(true)

    try {
      const [metricsData, callsData] = await Promise.all([
        fetchLLMMetrics(windowDays, controller.signal),
        fetchLLMCalls(RECENT_CALLS_LIMIT, controller.signal),
      ])
      setMetrics(metricsData)
      setCalls(callsData)
      setError(false)
      setUpdatedAt(new Date())
    } catch (err) {
      if (axios.isCancel(err)) return
      console.error('Failed to load LLM metrics:', err)
      setError(true)
    } finally {
      if (requestRef.current === controller) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    load(days)
  }, [days, load])

  useEffect(() => () => requestRef.current?.abort(), [])

  const windowLabels: Record<WindowDays, string> = {
    1: o.window1,
    7: o.window7,
    30: o.window30,
  }

  const isEmpty = metrics !== null && metrics.totals.calls === 0 && calls.length === 0
  const hasCallsInWindow = metrics !== null && metrics.totals.calls > 0

  const renderContent = () => {
    if (loading && !metrics) {
      return (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
          <p className="text-slate-600 text-lg">{o.loading}</p>
        </div>
      )
    }

    if (error && !metrics) {
      return (
        <div className="flex justify-center py-16">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-md text-center">
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-3" />
            <p className="text-red-800 font-semibold">{o.failedToLoad}</p>
            <p className="text-red-700 text-sm mt-1 mb-5">{o.failedToLoadDesc}</p>
            <button
              onClick={() => load(days)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              {o.tryAgain}
            </button>
          </div>
        </div>
      )
    }

    if (!metrics) return null

    if (isEmpty) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-xl shadow-lg px-6 py-16 text-center"
        >
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
            <Inbox className="w-8 h-8 text-indigo-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{o.emptyTitle}</h2>
          <p className="text-slate-600 max-w-lg mx-auto">{o.emptyDesc}</p>
        </motion.div>
      )
    }

    return (
      <div className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {o.failedToLoad}
          </div>
        )}

        <KpiTiles totals={metrics.totals} />

        <DailyCharts daily={metrics.daily} windowDays={metrics.window_days} hasCalls={hasCallsInWindow} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <OperationsTable operations={metrics.by_operation} />
          </div>
          <ModelBreakdown models={metrics.by_model} />
        </div>

        <RecentCallsTable calls={calls} />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <Activity className="w-9 h-9 text-indigo-600" />
            {o.title}
          </h1>
          <p className="text-slate-600">{o.subtitle}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label={o.timeWindow}
              className="inline-flex p-1 bg-white border border-slate-200 rounded-lg shadow-sm"
            >
              {WINDOWS.map((windowDays) => (
                <button
                  key={windowDays}
                  type="button"
                  aria-pressed={days === windowDays}
                  onClick={() => setDays(windowDays)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    days === windowDays
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {windowLabels[windowDays]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => load(days)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {o.refresh}
            </button>

            {updatedAt && (
              <span className="text-xs text-slate-500">
                {interpolate(o.updatedAt, { time: updatedAt.toLocaleTimeString(locale) })}
              </span>
            )}
          </div>
        </motion.div>

        {renderContent()}
      </div>
    </div>
  )
}

export default ObservabilityDashboard
