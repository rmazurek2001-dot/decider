import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { motion } from 'framer-motion'
import { Plus, Sparkles, Calendar } from 'lucide-react'
import NewProjectModal from './NewProjectModal'
import { useLanguage } from '../contexts/LanguageContext'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface Project {
  id: number
  title: string
  description: string
  budget_total: string
  created_at?: string
  share_token?: string
}

const ProjectDashboard = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const navigate = useNavigate()
  const { t, formatCurrency } = useLanguage()

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/projects/`)
      setProjects(response.data.results || response.data)
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleProjectCreated = () => {
    setIsModalOpen(false)
    fetchProjects()
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 30,
      },
    },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full"
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-12"
      >
        <h1 className="text-4xl font-bold text-slate-900 mb-2">{t.nav.projects}</h1>
        <p className="text-slate-600">{t.dashboard.title}</p>
      </motion.div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsModalOpen(true)}
        className="mb-8 px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
      >
        <Plus className="w-5 h-5" />
        {t.dashboard.createNew}
      </motion.button>

      {projects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center justify-center py-20"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mb-6"
          >
            <Sparkles className="w-16 h-16 text-indigo-400" />
          </motion.div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t.dashboard.noProjects}</h2>
          <p className="text-slate-600 mb-6">{t.dashboard.noProjectsDesc}</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsModalOpen(true)}
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
          >
            {t.dashboard.createFirst}
          </motion.button>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {projects.map((project) => {
            const budget = parseFloat(project.budget_total)
            const budgetPercentage = Math.min(100, (budget / 100000) * 100)

            return (
              <motion.div
                key={project.id}
                variants={cardVariants}
                whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
                onClick={() => navigate(`/project/${project.id}`)}
                className="bg-white/90 backdrop-blur-xl rounded-2xl border border-white/40 p-6 cursor-pointer shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all"
              >
                <div className="mb-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-slate-900 line-clamp-2">
                      {project.title}
                    </h3>
                    {project.share_token && (
                      <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                        {t.dashboard.shared}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2">{project.description}</p>
                </div>

                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600">{t.common.budget}</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(budget)}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${budgetPercentage}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Calendar className="w-4 h-4" />
                    {project.created_at
                      ? new Date(project.created_at).toLocaleDateString(t.timeline.locale)
                      : t.common.recentlyCreated}
                  </div>
                  <motion.div
                    whileHover={{ x: 4 }}
                    className="text-indigo-600 font-semibold text-sm"
                  >
                    {t.dashboard.open} →
                  </motion.div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      )}

      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  )
}

export default ProjectDashboard
