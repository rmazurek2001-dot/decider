import { MarkerType, Position } from 'reactflow'
import type { Edge, Node } from 'reactflow'

export const MILESTONE_COLOR = '#4ade80'
export const MILESTONE_GLOW = 'drop-shadow(0 0 24px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 48px rgba(74, 222, 128, 0.6))'

interface MilestoneEdgeOptions {
  markerSize: number
  borderRadius: number
  idSuffix?: (index: number) => string
}

const isOptionNode = (node: Node) => node.data.node_type === 'option' || node.data.node_type === 'decision'

export const isHiddenByCollapse = (
  node: Node,
  collapsedSections: Set<string>,
  collapsedNodes: Set<number>
): boolean => {
  const section = node.data.section || 'general'
  if (collapsedSections.has(section)) return true
  if (node.data.node_type === 'milestone') return false
  if (isOptionNode(node) && node.data.parent) {
    return collapsedNodes.has(node.data.parent)
  }
  return false
}

export const applyCollapseVisibility = (
  nodes: Node[],
  collapsedSections: Set<string>,
  collapsedNodes: Set<number>
): Node[] => nodes.map(node => ({ ...node, hidden: isHiddenByCollapse(node, collapsedSections, collapsedNodes) }))

export const withVerticalHandles = (nodes: Node[]): Node[] =>
  nodes.map(node => ({ ...node, targetPosition: Position.Top, sourcePosition: Position.Bottom }))

export const buildMilestoneChainEdges = (visibleNodes: Node[], options: MilestoneEdgeOptions): Edge[] => {
  const milestones = visibleNodes.filter(n => n.data.node_type === 'milestone')
  const edges: Edge[] = []

  for (let i = 0; i < milestones.length - 1; i++) {
    const source = milestones[i]
    const target = milestones[i + 1]
    edges.push({
      id: `ms-edge-${source.data.nodeId}-${target.data.nodeId}${options.idSuffix ? options.idSuffix(i) : ''}`,
      source: source.id,
      target: target.id,
      type: 'smoothstep',
      animated: false,
      style: {
        strokeWidth: 12,
        stroke: MILESTONE_COLOR,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        filter: MILESTONE_GLOW,
        opacity: 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: options.markerSize,
        height: options.markerSize,
        color: MILESTONE_COLOR,
      },
      pathOptions: { borderRadius: options.borderRadius },
      zIndex: 10,
    })
  }

  return edges
}

const optionEdgeStyle = (node: Node) => {
  if (node.data.status === 'selected') return { color: '#10b981', width: 10, opacity: 1 }
  if (node.data.status === 'rejected') return { color: '#ef4444', width: 6, opacity: 0.7 }
  return { color: '#94a3b8', width: 6, opacity: 0.8 }
}

export const buildOptionEdges = (visibleNodes: Node[]): Edge[] => {
  const edges: Edge[] = []

  visibleNodes.forEach(node => {
    if (!isOptionNode(node) || !node.data.parent) return
    const parentNode = visibleNodes.find(n => n.data.nodeId === node.data.parent)
    if (!parentNode || parentNode.data.node_type !== 'milestone') return

    const isSelected = node.data.status === 'selected'
    const style = optionEdgeStyle(node)

    edges.push({
      id: `opt-edge-${parentNode.data.nodeId}-${node.data.nodeId}`,
      source: parentNode.id,
      target: node.id,
      type: 'smoothstep',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      animated: isSelected,
      style: {
        strokeWidth: style.width,
        stroke: style.color,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        opacity: style.opacity,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
        color: style.color,
      },
      pathOptions: { borderRadius: 50, offset: 20 },
      zIndex: isSelected ? 10 : 1,
    })
  })

  return edges
}

export const buildManualConnectionEdge = (
  source: string,
  target: string,
  sourceHandle?: string | null,
  targetHandle?: string | null
): Edge => ({
  id: `edge-${source}-${target}`,
  source,
  target,
  type: 'smoothstep',
  sourceHandle: sourceHandle || 'bottom',
  targetHandle: targetHandle || 'top',
  animated: true,
  style: {
    strokeWidth: 6,
    stroke: MILESTONE_COLOR,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    opacity: 0.8,
  },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 20,
    height: 20,
    color: MILESTONE_COLOR,
  },
  pathOptions: { borderRadius: 40 },
})
