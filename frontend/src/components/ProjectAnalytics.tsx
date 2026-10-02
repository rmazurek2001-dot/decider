import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { BarChart3, TrendingUp, TrendingDown, CheckCircle, Loader, AlertCircle } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface ProjectAnalyticsProps {
  projectId: number
}

interface AnalyticsData {
  budget_summary: {
    total_estimated: number
    total_actual: number
    variance: number
    variance_percentage: number
  }
  budget_by_section: Array<{
    section: string
    estimated: number
    actual: number
  }>
  scores_average: {
    comfort: number
    risk: number
    time: number
    pleasure: number
  }
  tasks_summary: {
    total_tasks: number
    completed_tasks: number
    pending_tasks: number
    completion_percentage: number
  }
  decisions_summary: {
    total_options: number
    selected: number
    rejected: number
    pending: number
  }
}

const ProjectAnalytics = ({ projectId }: ProjectAnalyticsProps) => {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t, formatCurrency } = useLanguage()

  useEffect(() => {
    fetchAnalytics()
  }, [projectId])

  const fetchAnalytics = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/analytics/`)
      setData(response.data)
    } catch (err: any) {
      setError(err.response?.data?.error || t.analytics.failedToLoad)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">{t.analytics.loading}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
          <p className="text-red-700 text-center">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Przygotuj dane dla wykresów
  const budgetChartData = data.budget_by_section.map((item) => ({
    section: t.sections[item.section as keyof typeof t.sections] || item.section,
    [t.analytics.estimated]: item.estimated,
    [t.analytics.actual]: item.actual,
  }))

  const radarChartData = [
    { subject: t.node.comfort, value: data.scores_average.comfort, fullMark: 100 },
    { subject: t.node.timeEfficiency, value: data.scores_average.time, fullMark: 100 },
    { subject: t.node.pleasure, value: data.scores_average.pleasure, fullMark: 100 },
    { subject: t.node.risk, value: 100 - data.scores_average.risk, fullMark: 100 }, // Odwrócone ryzyko
  ]

  const tasksPieData = [
    { name: t.analytics.completed, value: data.tasks_summary.completed_tasks, color: '#10b981' },
    { name: t.analytics.pending, value: data.tasks_summary.pending_tasks, color: '#94a3b8' },
  ]

  const decisionsPieData = [
    { name: t.node.statusSelected, value: data.decisions_summary.selected, color: '#10b981' },
    { name: t.node.statusRejected, value: data.decisions_summary.rejected, color: '#ef4444' },
    { name: t.node.statusPending, value: data.decisions_summary.pending, color: '#94a3b8' },
  ]

  const isSavings = data.budget_summary.variance < 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-800 mb-3 flex items-center justify-center gap-3">
            <BarChart3 className="w-10 h-10 text-indigo-600" />
            {t.analytics.title}
          </h1>
          <p className="text-slate-600">{t.analytics.subtitle}</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Budget Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-indigo-500">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">{t.analytics.totalBudget}</h3>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500">{t.analytics.estimated}</p>
                <p className="text-2xl font-bold text-slate-800">{formatCurrency(data.budget_summary.total_estimated)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">{t.analytics.actual}</p>
                <p className="text-2xl font-bold text-slate-800">{formatCurrency(data.budget_summary.total_actual)}</p>
              </div>
              {data.budget_summary.variance !== 0 && (
                <div className={`flex items-center gap-2 text-sm font-medium ${
                  isSavings ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {isSavings ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                  <span>
                    {isSavings ? t.node.savings : t.node.overBudget}: {formatCurrency(Math.abs(data.budget_summary.variance))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Tasks Progress Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-emerald-500">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">{t.analytics.tasksProgress}</h3>
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
              <div>
                <p className="text-3xl font-bold text-slate-800">{data.tasks_summary.completion_percentage}%</p>
                <p className="text-xs text-slate-500">
                  {data.tasks_summary.completed_tasks} / {data.tasks_summary.total_tasks} {t.analytics.tasksCompleted}
                </p>
              </div>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{ width: `${data.tasks_summary.completion_percentage}%` }}
              />
            </div>
          </div>

          {/* Decisions Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">{t.analytics.decisionsMade}</h3>
            <p className="text-4xl font-bold text-slate-800 mb-3">{data.decisions_summary.selected}</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t.analytics.totalOptions}:</span>
                <span className="font-medium text-slate-700">{data.decisions_summary.total_options}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-600">{t.node.statusSelected}:</span>
                <span className="font-medium text-emerald-700">{data.decisions_summary.selected}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-600">{t.node.statusRejected}:</span>
                <span className="font-medium text-red-700">{data.decisions_summary.rejected}</span>
              </div>
            </div>
          </div>

          {/* Average Score Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-amber-500">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">{t.analytics.avgScore}</h3>
            <p className="text-4xl font-bold text-slate-800 mb-3">
              {Math.round((data.scores_average.comfort + data.scores_average.time + data.scores_average.pleasure + (100 - data.scores_average.risk)) / 4)}
            </p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t.node.comfort}:</span>
                <span className="font-medium text-slate-700">{data.scores_average.comfort}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.node.timeEfficiency}:</span>
                <span className="font-medium text-slate-700">{data.scores_average.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.node.pleasure}:</span>
                <span className="font-medium text-slate-700">{data.scores_average.pleasure}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Budget by Section Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t.analytics.budgetBySection}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={budgetChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="section" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey={t.analytics.estimated} fill="#6366f1" radius={[8, 8, 0, 0]} />
                <Bar dataKey={t.analytics.actual} fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Decision Profile Radar Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t.analytics.decisionProfile}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarChartData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar
                  name={t.analytics.avgScore}
                  dataKey="value"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.6}
                />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Tasks Status Pie Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t.analytics.tasksStatus}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tasksPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tasksPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Decisions Status Pie Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">{t.analytics.decisionsStatus}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={decisionsPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {decisionsPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectAnalytics
