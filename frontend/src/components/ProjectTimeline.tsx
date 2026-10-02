import { useState, useEffect } from 'react'
import axios from 'axios'
import { Calendar, CheckCircle, Clock, AlertCircle, Loader, MapPin } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import type { ProjectTask } from '../types/tree'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface ProjectTimelineProps {
  projectId: number
  onNodeClick?: (nodeId: number) => void
}

interface TasksByMonth {
  [key: string]: ProjectTask[]
}

const ProjectTimeline = ({ projectId, onNodeClick }: ProjectTimelineProps) => {
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

  useEffect(() => {
    fetchTasks()
  }, [projectId])

  const fetchTasks = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get(
        `${API_URL}/api/projects/${projectId}/get_all_tasks/`
      )
      setTasks(response.data.tasks || [])
    } catch (err: any) {
      setError(err.response?.data?.error || t.timeline.failedToLoadTasks)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleTask = async (taskId: number, isCompleted: boolean) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}/`, {
        is_completed: isCompleted,
      })

      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, is_completed: isCompleted } : task
        )
      )
    } catch (err: any) {
      setError(t.timeline.failedToUpdateTask)
    }
  }

  const groupTasksByMonth = (): TasksByMonth => {
    const grouped: TasksByMonth = {}
    const unscheduled: ProjectTask[] = []

    tasks.forEach((task) => {
      if (!task.due_date) {
        unscheduled.push(task)
        return
      }

      const date = new Date(task.due_date)
      const monthKey = date.toLocaleDateString(
        t.timeline.locale || 'en-US',
        { year: 'numeric', month: 'long' }
      )

      if (!grouped[monthKey]) {
        grouped[monthKey] = []
      }
      grouped[monthKey].push(task)
    })

    if (unscheduled.length > 0) {
      grouped['__unscheduled__'] = unscheduled
    }

    return grouped
  }

  const isOverdue = (task: ProjectTask): boolean => {
    if (!task.due_date || task.is_completed) return false
    return new Date(task.due_date) < new Date()
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString(
      t.timeline.locale || 'en-US',
      { day: 'numeric', month: 'short' }
    )
  }

  const getSectionColor = (section: string): string => {
    const colors: { [key: string]: string } = {
      transport: 'bg-blue-100 text-blue-700 border-blue-200',
      accommodation: 'bg-purple-100 text-purple-700 border-purple-200',
      food: 'bg-orange-100 text-orange-700 border-orange-200',
      entertainment: 'bg-pink-100 text-pink-700 border-pink-200',
      activities: 'bg-green-100 text-green-700 border-green-200',
      services: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      equipment: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      other: 'bg-slate-100 text-slate-700 border-slate-200',
      general: 'bg-slate-100 text-slate-700 border-slate-200',
    }
    return colors[section] || colors.general
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">{t.timeline.loading}</p>
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

  const tasksByMonth = groupTasksByMonth()
  const monthKeys = Object.keys(tasksByMonth).filter(k => k !== '__unscheduled__')
  const unscheduledTasks = tasksByMonth['__unscheduled__'] || []

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-xl font-medium">{t.timeline.noTasks}</p>
          <p className="text-slate-400 text-sm mt-2">{t.timeline.noTasksHint}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-800 mb-3 flex items-center justify-center gap-3">
            <Calendar className="w-10 h-10 text-indigo-600" />
            {t.timeline.title}
          </h1>
          <p className="text-slate-600">{t.timeline.subtitle}</p>
        </div>

        <div className="relative">
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-200 via-indigo-300 to-indigo-200" />

          {unscheduledTasks.length > 0 && (
            <div className="mb-16">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-slate-500" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-700">
                  {t.timeline.toBeScheduled}
                </h2>
              </div>

              <div className="ml-24 space-y-4">
                {unscheduledTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={handleToggleTask}
                    onNodeClick={onNodeClick}
                    getSectionColor={getSectionColor}
                    isOverdue={false}
                    showDate={false}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {monthKeys.map((monthKey, index) => (
            <div key={monthKey} className={index > 0 ? 'mt-16' : ''}>
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                    <Calendar className="w-8 h-8 text-white" />
                  </div>
                  <div className="absolute -left-[22px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-indigo-500 border-4 border-white shadow" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">{monthKey}</h2>
              </div>

              <div className="ml-24 space-y-4">
                {tasksByMonth[monthKey].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={handleToggleTask}
                    onNodeClick={onNodeClick}
                    getSectionColor={getSectionColor}
                    isOverdue={isOverdue(task)}
                    showDate={true}
                    formatDate={formatDate}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface TaskCardProps {
  task: ProjectTask
  onToggle: (taskId: number, isCompleted: boolean) => void
  onNodeClick?: (nodeId: number) => void
  getSectionColor: (section: string) => string
  isOverdue: boolean
  showDate: boolean
  formatDate?: (date: string) => string
  t: any
}

const TaskCard = ({
  task,
  onToggle,
  onNodeClick,
  getSectionColor,
  isOverdue,
  showDate,
  formatDate,
  t,
}: TaskCardProps) => {
  return (
    <div
      className={`relative bg-white rounded-lg shadow-md hover:shadow-lg transition-all p-5 border-l-4 ${
        task.is_completed
          ? 'opacity-60 border-slate-300'
          : isOverdue
          ? 'border-red-500 bg-red-50/30'
          : 'border-indigo-500'
      }`}
    >
      <div
        className={`absolute -left-[54px] top-6 w-3 h-3 rounded-full border-4 border-white shadow ${
          task.is_completed
            ? 'bg-slate-400'
            : isOverdue
            ? 'bg-red-500'
            : 'bg-indigo-500'
        }`}
      />

      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={task.is_completed}
          onChange={(e) => onToggle(task.id, e.target.checked)}
          className="mt-1 w-5 h-5 accent-indigo-500 cursor-pointer flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          {showDate && task.due_date && (
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className={`text-sm font-medium ${
                isOverdue ? 'text-red-600' : 'text-slate-600'
              }`}>
                {formatDate && formatDate(task.due_date)}
                {isOverdue && (
                  <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                    {t.timeline.overdue}
                  </span>
                )}
              </span>
            </div>
          )}

          <h3
            className={`font-semibold text-slate-800 mb-2 ${
              task.is_completed ? 'line-through text-slate-400' : ''
            }`}
          >
            {task.title}
          </h3>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onNodeClick && onNodeClick(task.node_id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors hover:shadow-sm ${getSectionColor(
                task.node_section
              )}`}
            >
              <MapPin className="w-3 h-3" />
              {task.node_title}
            </button>

            {task.is_completed && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                {t.timeline.completed}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectTimeline
