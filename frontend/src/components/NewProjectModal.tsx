import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader, Sparkles, FileText, LayoutTemplate, Heart, Plane, Hammer } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface NewProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onProjectCreated: () => void
}

interface Template {
  id: string
  title: string
  description: string
  icon: string
}

const NewProjectModal = ({ isOpen, onClose, onProjectCreated }: NewProjectModalProps) => {
  const [mode, setMode] = useState<'manual' | 'ai' | 'template'>('manual')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    budget_total: '',
  })
  const [aiNotes, setAiNotes] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [templateFormData, setTemplateFormData] = useState({
    title: '',
    budget_total: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen && mode === 'template' && templates.length === 0) {
      loadTemplates()
    }
  }, [isOpen, mode])

  const loadTemplates = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/projects/templates/`)
      setTemplates(response.data)
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleTemplateFormChange = (field: string, value: string) => {
    setTemplateFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const getTemplateIcon = (iconName: string) => {
    switch (iconName) {
      case 'heart':
        return Heart
      case 'plane':
        return Plane
      case 'hammer':
        return Hammer
      default:
        return LayoutTemplate
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (mode === 'ai') {
        const response = await axios.post(`${API_URL}/api/projects/build_from_notes/`, {
          notes: aiNotes,
          budget_total: formData.budget_total || '10000.00',
        })
        
        const projectId = response.data.id
        
        setFormData({ title: '', description: '', budget_total: '' })
        setAiNotes('')
        onClose()
        
        navigate(`/project/${projectId}?autoLayout=true`)
      } else if (mode === 'template') {
        if (!selectedTemplate) {
          setError(t.newProject.selectTemplateFirst)
          setLoading(false)
          return
        }

        const response = await axios.post(`${API_URL}/api/projects/create_from_template/`, {
          template_id: selectedTemplate.id,
          title: templateFormData.title,
          budget_total: templateFormData.budget_total,
        })

        const projectId = response.data.id
        
        setTemplateFormData({ title: '', budget_total: '' })
        setSelectedTemplate(null)
        onClose()
        
        navigate(`/project/${projectId}?autoLayout=true`)
      } else {
        await axios.post(`${API_URL}/api/projects/`, {
          title: formData.title,
          description: formData.description,
          budget_total: formData.budget_total || '0.00',
        })

        setFormData({ title: '', description: '', budget_total: '' })
        onProjectCreated()
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || t.newProject.failedToCreate
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  }

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: 20,
      transition: { duration: 0.2 },
    },
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          />

          <motion.div
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
          >
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-white/40 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6 flex justify-between items-center border-b border-indigo-800/30">
                <h2 className="text-2xl font-bold">{t.newProject.title}</h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="text-white hover:text-indigo-200 transition-colors"
                >
                  <X className="w-6 h-6" />
                </motion.button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-4">
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('manual')
                        setError(null)
                      }}
                      className={`flex-1 px-3 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 text-sm ${
                        mode === 'manual'
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      {t.newProject.manual}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('ai')
                        setError(null)
                      }}
                      className={`flex-1 px-3 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 text-sm ${
                        mode === 'ai'
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      {t.newProject.aiBuilder}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('template')
                        setError(null)
                        if (templates.length === 0) loadTemplates()
                      }}
                      className={`flex-1 px-3 py-2 rounded-md font-medium transition-all flex items-center justify-center gap-2 text-sm ${
                        mode === 'template'
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <LayoutTemplate className="w-4 h-4" />
                      {t.newProject.templates}
                    </button>
                  </div>

                  {mode === 'manual' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t.newProject.projectTitle} *
                        </label>
                        <input
                          type="text"
                          value={formData.title}
                          onChange={(e) => handleInputChange('title', e.target.value)}
                          placeholder={t.newProject.projectTitlePlaceholder}
                          required
                          disabled={loading}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t.newProject.description}
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => handleInputChange('description', e.target.value)}
                          placeholder={t.newProject.descriptionPlaceholder}
                          rows={3}
                          disabled={loading}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none bg-white/50 backdrop-blur-sm text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t.newProject.totalBudget}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.budget_total}
                          onChange={(e) => handleInputChange('budget_total', e.target.value)}
                          placeholder={t.newProject.budgetPlaceholder}
                          disabled={loading}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm text-slate-900"
                        />
                      </div>
                    </>
                  )}

                  {mode === 'ai' && (
                    <>
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3 mb-3">
                          <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <h3 className="font-semibold text-slate-900 mb-1">{t.newProject.aiBuilderTitle}</h3>
                            <p className="text-sm text-slate-600">
                              {t.newProject.aiBuilderDesc}
                            </p>
                          </div>
                        </div>
                        <div className="bg-white/50 rounded-lg p-3 text-xs text-slate-600 space-y-1">
                          <p><strong>{t.common.example}:</strong></p>
                          <p>{t.newProject.aiBuilderExample}</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t.newProject.yourNotes} *
                        </label>
                        <textarea
                          value={aiNotes}
                          onChange={(e) => setAiNotes(e.target.value)}
                          placeholder={t.newProject.notesPlaceholder}
                          rows={8}
                          required
                          disabled={loading}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all resize-none bg-white/50 backdrop-blur-sm text-slate-900"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                          {t.newProject.notesHint}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t.newProject.totalBudget} <span className="text-slate-400">({t.newProject.budgetOptional})</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.budget_total}
                          onChange={(e) => handleInputChange('budget_total', e.target.value)}
                          placeholder={t.newProject.budgetAiHint}
                          disabled={loading}
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm text-slate-900"
                        />
                      </div>
                    </>
                  )}

                  {mode === 'template' && (
                    <>
                      {!selectedTemplate ? (
                        <>
                          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 mb-4">
                            <div className="flex items-start gap-3">
                              <LayoutTemplate className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <h3 className="font-semibold text-slate-900 mb-1">{t.newProject.templatesTitle}</h3>
                                <p className="text-sm text-slate-600">
                                  {t.newProject.templatesDesc}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3">
                            {templates.map((template) => {
                              const IconComponent = getTemplateIcon(template.icon)
                              return (
                                <motion.button
                                  key={template.id}
                                  type="button"
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  onClick={() => setSelectedTemplate(template)}
                                  className="flex items-start gap-4 p-4 bg-white border-2 border-slate-200 rounded-xl hover:border-emerald-500 hover:shadow-md transition-all text-left"
                                >
                                  <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                                    <IconComponent className="w-6 h-6 text-white" />
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-slate-900 mb-1">{template.title}</h4>
                                    <p className="text-sm text-slate-600">{template.description}</p>
                                  </div>
                                </motion.button>
                              )
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 mb-4">
                            <div className="flex items-start gap-3">
                              {(() => {
                                const IconComponent = getTemplateIcon(selectedTemplate.icon)
                                return <IconComponent className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                              })()}
                              <div className="flex-1">
                                <h3 className="font-semibold text-slate-900 mb-1">{selectedTemplate.title}</h3>
                                <p className="text-sm text-slate-600 mb-3">{selectedTemplate.description}</p>
                                <button
                                  type="button"
                                  onClick={() => setSelectedTemplate(null)}
                                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                                >
                                  ← {t.newProject.changeTemplate}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              {t.newProject.projectTitle} *
                            </label>
                            <input
                              type="text"
                              value={templateFormData.title}
                              onChange={(e) => handleTemplateFormChange('title', e.target.value)}
                              placeholder={selectedTemplate.title}
                              required
                              disabled={loading}
                              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              {t.newProject.totalBudget} *
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={templateFormData.budget_total}
                              onChange={(e) => handleTemplateFormChange('budget_total', e.target.value)}
                              placeholder={t.newProject.budgetPlaceholder}
                              required
                              disabled={loading}
                              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all bg-white/50 backdrop-blur-sm text-slate-900"
                            />
                            <p className="text-xs text-slate-500 mt-2">
                              {t.newProject.templateBudgetHint}
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-50 border border-red-200 rounded-lg"
                    >
                      <p className="text-sm text-red-700 font-medium">{error}</p>
                    </motion.div>
                  )}
                </div>

                <div className="flex gap-3 p-6 border-t border-slate-200 bg-slate-50/50">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-lg hover:bg-white transition-all disabled:opacity-50"
                  >
                    {t.common.cancel}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={
                      loading ||
                      (mode === 'manual' && !formData.title) ||
                      (mode === 'ai' && !aiNotes) ||
                      (mode === 'template' && (!selectedTemplate || !templateFormData.title || !templateFormData.budget_total))
                    }
                    className={`flex-1 px-4 py-2.5 ${
                      mode === 'ai'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                        : mode === 'template'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                        : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800'
                    } text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2`}
                  >
                    {loading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Loader className="w-4 h-4" />
                        </motion.div>
                        {mode === 'ai' ? t.newProject.buildingWithAi : t.newProject.creating}
                      </>
                    ) : (
                      <>
                        {mode === 'ai' && <Sparkles className="w-4 h-4" />}
                        {mode === 'template' && <LayoutTemplate className="w-4 h-4" />}
                        {mode === 'ai' ? t.newProject.buildWithAi : mode === 'template' ? t.newProject.createFromTemplate : t.newProject.create}
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default NewProjectModal
