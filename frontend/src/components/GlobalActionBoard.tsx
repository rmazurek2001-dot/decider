import { useState, useEffect } from 'react'
import axios from 'axios'
import { X, CheckCircle, Calendar, Loader, ListTodo, TrendingUp } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import type { ProjectTask } from '../types/tree'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface GlobalActionBoardProps {
  projectId: number
  isOpen: boolean
  onClose: () => void
  onTaskUpdated?: () => void
}

interface TaskStats {
  total: number
  completed: number
  pending: number
  completion_percentage: number
}

const GlobalActionBoard = ({
  projectId,
  isOpen,
  onClose,
  onTaskUpdated,
}: GlobalActionBoardProps) => {
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    completed: 0,
    pending: 0,
    completion_percentage: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

  useEffect(() => {
    if (isOpen && projectId) {
      fetchAllTasks()
    }
  }, [isOpen, projectId])

  const fetchAllTasks = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await axios.get(
        `${API_URL}/api/projects/${projectId}/get_all_tasks/`
      )
      setTasks(response.data.tasks || [])
      setStats(response.data.stats || {
        total: 0,
        completed: 0,
        pending: 0,
        completion_percentage: 0,
      })
    } catch (err: any) {
      setError(err.response?.data?.error || t.globalActionBoard.failedToLoadTasks)
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

      const newCompleted = tasks.filter(t => 
        t.id === taskId ? isCompleted : t.is_completed
      ).length
      const newPercentage = (newCompleted / tasks.length * 100)
      
      setStats(prev => ({
        ...prev,
        completed: newCompleted,
        pending: prev.total - newCompleted,
        completion_percentage: Math.round(newPercentage * 10) / 10
      }))

      if (onTaskUpdated) {
        onTaskUpdated()
      }
    } catch (err: any) {
      setError(t.globalActionBoard.failedToUpdateTask)
    }
  }

  const handleUpdateDueDate = async (taskId: number, dueDate: string | null) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}/`, {
        due_date: dueDate || null,
      })

      setTasks((prev) =>
        prev.map((task) =>
          task.id === taskId ? { ...task, due_date: dueDate } : task
        )
      )

      if (onTaskUpdated) {
        onTaskUpdated()
      }
    } catch (err: any) {
      setError(t.globalActionBoard.failedToUpdateTask)
    }
  }

  if (!isOpen) return null

  const pendingTasks = tasks.filter((t) => !t.is_completed)
  const completedTasks = tasks.filter((t) => t.is_completed)

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 w-[500px] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 flex justify-between items-center border-b border-indigo-700/30">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ListTodo className="w-6 h-6" />
              {t.globalActionBoard.title}
            </h2>
            <p className="text-sm text-indigo-100 mt-1">
              {t.globalActionBoard.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-indigo-200 text-2xl font-bold transition-colors"
            aria-label={t.common.close}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <span className="font-semibold text-slate-700">
                {t.globalActionBoard.progress}
              </span>
            </div>
            <span className="text-2xl font-bold text-indigo-600">
              {stats.completion_percentage}%
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${stats.completion_percentage}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm text-slate-600">
            <span>
              {stats.completed} / {stats.total} {t.globalActionBoard.tasksCompleted}
            </span>
            <span>
              {stats.pending} {t.globalActionBoard.remaining}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12">
              <ListTodo className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-lg font-medium">
                {t.globalActionBoard.noTasks}
              </p>
              <p className="text-slate-400 text-sm mt-2">
                {t.globalActionBoard.noTasksHint}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {pendingTasks.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-orange-500" />
                    {t.globalActionBoard.toDo} ({pendingTasks.length})
                  </h3>
                  <div className="space-y-2">
                    {pendingTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onToggle={handleToggleTask}
                        onUpdateDueDate={handleUpdateDueDate}
                      />
                    ))}
                  </div>
                </section>
              )}

              {completedTasks.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    {t.globalActionBoard.completed} ({completedTasks.length})
                  </h3>
                  <div className="space-y-2">
                    {completedTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onToggle={handleToggleTask}
                        onUpdateDueDate={handleUpdateDueDate}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

interface TaskItemProps {
  task: ProjectTask
  onToggle: (taskId: number, isCompleted: boolean) => void
  onUpdateDueDate: (taskId: number, dueDate: string | null) => void
}

const TaskItem = ({ task, onToggle, onUpdateDueDate }: TaskItemProps) => {
  const { t } = useLanguage()

  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        task.is_completed
          ? 'bg-slate-50/50 border-slate-200'
          : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.is_completed}
          onChange={(e) => onToggle(task.id, e.target.checked)}
          className="mt-1 w-5 h-5 accent-indigo-500 cursor-pointer"
        />
        <div className="flex-1 min-w-0">
          <p
            className={`font-medium ${
              task.is_completed
                ? 'line-through text-slate-400'
                : 'text-slate-700'
            }`}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700">
              {task.node_title}
            </span>
            {task.node_section && task.node_section !== 'general' && (
              <span className="text-xs text-slate-500">
                {t.sections[task.node_section as keyof typeof t.sections] || task.node_section}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={task.due_date || ''}
              onChange={(e) =>
                onUpdateDueDate(task.id, e.target.value || null)
              }
              className="text-sm px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder={t.globalActionBoard.setDueDate}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default GlobalActionBoard
