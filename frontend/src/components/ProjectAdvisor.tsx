import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { Brain, Sparkles, AlertTriangle, Lightbulb, Package, X, Loader2, CheckCircle2, Zap } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Analysis {
  summary: string
  risks: string[]
  missing_items: string[]
  recommendations: string[]
}

interface Suggestion {
  action_type: string
  node_title?: string
  parent_title?: string
  node_id: number | null
  parent_id?: number | null
  changes: Record<string, any>
  reason: string
  impact: string
}

interface ProjectAdvisorProps {
  projectId: number
  isOpen: boolean
  onClose: () => void
  onSuggestionsApplied?: () => void
}

const ProjectAdvisor = ({ projectId, isOpen, onClose, onSuggestionsApplied }: ProjectAdvisorProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null)
  const { t, language } = useLanguage()

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/analyze_project/`, {
        params: { language },
      })
      setAnalysis(response.data)
      
      await handleGetSuggestions()
    } catch (err: any) {
      const errorMessage =
        err.response?.status === 503
          ? t.advisor.aiNotConfigured
          : err.response?.data?.error || err.message || t.advisor.failedToAnalyze
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleGetSuggestions = async () => {
    setLoadingSuggestions(true)
    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/get_suggestions/`, {
        params: { language },
      })
      setSuggestions(response.data)
    } catch (err: any) {
      console.error('Failed to get suggestions:', err)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const handleApplySuggestion = async (suggestion: Suggestion, index: number) => {
    setApplyingIndex(index)
    try {
      const response = await axios.post(
        `${API_URL}/api/projects/${projectId}/apply_suggestion/`,
        { suggestion }
      )
      
      if (response.data.success) {
        setSuggestions(prev => prev.filter((_, i) => i !== index))
        
        if (onSuggestionsApplied) {
          onSuggestionsApplied()
        }
        
      }
    } catch (err: any) {
      console.error('Failed to apply suggestion:', err)
      const errorMessage = err.response?.data?.error || t.advisor.failedToApply
      alert(`${t.common.error}: ${errorMessage}`)
    } finally {
      setApplyingIndex(null)
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        >
          <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white p-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <motion.div
                animate={{
                  backgroundPosition: ['0% 0%', '100% 100%'],
                }}
                transition={{
                  duration: 20,
                  repeat: Infinity,
                  repeatType: 'reverse',
                }}
                className="w-full h-full"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 50%)',
                  backgroundSize: '200% 200%',
                }}
              />
            </div>

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{
                    rotate: [0, 360],
                  }}
                  transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center"
                >
                  <Brain className="w-7 h-7 text-white" />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold">{t.advisor.title}</h2>
                  <p className="text-purple-100 text-sm">{t.advisor.poweredBy}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {!analysis && !loading && !error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-12"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    repeatType: 'reverse',
                  }}
                  className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center"
                >
                  <Sparkles className="w-12 h-12 text-purple-600" />
                </motion.div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  {t.advisor.readyTitle}
                </h3>
                <p className="text-slate-600 mb-6 max-w-md mx-auto">
                  {t.advisor.readyDesc}
                </p>
                <button
                  onClick={handleAnalyze}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 mx-auto"
                >
                  <Brain className="w-5 h-5" />
                  {t.advisor.getAdvice}
                </button>
              </motion.div>
            )}

            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-16 h-16 mx-auto mb-4"
                >
                  <Loader2 className="w-16 h-16 text-purple-600" />
                </motion.div>
                <p className="text-slate-600 font-medium">{t.advisor.analyzing}</p>
                <p className="text-slate-400 text-sm mt-2">{t.advisor.analyzingDesc}</p>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-50 border border-red-200 rounded-xl p-6 text-center"
              >
                <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-3" />
                <p className="text-red-800 font-medium mb-4">{error}</p>
                <button
                  onClick={handleAnalyze}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  {t.advisor.tryAgain}
                </button>
              </motion.div>
            )}

            {analysis && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-5 h-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-slate-900">{t.advisor.projectSummary}</h3>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{analysis.summary}</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg font-semibold text-slate-900">{t.advisor.identifiedRisks}</h3>
                  </div>
                  <ul className="space-y-3">
                    {analysis.risks.map((risk, index) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <span className="flex-shrink-0 w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center text-amber-800 text-sm font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-slate-700 flex-1">{risk}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-slate-900">{t.advisor.missingItems}</h3>
                  </div>
                  <ul className="space-y-3">
                    {analysis.missing_items.map((item, index) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-200 rounded-full flex items-center justify-center text-blue-800 text-sm font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-slate-700 flex-1">{item}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-lg font-semibold text-slate-900">
                      {t.advisor.recommendations}
                    </h3>
                  </div>
                  <ul className="space-y-3">
                    {analysis.recommendations.map((rec, index) => (
                      <motion.li
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 + index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <span className="flex-shrink-0 w-6 h-6 bg-emerald-200 rounded-full flex items-center justify-center text-emerald-800 text-sm font-semibold">
                          {index + 1}
                        </span>
                        <span className="text-slate-700 flex-1">{rec}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>

                {suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-xl p-6"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-5 h-5 text-violet-600" />
                      <h3 className="text-lg font-semibold text-slate-900">
                        {t.advisor.actionableSuggestions}
                      </h3>
                      <span className="ml-auto text-xs bg-violet-200 text-violet-800 px-2 py-1 rounded-full font-semibold">
                        {suggestions.length} {t.advisor.suggestionsCount}
                      </span>
                    </div>
                    <p className="text-slate-600 text-sm mb-4">
                      {t.advisor.suggestionsDesc}
                    </p>
                    <div className="space-y-3">
                      {suggestions.map((suggestion, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.9 + index * 0.1 }}
                          className="bg-white border border-violet-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 bg-violet-200 rounded-full flex items-center justify-center text-violet-800 text-sm font-semibold mt-0.5">
                              {index + 1}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div>
                                  <p className="text-slate-900 font-medium mb-1">
                                    {suggestion.reason}
                                  </p>
                                  <p className="text-slate-600 text-sm">
                                    <span className="font-semibold">{t.advisor.effect}:</span> {suggestion.impact}
                                  </p>
                                  {suggestion.node_title && (
                                    <p className="text-slate-500 text-xs mt-1">
                                      {t.advisor.node}: {suggestion.node_title}
                                    </p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleApplySuggestion(suggestion, index)}
                                  disabled={applyingIndex !== null}
                                  className="flex-shrink-0 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                                >
                                  {applyingIndex === index ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      {t.advisor.applying}
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      {t.advisor.apply}
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {loadingSuggestions && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-4"
                  >
                    <Loader2 className="w-6 h-6 text-violet-600 mx-auto animate-spin" />
                    <p className="text-slate-600 text-sm mt-2">{t.advisor.generatingSuggestions}</p>
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                  className="flex gap-3 pt-4"
                >
                  <button
                    onClick={handleAnalyze}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    {t.advisor.analyzeAgain}
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-colors"
                  >
                    {t.advisor.close}
                  </button>
                </motion.div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ProjectAdvisor
