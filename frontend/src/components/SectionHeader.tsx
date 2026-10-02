import { motion } from 'framer-motion'
import { EyeOff, Eye } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

interface SectionHeaderProps {
  section: string
  nodeCount: number
  y: number
  collapsed: boolean
  onToggle: () => void
}

const sectionConfig: Record<string, { label: string; labelPL: string; icon: string; color: string }> = {
  general: { label: 'Planning & Organization', labelPL: 'Planowanie i Organizacja', icon: '📋', color: 'bg-slate-100 border-slate-300 text-slate-700' },
  transport: { label: 'Transport', labelPL: 'Transport', icon: '🚗', color: 'bg-blue-100 border-blue-300 text-blue-700' },
  accommodation: { label: 'Accommodation', labelPL: 'Zakwaterowanie', icon: '🏨', color: 'bg-purple-100 border-purple-300 text-purple-700' },
  food: { label: 'Food & Dining', labelPL: 'Jedzenie', icon: '🍽️', color: 'bg-orange-100 border-orange-300 text-orange-700' },
  activities: { label: 'Activities', labelPL: 'Aktywności', icon: '🎯', color: 'bg-green-100 border-green-300 text-green-700' },
  entertainment: { label: 'Entertainment', labelPL: 'Rozrywka', icon: '🎉', color: 'bg-pink-100 border-pink-300 text-pink-700' },
  services: { label: 'Services', labelPL: 'Usługi', icon: '🛠️', color: 'bg-indigo-100 border-indigo-300 text-indigo-700' },
  equipment: { label: 'Equipment', labelPL: 'Sprzęt', icon: '📦', color: 'bg-gray-100 border-gray-300 text-gray-700' },
  other: { label: 'Other', labelPL: 'Inne', icon: '📌', color: 'bg-slate-100 border-slate-300 text-slate-700' },
}

const SectionHeader = ({ section, nodeCount, y, collapsed, onToggle }: SectionHeaderProps) => {
  const config = sectionConfig[section] || sectionConfig.general
  const { language } = useLanguage()
  const label = language === 'pl' ? config.labelPL : config.label

  const hiddenText = language === 'pl' ? 'Ukryta' : 'Hidden'
  const nodeText = nodeCount === 1 
    ? (language === 'pl' ? 'węzeł' : 'node')
    : (language === 'pl' ? 'węzłów' : 'nodes')
  const showText = language === 'pl' ? 'Pokaż sekcję' : 'Show section'
  const hideText = language === 'pl' ? 'Ukryj sekcję' : 'Hide section'

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        position: 'absolute',
        left: 20,
        top: y,
        zIndex: 1000,
      }}
      className="pointer-events-auto"
    >
      <button
        onClick={onToggle}
        title={collapsed 
          ? `${showText} ${label}`
          : `${hideText} ${label}`
        }
        className={`flex items-center gap-3 px-5 py-2.5 rounded-xl border-2 shadow-lg hover:shadow-xl transition-all ${
          collapsed 
            ? 'bg-slate-200 border-slate-400 text-slate-500 opacity-60' 
            : `${config.color}`
        } font-semibold`}
      >
        <span className="text-xl">{config.icon}</span>
        <div className="flex flex-col items-start">
          <span className="text-sm">{label}</span>
          <span className="text-xs opacity-70">
            {collapsed 
              ? hiddenText
              : `${nodeCount} ${nodeText}`
            }
          </span>
        </div>
        <motion.div
          animate={{ rotate: collapsed ? 0 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {collapsed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </motion.div>
      </button>
    </motion.div>
  )
}

export default SectionHeader
