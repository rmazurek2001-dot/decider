import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, DollarSign, Heart, Sparkles, Target } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { ScenarioMode } from '../../types/tree'
import { lightButtonClass } from './buttonStyles'

interface ScenarioMenuProps {
  onSelect: (mode: ScenarioMode) => Promise<void>
}

const ScenarioMenu = ({ onSelect }: ScenarioMenuProps) => {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  const scenarios: Array<{ mode: ScenarioMode; label: string; hint: string; icon: LucideIcon; iconClass: string; hoverClass: string }> = [
    { mode: 'budget', label: t.tree.budgetMode, hint: t.tree.budgetModeTooltip, icon: DollarSign, iconClass: 'text-emerald-600', hoverClass: 'hover:bg-emerald-50 border-b border-slate-100' },
    { mode: 'balanced', label: t.tree.balancedMode, hint: t.tree.balancedModeTooltip, icon: Target, iconClass: 'text-blue-600', hoverClass: 'hover:bg-blue-50 border-b border-slate-100' },
    { mode: 'vip', label: t.tree.vipMode, hint: t.tree.vipModeTooltip, icon: Heart, iconClass: 'text-amber-600', hoverClass: 'hover:bg-amber-50' },
  ]

  const handleSelect = async (mode: ScenarioMode) => {
    try {
      await onSelect(mode)
    } finally {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={lightButtonClass} title={t.tree.scenariosTooltip}>
        <Sparkles className="w-4 h-4 text-indigo-600" />
        {t.tree.scenarios}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-12 left-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden min-w-[280px] z-20"
        >
          {scenarios.map(({ mode, label, hint, icon: Icon, iconClass, hoverClass }) => (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className={`w-full px-4 py-3 text-left text-slate-700 transition-all flex items-center gap-3 ${hoverClass}`}
            >
              <Icon className={`w-5 h-5 ${iconClass}`} />
              <div>
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-xs text-slate-500">{hint}</div>
              </div>
            </button>
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default ScenarioMenu
