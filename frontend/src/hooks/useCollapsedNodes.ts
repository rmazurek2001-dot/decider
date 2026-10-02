import { useCallback, useEffect, useRef, useState } from 'react'

export const useCollapsedNodes = () => {
  const [collapsedNodes, setCollapsedNodesState] = useState<Set<number>>(new Set())
  const collapsedNodesRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    collapsedNodesRef.current = collapsedNodes
  }, [collapsedNodes])

  const setCollapsedNodes = useCallback((next: Set<number>) => {
    collapsedNodesRef.current = next
    setCollapsedNodesState(next)
  }, [])

  return { collapsedNodes, collapsedNodesRef, setCollapsedNodes }
}
