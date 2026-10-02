import { BarChart3, Calendar, LayoutGrid } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { ViewMode } from '../../types/tree'

interface ViewModeSwitcherProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  variant: 'pill' | 'panel'
}

const variantClasses = {
  pill: {
    container: 'absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center bg-slate-100/80 backdrop-blur-sm p-1 rounded-xl shadow-sm border border-slate-200',
    button: 'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
    active: 'bg-white text-indigo-600 shadow-sm',
    inactive: 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900',
  },
  panel: {
    container: 'absolute top-4 right-4 backdrop-blur-xl bg-white/90 border border-slate-200 rounded-xl shadow-lg z-[15] flex overflow-hidden',
    button: 'px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2',
    active: 'bg-indigo-600 text-white',
    inactive: 'text-slate-600 hover:bg-slate-100',
  },
}

const ViewModeSwitcher = ({ mode, onChange, variant }: ViewModeSwitcherProps) => {
  const { t } = useLanguage()
  const classes = variantClasses[variant]
  const items: Array<{ mode: ViewMode; label: string; icon: LucideIcon }> = [
    { mode: 'tree', label: t.timeline.treeView, icon: LayoutGrid },
    { mode: 'timeline', label: t.timeline.timelineView, icon: Calendar },
    { mode: 'analytics', label: t.analytics.analyticsView, icon: BarChart3 },
  ]

  return (
    <div className={classes.container}>
      {items.map(({ mode: itemMode, label, icon: Icon }) => (
        <button
          key={itemMode}
          onClick={() => onChange(itemMode)}
          className={`${classes.button} ${mode === itemMode ? classes.active : classes.inactive}`}
          title={label}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

export default ViewModeSwitcher
