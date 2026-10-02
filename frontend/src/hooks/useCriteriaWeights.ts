import { useCallback, useEffect, useRef, useState } from 'react'
import type { CriteriaWeights, Project } from '../types/tree'
import { DEFAULT_WEIGHTS, normalizeWeights } from '../utils/scoring'
import { saveCriteriaWeights } from '../utils/treeApi'

export type WeightsSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const SAVE_DELAY_MS = 600

export const useCriteriaWeights = (projectId: number, project: Project | null) => {
  const [weights, setWeightsState] = useState<CriteriaWeights>(() => normalizeWeights(project?.criteria_weights))
  const [saveStatus, setSaveStatus] = useState<WeightsSaveStatus>('idle')
  const timeoutRef = useRef<number | null>(null)
  const pendingRef = useRef<CriteriaWeights | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!project) return
    setWeightsState(normalizeWeights(project.criteria_weights))
    setSaveStatus('idle')
  }, [project?.id])

  const flush = useCallback(async () => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    const requestId = ++requestIdRef.current
    try {
      await saveCriteriaWeights(projectId, pending)
      if (requestId === requestIdRef.current) setSaveStatus('saved')
    } catch (error) {
      console.error('[useCriteriaWeights] Failed to save criteria weights:', error)
      if (requestId === requestIdRef.current) setSaveStatus('error')
    }
  }, [projectId])

  const setWeights = useCallback((next: CriteriaWeights) => {
    const normalized = normalizeWeights(next)
    setWeightsState(normalized)
    setSaveStatus('saving')
    pendingRef.current = normalized
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      flush()
    }, SAVE_DELAY_MS)
  }, [flush])

  const resetWeights = useCallback(() => setWeights({ ...DEFAULT_WEIGHTS }), [setWeights])

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
      flush()
    }
  }, [flush])

  return { weights, setWeights, resetWeights, saveStatus }
}
