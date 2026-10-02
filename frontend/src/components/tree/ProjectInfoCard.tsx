import { useLanguage } from '../../contexts/LanguageContext'

interface ProjectInfoCardProps {
  title: string
  budget: string
}

const ProjectInfoCard = ({ title, budget }: ProjectInfoCardProps) => {
  const { t, formatCurrency } = useLanguage()

  return (
    <div className="absolute top-32 left-4 bg-slate-900/80 backdrop-blur-xl shadow-[0_20px_70px_rgba(99,102,241,0.3)] rounded-2xl p-4 z-[5] border border-white/10 hover:shadow-[0_25px_90px_rgba(99,102,241,0.5)] transition-all max-w-xs">
      <div className="text-sm font-bold text-white line-clamp-2 mb-2">{title}</div>
      <div className="text-xs text-slate-300 flex items-center gap-2">
        <span className="text-slate-400">{t.tree.budget}:</span>
        <span className="font-semibold text-slate-100">{formatCurrency(budget)}</span>
      </div>
    </div>
  )
}

export default ProjectInfoCard
