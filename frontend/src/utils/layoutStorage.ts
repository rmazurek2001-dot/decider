import type { Node } from 'reactflow'
import type { PositionMap, XYPosition } from '../types/tree'

const MAX_STORED_COORDINATE = 1000000

const storageKeys = (projectId: number) => ({
  positions: `project-${projectId}-positions`,
  manual: `project-${projectId}-manual-layout`,
  collapsed: `project-${projectId}-collapsed`,
})

export const isManualLayout = (projectId: number) =>
  localStorage.getItem(storageKeys(projectId).manual) === 'true'

export const setManualLayout = (projectId: number, manual: boolean) => {
  const key = storageKeys(projectId).manual
  if (manual) {
    localStorage.setItem(key, 'true')
  } else {
    localStorage.removeItem(key)
  }
}

export const storePositions = (projectId: number, positions: PositionMap) => {
  localStorage.setItem(storageKeys(projectId).positions, JSON.stringify(positions))
}

export const storeCollapsed = (projectId: number, collapsed: Iterable<number>) => {
  localStorage.setItem(storageKeys(projectId).collapsed, JSON.stringify(Array.from(collapsed)))
}

export const clearStoredLayout = (projectId: number) => {
  const keys = storageKeys(projectId)
  localStorage.removeItem(keys.manual)
  localStorage.removeItem(keys.positions)
  localStorage.removeItem(keys.collapsed)
}

export const readStoredCollapsed = (projectId: number): Set<number> | null => {
  const saved = localStorage.getItem(storageKeys(projectId).collapsed)
  if (!saved) return null
  try {
    return new Set<number>(JSON.parse(saved))
  } catch (e) {
    console.error('[layoutStorage] Failed to parse saved collapsed nodes:', e)
    return null
  }
}

export const readStoredPositions = (projectId: number): Map<string, XYPosition> => {
  const result = new Map<string, XYPosition>()
  const saved = localStorage.getItem(storageKeys(projectId).positions)
  if (!saved) return result
  try {
    const positions = JSON.parse(saved) as PositionMap
    Object.entries(positions).forEach(([nodeId, position]) => {
      if (Math.abs(position.x) < MAX_STORED_COORDINATE && Math.abs(position.y) < MAX_STORED_COORDINATE) {
        result.set(nodeId, position)
      } else {
        console.warn(`[layoutStorage] Skipping extreme stored position: ${nodeId} (${position.x}, ${position.y})`)
      }
    })
  } catch (e) {
    console.error('[layoutStorage] Failed to parse saved positions:', e)
  }
  return result
}

export const positionsOf = (nodes: Node[], isValid: (position: XYPosition) => boolean = () => true): PositionMap => {
  const positions: PositionMap = {}
  nodes.forEach(node => {
    if (isValid(node.position)) {
      positions[node.id] = node.position
    }
  })
  return positions
}

export const positionsDiffer = (current: PositionMap, previous: PositionMap | undefined): boolean => {
  if (!previous) return true
  const currentKeys = Object.keys(current)
  if (currentKeys.length !== Object.keys(previous).length) return true
  return currentKeys.some(key => {
    const last = previous[key]
    return !last || current[key].x !== last.x || current[key].y !== last.y
  })
}
