import { useState } from 'react'
import axios from 'axios'
import { Heart, X, AlertCircle } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface DecisionNode {
  id: number
  title: string
  description: string
  estimated_cost: string
  parent: number | null
  project: number
  vote_count: number
}

interface PublicNodeSidebarProps {
  node: DecisionNode | null
  isOpen: boolean
  onClose: () => void
  onVoteSubmitted: () => void
  sessionId: string
}

const PublicNodeSidebar = ({
  node,
  isOpen,
  onClose,
  onVoteSubmitted,
  sessionId,
}: PublicNodeSidebarProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const { formatCurrency, t } = useLanguage()

  const handleVote = async () => {
    if (!node) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await axios.post(`${API_URL}/api/decision-nodes/${node.id}/vote/`, {
        session_id: sessionId,
      })

      if (response.data.vote_count !== undefined) {
        setSuccess(true)
        setTimeout(() => {
          onVoteSubmitted()
          setSuccess(false)
        }, 1000)
      }
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error || err.message || t.public.voteFailed
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !node) {
    return null
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-96 bg-white/80 backdrop-blur-md shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white p-6 flex justify-between items-center border-b border-indigo-800">
          <div>
            <h2 className="text-xl font-semibold">{t.public.nodeDetails}</h2>
            <p className="text-sm text-indigo-100 mt-1">{t.public.viewAndVote}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-indigo-200 text-2xl font-bold transition-colors"
            aria-label={t.common.closeSidebar}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">{node.title}</h3>
            {node.description && (
              <p className="text-slate-600 leading-relaxed">{node.description}</p>
            )}
          </section>

          <section className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <div className="text-sm text-indigo-700 font-medium mb-1">{t.public.estimatedCost}</div>
              <div className="text-2xl font-bold text-indigo-900">
                {formatCurrency(node.estimated_cost)}
              </div>
            </div>

            <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-pink-700 font-medium mb-1">{t.public.communityVotes}</div>
                  <div className="text-2xl font-bold text-pink-900 flex items-center gap-2">
                    <Heart className="w-6 h-6 fill-pink-500 text-pink-500" />
                    {node.vote_count}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-rose-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm text-emerald-600 font-medium">
                ✓ {t.public.voteSubmitted}
              </p>
            </div>
          )}

          <section className="pt-4 border-t border-slate-200">
            <button
              onClick={handleVote}
              disabled={loading || success}
              className={`w-full py-3.5 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                loading || success
                  ? 'bg-slate-400 cursor-not-allowed text-white'
                  : 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {t.public.submitting}
                </>
              ) : success ? (
                <>
                  <Heart className="w-5 h-5 fill-white text-white" />
                  {t.public.votedExclaim}
                </>
              ) : (
                <>
                  <Heart className="w-5 h-5" />
                  {t.public.voteForOption}
                </>
              )}
            </button>
          </section>
        </div>
      </div>
    </>
  )
}

export default PublicNodeSidebar
