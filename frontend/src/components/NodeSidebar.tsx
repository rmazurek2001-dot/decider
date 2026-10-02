import { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, Trash2, Plus, Sparkles, Heart, DollarSign, FileText, CheckCircle, XCircle, BarChart3, ListTodo, Loader, MessageCircle, Send } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import type { Task, Comment } from './TreeVisualizer'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface DecisionNode {
  id: number
  title: string
  description: string
  estimated_cost: string
  actual_cost?: string | null
  parent: number | null
  project: number
  vote_count?: number
  score_comfort?: number
  score_risk?: number
  score_time?: number
  score_pleasure?: number
  status?: 'pending' | 'selected' | 'rejected'
  tasks?: Task[]
  comments?: Comment[]
  comment_count?: number
}

interface NodeSidebarProps {
  node: DecisionNode | null
  isOpen: boolean
  onClose: () => void
  onNodesGenerated: () => void
  onNodeUpdated: (forceRefresh?: boolean) => void
  onNodeDeleted: () => void
  isReadOnly?: boolean
}

const NodeSidebar = ({
  node,
  isOpen,
  onClose,
  onNodesGenerated,
  onNodeUpdated,
  onNodeDeleted,
  isReadOnly = false,
}: NodeSidebarProps) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    estimated_cost: '',
    actual_cost: '',
    score_comfort: 50,
    score_risk: 50,
    score_time: 50,
    score_pleasure: 50,
    status: 'pending' as 'pending' | 'selected' | 'rejected',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [generatingTasks, setGeneratingTasks] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [activeTab, setActiveTab] = useState<'details' | 'discussion'>('details')
  const [newCommentAuthor, setNewCommentAuthor] = useState('')
  const [newCommentContent, setNewCommentContent] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    const savedAuthor = localStorage.getItem('comment_author_name')
    if (savedAuthor) {
      setNewCommentAuthor(savedAuthor)
    }
  }, [])

  useEffect(() => {
    if (node) {
      setFormData({
        title: node.title,
        description: node.description || '',
        estimated_cost: node.estimated_cost,
        actual_cost: node.actual_cost || '',
        score_comfort: node.score_comfort || 50,
        score_risk: node.score_risk || 50,
        score_time: node.score_time || 50,
        score_pleasure: node.score_pleasure || 50,
        status: node.status || 'pending',
      })
      setError(null)
      setSuccess(null)
    }
  }, [node])

  const handleInputChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSuccess(null)
  }

  const handleSave = async () => {
    if (!node) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await axios.patch(`${API_URL}/api/decision-nodes/${node.id}/`, {
        title: formData.title,
        description: formData.description,
        estimated_cost: formData.estimated_cost,
        actual_cost: formData.actual_cost || null,
        score_comfort: formData.score_comfort,
        score_risk: formData.score_risk,
        score_time: formData.score_time,
        score_pleasure: formData.score_pleasure,
        status: formData.status,
      })

      setSuccess(t.node.changesSavedSuccessfully)
      setTimeout(() => {
        onNodeUpdated()
        setSuccess(null)
      }, 1000)
    } catch (err: any) {
      let errorMessage = t.node.failedToSaveChanges
      
      if (err.response?.status === 400 && err.response?.data) {
        const validationErrors = err.response.data
        if (typeof validationErrors === 'object') {
          errorMessage = Object.values(validationErrors).flat().join(', ')
        } else if (validationErrors.error) {
          errorMessage = validationErrors.error
        }
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!node) return

    const confirmed = window.confirm(
      t.node.deleteConfirmWithChildren.replace('{title}', node.title)
    )

    if (!confirmed) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await axios.delete(`${API_URL}/api/decision-nodes/${node.id}/`)
      onNodeDeleted()
      onClose()
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || t.node.failedToDeleteNode
      setError(errorMessage)
      setLoading(false)
    }
  }

  const handleAddChild = async () => {
    if (!node) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await axios.post(`${API_URL}/api/decision-nodes/`, {
        project: node.project,
        parent: node.id,
        title: t.common.newOption,
        description: '',
        estimated_cost: '0.00',
      })

      setSuccess(t.node.childNodeAdded)
      setTimeout(() => {
        onNodeUpdated(true)
        setSuccess(null)
      }, 1000)
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || t.node.failedToAddChildNode
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateOptions = async () => {
    if (!node) return

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await axios.post(
        `${API_URL}/api/decision-nodes/${node.id}/generate_subnodes/`
      )

      if (response.data.created_nodes) {
        setSuccess(t.node.aiGeneratedOptionsSuccessfully)
        setTimeout(() => {
          onNodesGenerated()
          setSuccess(null)
        }, 1500)
      }
    } catch (err: any) {
      let errorMessage = t.node.failedToGenerateOptions
      
      if (err.response?.status === 429) {
        errorMessage = t.node.pleaseWait30Seconds
      } else if (err.response?.status === 503) {
        errorMessage = t.node.aiServiceNotConfigured
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateTasks = async () => {
    if (!node) return

    setGeneratingTasks(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await axios.post(
        `${API_URL}/api/decision-nodes/${node.id}/generate_tasks/`
      )

      if (response.data.node) {
        setSuccess(t.actionPlan.tasksGenerated)
        setTimeout(() => {
          onNodeUpdated(true)
          setSuccess(null)
        }, 1500)
      }
    } catch (err: any) {
      let errorMessage = t.actionPlan.failedToGenerateTasks
      
      if (err.response?.status === 429) {
        errorMessage = t.node.pleaseWait30Seconds
      } else if (err.response?.status === 503) {
        errorMessage = t.node.aiServiceNotConfigured
      } else if (err.response?.status === 400) {
        errorMessage = t.actionPlan.onlyForSelected
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error
      }
      
      setError(errorMessage)
    } finally {
      setGeneratingTasks(false)
    }
  }

  const handleToggleTask = async (taskId: number, isCompleted: boolean) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}/`, {
        is_completed: isCompleted
      })
      onNodeUpdated(true)
    } catch (err: any) {
      setError(t.actionPlan.failedToUpdateTask)
    }
  }

  const handleAddTask = async () => {
    if (!node || !newTaskTitle.trim()) return

    try {
      await axios.post(`${API_URL}/api/tasks/`, {
        node: node.id,
        title: newTaskTitle.trim(),
        is_completed: false
      })
      setNewTaskTitle('')
      onNodeUpdated(true)
    } catch (err: any) {
      setError(t.actionPlan.failedToAddTask)
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    try {
      await axios.delete(`${API_URL}/api/tasks/${taskId}/`)
      onNodeUpdated(true)
    } catch (err: any) {
      setError(t.actionPlan.failedToDeleteTask)
    }
  }

  const handleUpdateTaskDueDate = async (taskId: number, dueDate: string | null) => {
    try {
      await axios.patch(`${API_URL}/api/tasks/${taskId}/`, {
        due_date: dueDate || null
      })
      onNodeUpdated(true)
    } catch (err: any) {
      setError(t.actionPlan.failedToUpdateTask)
    }
  }

  const handleSendComment = async () => {
    if (!node || !newCommentContent.trim() || !newCommentAuthor.trim()) return

    setSendingComment(true)
    setError(null)

    try {
      localStorage.setItem('comment_author_name', newCommentAuthor.trim())

      await axios.post(`${API_URL}/api/comments/`, {
        node: node.id,
        author_name: newCommentAuthor.trim(),
        content: newCommentContent.trim()
      })

      setNewCommentContent('')
      setSuccess(t.comments.commentAdded)
      setTimeout(() => {
        onNodeUpdated(true)
        setSuccess(null)
      }, 1000)
    } catch (err: any) {
      setError(t.comments.failedToAddComment)
    } finally {
      setSendingComment(false)
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    try {
      await axios.delete(`${API_URL}/api/comments/${commentId}/`)
      onNodeUpdated(true)
    } catch (err: any) {
      setError(t.comments.failedToDeleteComment)
    }
  }

  if (!isOpen || !node) {
    return null
  }

  const tasks = node.tasks || []
  const completedTasks = tasks.filter(t => t.is_completed).length
  const totalTasks = tasks.length
  const comments = node.comments || []

  return (
    <>
      <div
        className="fixed inset-0 bg-black/10 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      <div 
        data-testid="node-sidebar"
        className="fixed right-0 top-0 md:h-full w-full md:w-96 h-[80vh] md:top-0 bottom-0 md:bottom-auto bg-white/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col border-l md:border-l border-t md:border-t-0 border-white/40 rounded-t-3xl md:rounded-t-none"
      >
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6 flex justify-between items-center border-b border-indigo-800/30">
          <div>
            <h2 className="text-lg font-semibold">{t.node.nodeDetails}</h2>
            <p className="text-sm text-indigo-100 mt-1">{t.node.editAndManage}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-indigo-200 text-2xl font-bold transition-colors"
            aria-label={t.common.closeSidebar}
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex border-b border-slate-200 bg-slate-50/50">
            <button
              onClick={() => setActiveTab('details')}
              className={`flex-1 px-6 py-4 font-semibold text-sm transition-all ${
                activeTab === 'details'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t.comments.detailsTab}
            </button>
            <button
              onClick={() => setActiveTab('discussion')}
              className={`flex-1 px-6 py-4 font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                activeTab === 'discussion'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              {t.comments.discussionTab}
              {comments.length > 0 && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {comments.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'details' ? (
              <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FileText className="w-4 h-4" />
              <h3 className="text-sm uppercase tracking-wide">{t.node.basicInfo}</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t.node.title}
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-slate-900 bg-white/50 backdrop-blur-sm"
                disabled={loading}
                placeholder={t.node.enterTitle}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t.node.description}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={4}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none text-slate-900 bg-white/50 backdrop-blur-sm"
                disabled={loading}
                placeholder={t.node.enterDescription}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <DollarSign className="w-4 h-4" />
              <h3 className="text-sm uppercase tracking-wide">{t.node.financials}</h3>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t.node.estimatedCost} ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.estimated_cost}
                onChange={(e) => handleInputChange('estimated_cost', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-slate-900 bg-white/50 backdrop-blur-sm"
                disabled={loading}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t.node.actualCost} ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.actual_cost}
                onChange={(e) => handleInputChange('actual_cost', e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-slate-900 bg-white/50 backdrop-blur-sm"
                disabled={loading}
                placeholder="0.00"
              />
              {formData.estimated_cost && formData.actual_cost && (
                <div className="mt-2">
                  {(() => {
                    const estimated = parseFloat(formData.estimated_cost)
                    const actual = parseFloat(formData.actual_cost)
                    const difference = actual - estimated
                    const isOverBudget = difference > 0
                    
                    return (
                      <div className={`text-sm font-medium px-3 py-2 rounded-lg ${
                        isOverBudget 
                          ? 'bg-red-50 text-red-700 border border-red-200' 
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {isOverBudget ? '+' : ''}{difference.toFixed(2)} $ 
                        ({isOverBudget ? t.node.overBudget : t.node.savings})
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          </section>

          {node.vote_count !== undefined && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-slate-700 font-semibold">
                <Heart className="w-4 h-4" />
                <h3 className="text-sm uppercase tracking-wide">{t.node.community}</h3>
              </div>
              <div className="bg-gradient-to-br from-pink-50 to-pink-100/50 border border-pink-200/50 rounded-lg p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-pink-600 fill-pink-600" />
                  <span className="text-sm font-medium text-pink-900">
                    {node.vote_count} {node.vote_count === 1 ? t.node.vote : t.node.votesPlural}
                  </span>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <BarChart3 className="w-4 h-4" />
              <h3 className="text-sm uppercase tracking-wide">{t.node.multiDimensionalScores}</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  🛋️ {t.node.comfort} (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.score_comfort}
                  onChange={(e) => handleInputChange('score_comfort', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ⚠️ {t.node.risk} (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.score_risk}
                  onChange={(e) => handleInputChange('score_risk', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ⏱️ {t.node.timeEfficiency} (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.score_time}
                  onChange={(e) => handleInputChange('score_time', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  😊 {t.node.joy} (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.score_pleasure}
                  onChange={(e) => handleInputChange('score_pleasure', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  disabled={loading}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <CheckCircle className="w-4 h-4" />
              <h3 className="text-sm uppercase tracking-wide">{t.node.decisionStatus}</h3>
            </div>

            {isReadOnly ? (
              <div className="py-3 px-4 rounded-lg bg-slate-100 border border-slate-200">
                <div className="flex items-center gap-2">
                  {formData.status === 'selected' && (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="font-semibold text-emerald-700">{t.node.selected}</span>
                    </>
                  )}
                  {formData.status === 'rejected' && (
                    <>
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="font-semibold text-red-700">{t.node.rejected}</span>
                    </>
                  )}
                  {formData.status === 'pending' && (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-blue-600"></div>
                      <span className="font-semibold text-blue-700">{t.node.pending}</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
              <button
                onClick={async () => {
                  if (!node) return
                  
                  const newStatus = 'pending'
                  
                  handleInputChange('status', newStatus)
                  
                  setLoading(true)
                  try {
                    await axios.patch(`${API_URL}/api/decision-nodes/${node.id}/`, {
                      title: formData.title,
                      description: formData.description,
                      estimated_cost: formData.estimated_cost,
                      score_comfort: formData.score_comfort,
                      score_risk: formData.score_risk,
                      score_time: formData.score_time,
                      score_pleasure: formData.score_pleasure,
                      status: newStatus,
                    })
                    setSuccess(t.node.statusChangedToPending)
                    setTimeout(() => {
                      onNodeUpdated()
                      setSuccess(null)
                    }, 1000)
                  } catch (err: any) {
                    console.error('[Status Button] Failed to save status:', err)
                    setError(err.response?.data?.error || t.node.failedToUpdateStatus)
                  } finally {
                    setLoading(false)
                  }
                }}
                className={`py-2.5 px-3 rounded-lg font-semibold text-sm transition-all ${
                  formData.status === 'pending'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                disabled={loading}
              >
                {t.node.pending}
              </button>
              <button
                onClick={async () => {
                  if (!node) return
                  
                  const newStatus = 'selected'
                  
                  handleInputChange('status', newStatus)
                  
                  setLoading(true)
                  try {
                    await axios.patch(`${API_URL}/api/decision-nodes/${node.id}/`, {
                      title: formData.title,
                      description: formData.description,
                      estimated_cost: formData.estimated_cost,
                      score_comfort: formData.score_comfort,
                      score_risk: formData.score_risk,
                      score_time: formData.score_time,
                      score_pleasure: formData.score_pleasure,
                      status: newStatus,
                    })
                    setSuccess(t.node.optionSelected)
                    setTimeout(() => {
                      onNodeUpdated()
                      setSuccess(null)
                    }, 1000)
                  } catch (err: any) {
                    console.error('[Status Button] Failed to save status:', err)
                    setError(err.response?.data?.error || t.node.failedToUpdateStatus)
                  } finally {
                    setLoading(false)
                  }
                }}
                className={`py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-1 ${
                  formData.status === 'selected'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                disabled={loading}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {t.node.select}
              </button>
              <button
                onClick={async () => {
                  if (!node) return
                  
                  const newStatus = 'rejected'
                  
                  handleInputChange('status', newStatus)
                  
                  setLoading(true)
                  try {
                    await axios.patch(`${API_URL}/api/decision-nodes/${node.id}/`, {
                      title: formData.title,
                      description: formData.description,
                      estimated_cost: formData.estimated_cost,
                      score_comfort: formData.score_comfort,
                      score_risk: formData.score_risk,
                      score_time: formData.score_time,
                      score_pleasure: formData.score_pleasure,
                      status: newStatus,
                    })
                    setSuccess(t.node.optionRejected)
                    setTimeout(() => {
                      onNodeUpdated()
                      setSuccess(null)
                    }, 1000)
                  } catch (err: any) {
                    console.error('[Status Button] Failed to save status:', err)
                    setError(err.response?.data?.error || t.node.failedToUpdateStatus)
                  } finally {
                    setLoading(false)
                  }
                }}
                className={`py-2.5 px-3 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-1 ${
                  formData.status === 'rejected'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                disabled={loading}
              >
                <XCircle className="w-3.5 h-3.5" />
                {t.node.reject}
              </button>
            </div>
            )}
          </section>

          {formData.status === 'selected' && (
            <section className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <ListTodo className="w-4 h-4" />
                  <h3 className="text-sm uppercase tracking-wide">{t.actionPlan.title}</h3>
                </div>
                {totalTasks > 0 && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium">
                    {completedTasks}/{totalTasks}
                  </span>
                )}
              </div>

              {!isReadOnly && (
                <button
                  onClick={handleGenerateTasks}
                  disabled={generatingTasks}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                    generatingTasks
                      ? 'bg-slate-300 cursor-not-allowed text-slate-600'
                      : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg'
                  }`}
                >
                  {generatingTasks ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      {t.actionPlan.generating}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {t.actionPlan.generateSteps}
                    </>
                  )}
                </button>
              )}

              {tasks.length > 0 && (
                <div className="space-y-2 mt-4">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3 bg-white/50 border border-slate-200 rounded-lg hover:bg-white/80 transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={task.is_completed}
                          onChange={(e) => handleToggleTask(task.id, e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-indigo-500 cursor-pointer"
                          disabled={isReadOnly}
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-sm block ${
                              task.is_completed
                                ? 'line-through text-slate-400'
                                : 'text-slate-700'
                            }`}
                          >
                            {task.title}
                          </span>
                          <div className="flex items-center gap-2 mt-2">
                            <input
                              type="date"
                              value={task.due_date || ''}
                              onChange={(e) => handleUpdateTaskDueDate(task.id, e.target.value || null)}
                              className="text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              placeholder={t.globalActionBoard.setDueDate}
                              disabled={isReadOnly}
                            />
                          </div>
                        </div>
                        {!isReadOnly && (
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-all"
                            aria-label="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isReadOnly && (
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newTaskTitle.trim()) {
                        handleAddTask()
                      }
                    }}
                    placeholder={t.actionPlan.addTaskPlaceholder}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddTask}
                    disabled={!newTaskTitle.trim()}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </section>
          )}

          {error && (
            <div className="p-4 bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200/50 rounded-lg backdrop-blur-sm">
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/50 rounded-lg backdrop-blur-sm">
              <p className="text-sm text-emerald-700 font-medium">{success}</p>
            </div>
          )}

          <section className="space-y-3 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-700 font-semibold mb-4">
              <Sparkles className="w-4 h-4" />
              <h3 className="text-sm uppercase tracking-wide">{t.node.actions}</h3>
            </div>

            <button
              onClick={handleSave}
              disabled={loading}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-slate-300 cursor-not-allowed text-slate-600'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md hover:shadow-lg'
              }`}
            >
              <Save className="w-4 h-4" />
              {t.node.saveChanges}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleAddChild}
                disabled={loading}
                className={`py-2.5 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  loading
                    ? 'bg-slate-300 cursor-not-allowed text-slate-600'
                    : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg'
                }`}
              >
                <Plus className="w-4 h-4" />
                {t.node.addChild}
              </button>

              <button
                onClick={handleDelete}
                disabled={loading}
                className={`py-2.5 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                  loading
                    ? 'bg-slate-300 cursor-not-allowed text-slate-600'
                    : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-md hover:shadow-lg'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {t.node.deleteNode}
              </button>
            </div>

            <button
              onClick={handleGenerateOptions}
              disabled={loading}
              className={`w-full py-3.5 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                loading
                  ? 'bg-slate-300 cursor-not-allowed text-slate-600'
                  : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-purple-600 hover:from-indigo-600 hover:via-purple-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              {loading ? t.node.aiIsThinking : t.node.askAiForOptions}
            </button>
          </section>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-700 font-semibold mb-4">
                  <MessageCircle className="w-4 h-4" />
                  <h3 className="text-sm uppercase tracking-wide">{t.comments.title}</h3>
                </div>

                <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
                  {comments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t.comments.noComments}</p>
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="bg-white/50 border border-slate-200 rounded-lg p-3 hover:bg-white/80 transition-all group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-semibold text-indigo-600 text-sm">
                            {comment.author_name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">
                              {new Date(comment.created_at).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-all"
                              aria-label="Delete comment"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <input
                    type="text"
                    value={newCommentAuthor}
                    onChange={(e) => setNewCommentAuthor(e.target.value)}
                    placeholder={t.comments.authorPlaceholder}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <textarea
                    value={newCommentContent}
                    onChange={(e) => setNewCommentContent(e.target.value)}
                    placeholder={t.comments.contentPlaceholder}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  />
                  <button
                    onClick={handleSendComment}
                    disabled={sendingComment || !newCommentContent.trim() || !newCommentAuthor.trim()}
                    className={`w-full py-2.5 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                      sendingComment || !newCommentContent.trim() || !newCommentAuthor.trim()
                        ? 'bg-slate-300 cursor-not-allowed text-slate-600'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md hover:shadow-lg'
                    }`}
                  >
                    {sendingComment ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        {t.comments.sending}
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        {t.comments.send}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default NodeSidebar
