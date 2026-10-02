import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Armchair, Check, Heart, Loader2, RotateCcw, ShieldCheck, SlidersHorizontal, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import type { CriteriaWeights, Criterion } from '../../types/tree'
import type { WeightsSaveStatus } from '../../hooks/useCriteriaWeights'
import { CRITERIA, DEFAULT_WEIGHTS, MAX_WEIGHT, MIN_WEIGHT, WEIGHT_STEP, totalWeight, weightsEqual } from '../../utils/scoring'
import { glassButtonActiveClass, glassButtonClass } from './buttonStyles'

interface PrioritiesControlProps {
  weights: CriteriaWeights
  onChange: (weights: CriteriaWeights) => void
  onReset: () => void
  saveStatus: WeightsSaveStatus
  open: boolean
  onOpenChange: (open: boolean) => void
}

const criterionIcons: Record<Criterion, LucideIcon> = {
  comfort: Armchair,
  risk: ShieldCheck,
  time: Zap,
  pleasure: Heart,
}

const SaveIndicator = ({ status }: { status: WeightsSaveStatus }) => {
  const { t } = useLanguage()
  if (status === 'saving') {
    return <span className="flex items-center gap-1 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" />{t.weights.saving}</span>
  }
  if (status === 'saved') {
    return <span className="flex items-center gap-1 text-emerald-400"><Check className="w-3 h-3" />{t.weights.saved}</span>
  }
  if (status === 'error') {
    return <span className="flex items-center gap-1 text-rose-400"><AlertCircle className="w-3 h-3" />{t.weights.saveFailed}</span>
  }
  return null
}

const PrioritiesControl = ({ weights, onChange, onReset, saveStatus, open, onOpenChange }: PrioritiesControlProps) => {
  const { t } = useLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const total = totalWeight(weights)
  const isDefault = weightsEqual(weights, DEFAULT_WEIGHTS)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as globalThis.Node)) {
        onOpenChange(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div ref={containerRef} className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => onOpenChange(!open)}
        className={`${open ? glassButtonActiveClass : glassButtonClass} w-full`}
        title={t.weights.tooltip}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="priorities-button"
      >
        <SlidersHorizontal className="w-4 h-4" />
        {t.weights.title}
        {!isDefault && <span className="ml-auto w-2 h-2 rounded-full bg-amber-400" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            role="dialog"
            aria-label={t.weights.title}
            data-testid="priorities-panel"
            className="absolute right-full top-0 mr-3 w-72 bg-slate-900/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl p-4 text-white"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-bold">{t.weights.title}</h3>
              <button
                onClick={() => onOpenChange(false)}
                className="text-slate-400 hover:text-white transition-colors"
                aria-label={t.weights.close}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">{t.weights.description}</p>

            <div className="space-y-3">
              {CRITERIA.map(criterion => {
                const Icon = criterionIcons[criterion]
                const value = weights[criterion]
                const share = total > 0 ? Math.round((value / total) * 100) : 0
                const inputId = `priority-weight-${criterion}`
                return (
                  <div key={criterion}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label htmlFor={inputId} className="flex items-center gap-1.5 font-medium text-slate-200">
                        <Icon className="w-3.5 h-3.5 text-indigo-300" />
                        {t.weights[criterion]}
                      </label>
                      <span className="tabular-nums text-slate-300">
                        {value.toFixed(1)}
                        <span className="ml-1.5 text-slate-500">{share}%</span>
                      </span>
                    </div>
                    <input
                      id={inputId}
                      type="range"
                      min={MIN_WEIGHT}
                      max={MAX_WEIGHT}
                      step={WEIGHT_STEP}
                      value={value}
                      onChange={event => onChange({ ...weights, [criterion]: Number(event.target.value) })}
                      className="w-full accent-indigo-400 cursor-pointer"
                    />
                  </div>
                )
              })}
            </div>

            {total <= 0 && <p className="mt-3 text-xs text-amber-300">{t.weights.allZero}</p>}

            <div className="mt-4 flex items-center justify-between text-xs">
              <SaveIndicator status={saveStatus} />
              <button
                onClick={onReset}
                disabled={isDefault}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t.weights.reset}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default PrioritiesControl
