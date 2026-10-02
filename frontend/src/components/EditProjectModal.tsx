import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Save, Loader } from 'lucide-react'
import axios from 'axios'
import { useLanguage } from '../contexts/LanguageContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Project {
  id: number
  title: string
  description: string
  budget_total: string
}

interface EditProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project
  onProjectUpdated: () => void
}

const EditProjectModal = ({ isOpen, onClose, project, onProjectUpdated }: EditProjectModalProps) => {
  const { t, currency } = useLanguage()
  const [formData, setFormData] = useState({
    title: project.title,
    description: project.description,
    budget_total: project.budget_total,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFormData({
      title: project.title,
      description: project.description,
      budget_total: project.budget_total,
    })
  }, [project])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      setError(t.node.enterTitle)
      return
    }

    const budgetNum = parseFloat(formData.budget_total)
    if (isNaN(budgetNum) || budgetNum < 0) {
      setError(t.editProject.invalidBudget)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const budgetValue = formData.budget_total ? parseFloat(formData.budget_total).toFixed(2) : '0.00'

      await axios.patch(`${API_URL}/api/projects/${project.id}/`, {
        title: formData.title,
        description: formData.description,
        budget_total: budgetValue,
      })

      onClose()
      
      onProjectUpdated()
    } catch (err: any) {
      console.error('Failed to update project:', err.response?.data ?? err)
      
      let errorMessage = t.errors.failedToSave
      if (err.response?.data) {
        if (err.response.data.budget_total) {
          errorMessage = `${t.common.budget}: ${err.response.data.budget_total.join(', ')}`
        } else if (err.response.data.detail) {
          errorMessage = err.response.data.detail
        } else if (typeof err.response.data === 'string') {
          errorMessage = err.response.data
        }
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-900">
              {t.editProject.title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t.newProject.projectTitle}
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder={t.newProject.projectTitlePlaceholder}
                disabled={loading}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t.newProject.description}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder={t.newProject.descriptionPlaceholder}
                disabled={loading}
                rows={3}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-slate-100 disabled:cursor-not-allowed resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t.newProject.totalBudget}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-xs">
                  {currency}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.budget_total}
                  onChange={(e) => handleInputChange('budget_total', e.target.value)}
                  placeholder={t.newProject.budgetPlaceholder}
                  disabled={loading}
                  className="w-full pl-14 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </form>

          <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2.5 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t.common.cancel}
            </button>
            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              type="submit"
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  {t.editProject.saving}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {t.common.save}
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default EditProjectModal
