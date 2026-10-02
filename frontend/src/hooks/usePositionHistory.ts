import { useCallback, useEffect, useRef, useState } from 'react'
import type { PositionMap } from '../types/tree'

export type UndoResult =
  | { status: 'empty' }
  | { status: 'atStart' }
  | { status: 'missing'; index: number }
  | { status: 'restored'; positions: PositionMap; index: number; total: number }

export const usePositionHistory = (limit = 20) => {
  const [history, setHistory] = useState<PositionMap[]>([])
  const [index, setIndex] = useState(-1)
  const indexRef = useRef(-1)

  useEffect(() => {
    indexRef.current = index
  }, [index])

  const push = useCallback((positions: PositionMap) => {
    const currentIndex = indexRef.current
    setHistory(prev => {
      const next = prev.slice(0, currentIndex + 1)
      next.push(positions)
      if (next.length > limit) {
        next.shift()
      } else {
        setIndex(next.length - 1)
      }
      return next
    })
  }, [limit])

  const getCurrent = useCallback((): PositionMap | undefined => history[indexRef.current], [history])

  const undo = useCallback((): UndoResult => {
    if (history.length === 0) return { status: 'empty' }
    if (index <= 0) return { status: 'atStart' }

    const target = index - 1
    const positions = history[target]
    if (!positions) return { status: 'missing', index: target }

    setIndex(target)
    return { status: 'restored', positions, index: target, total: history.length }
  }, [history, index])

  return { push, undo, getCurrent }
}
