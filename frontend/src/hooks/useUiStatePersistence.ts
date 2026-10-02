import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useReactFlow } from 'reactflow'
import type { Edge, Node } from 'reactflow'
import type { Project } from '../types/tree'
import { patchProject } from '../utils/treeApi'

interface StoredUiState {
  collapsedNodes?: unknown
  viewport?: { x?: number; y?: number; zoom?: number }
  edges?: unknown
}

interface UiStatePersistenceOptions {
  projectId: number
  project: Project | null
  nodes: Node[]
  edges: Edge[]
  collapsedNodes: Set<number>
  isInitialLoadRef: MutableRefObject<boolean>
  setEdges: (edges: Edge[]) => void
  restoreCollapsed: (collapsed: Set<number>) => void
}

export const useUiStatePersistence = ({
  projectId,
  project,
  nodes,
  edges,
  collapsedNodes,
  isInitialLoadRef,
  setEdges,
  restoreCollapsed,
}: UiStatePersistenceOptions) => {
  const { getViewport, setViewport } = useReactFlow()
  const saveTimeoutRef = useRef<number | null>(null)

  const saveUiState = useCallback(async () => {
    if (!project) return
    const viewport = getViewport()
    try {
      await patchProject(projectId, {
        ui_state: {
          collapsedNodes: Array.from(collapsedNodes),
          viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
          edges,
        },
      })
    } catch (error) {
      console.error('[saveUiState] Failed to save UI state:', error)
    }
  }, [projectId, project, collapsedNodes, getViewport, edges])

  const debouncedSaveUiState = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      saveUiState()
    }, 1000)
  }, [saveUiState])

  useEffect(() => {
    if (isInitialLoadRef.current || !project) return
    debouncedSaveUiState()
  }, [edges, debouncedSaveUiState, project])

  const loadUiState = useCallback((currentNodes: Node[]) => {
    if (!project || !project.ui_state) return
    const uiState = project.ui_state as StoredUiState

    if (Array.isArray(uiState.collapsedNodes)) {
      restoreCollapsed(new Set<number>(uiState.collapsedNodes as number[]))
    }

    if (Array.isArray(uiState.edges)) {
      const currentNodeIds = new Set(currentNodes.map(n => n.id))
      const validEdges = (uiState.edges as Edge[]).filter(edge =>
        currentNodeIds.has(edge.source) && currentNodeIds.has(edge.target)
      )
      if (validEdges.length > 0) {
        setEdges(validEdges)
      }
    }

    const viewport = uiState.viewport
    if (viewport) {
      setTimeout(() => {
        setViewport({
          x: viewport.x || 0,
          y: viewport.y || 0,
          zoom: viewport.zoom || 1,
        }, { duration: 800 })
      }, 500)
    }
  }, [project, setViewport, setEdges, restoreCollapsed])

  useEffect(() => {
    if (nodes.length > 0 && project && project.ui_state && !isInitialLoadRef.current) {
      loadUiState(nodes)
    }
  }, [nodes.length, project?.id])
}
