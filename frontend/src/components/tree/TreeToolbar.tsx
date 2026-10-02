import { useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { FileDown, Link, Save, Sparkles, Target, Undo } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { CriteriaWeights } from '../../types/tree'
import type { WeightsSaveStatus } from '../../hooks/useCriteriaWeights'
import PrioritiesControl from './PrioritiesControl'
import { glassButtonClass } from './buttonStyles'

interface PrioritiesProps {
  weights: CriteriaWeights
  onChange: (weights: CriteriaWeights) => void
  onReset: () => void
  saveStatus: WeightsSaveStatus
}

interface TreeToolbarProps {
  onActionPlan: () => void
  onAutoLayout: () => void
  onSave: () => void
  onUndo: () => void
  onCenter: () => void
  onExportPDF: () => void
  onShare: () => void
  exportingPDF: boolean
  priorities?: PrioritiesProps
}

interface ToolbarButtonProps {
  onClick: () => void
  title: string
  className?: string
  disabled?: boolean
  testId?: string
  children: ReactNode
}

const ToolbarButton = ({ onClick, title, className = glassButtonClass, disabled, testId, children }: ToolbarButtonProps) => (
  <motion.button
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    disabled={disabled}
    className={className}
    title={title}
    data-testid={testId}
  >
    {children}
  </motion.button>
)

const TreeToolbar = ({
  onActionPlan,
  onAutoLayout,
  onSave,
  onUndo,
  onCenter,
  onExportPDF,
  onShare,
  exportingPDF,
  priorities,
}: TreeToolbarProps) => {
  const { t } = useLanguage()
  const [prioritiesOpen, setPrioritiesOpen] = useState(false)

  return (
    <div className={`absolute top-32 right-4 flex flex-col gap-2 ${prioritiesOpen ? 'z-[45]' : 'z-[15]'}`}>
      {priorities && (
        <PrioritiesControl {...priorities} open={prioritiesOpen} onOpenChange={setPrioritiesOpen} />
      )}

      <ToolbarButton
        onClick={onActionPlan}
        title={t.tree.actionPlanTooltip}
        className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-3 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-semibold text-sm border border-indigo-400/30"
      >
        <FileDown className="w-4 h-4" />
        {t.tree.actionPlan}
      </ToolbarButton>

      <ToolbarButton onClick={onAutoLayout} title={t.tree.autoLayoutTooltip} testId="auto-layout-button">
        <Sparkles className="w-4 h-4" />
        {t.tree.autoLayout}
      </ToolbarButton>

      <ToolbarButton onClick={onSave} title={t.tree.savePositionsTooltip} testId="btn-save-positions">
        <Save className="w-4 h-4" />
        {t.common.save}
      </ToolbarButton>

      <ToolbarButton onClick={onUndo} title={t.tree.undoTooltip} testId="btn-undo">
        <Undo className="w-4 h-4" />
        {t.tree.undo}
      </ToolbarButton>

      <ToolbarButton onClick={onCenter} title={t.common.centerView} testId="center-view-button">
        <Target className="w-4 h-4" />
        {t.tree.centerView}
      </ToolbarButton>

      <ToolbarButton
        onClick={onExportPDF}
        disabled={exportingPDF}
        title={t.tree.exportPDFTooltip}
        className={`${glassButtonClass} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <FileDown className="w-4 h-4" />
        {exportingPDF ? t.tree.exporting : t.tree.exportPDF}
      </ToolbarButton>

      <ToolbarButton
        onClick={onShare}
        title={t.tree.shareTooltip}
        className="bg-gradient-to-r from-indigo-600/80 to-purple-600/80 backdrop-blur-md border border-indigo-400/30 text-white hover:from-indigo-500/90 hover:to-purple-500/90 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
      >
        <Link className="w-4 h-4" />
        {t.tree.share}
      </ToolbarButton>
    </div>
  )
}

export default TreeToolbar
