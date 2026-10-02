import { Brain, ListTodo, Settings } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { lightButtonClass } from './buttonStyles'

interface ProjectActionsProps {
  onOpenTasks: () => void
  onOpenAdvisor: () => void
  onEditProject: () => void
}

const ProjectActions = ({ onOpenTasks, onOpenAdvisor, onEditProject }: ProjectActionsProps) => {
  const { t } = useLanguage()

  return (
    <div className="absolute top-6 right-6 flex items-center gap-3 z-50">
      <button onClick={onOpenTasks} className={lightButtonClass} title={t.tree.viewAllTasks}>
        <ListTodo className="w-4 h-4" />
        {t.globalActionBoard.title}
      </button>

      <button onClick={onOpenAdvisor} className={lightButtonClass} title={t.tree.aiAdvisor}>
        <Brain className="w-4 h-4 text-indigo-600" />
        {t.tree.aiAdvisorButton}
      </button>

      <button onClick={onEditProject} className={lightButtonClass} title={t.tree.editProjectTooltip}>
        <Settings className="w-4 h-4" />
        {t.common.edit}
      </button>
    </div>
  )
}

export default ProjectActions
