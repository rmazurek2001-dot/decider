import { MarkerType } from 'reactflow'
import type { Edge, Node } from 'reactflow'
import type { CriteriaWeights, DecisionNode, NodeActions, TreeNodeData, XYPosition } from '../types/tree'
import { findBestPath } from './scoring'
import { readStoredPositions } from './layoutStorage'
import { MILESTONE_COLOR, MILESTONE_GLOW } from './treeEdges'

const MAX_DB_COORDINATE = 1000000

export const flattenTree = (nodes: DecisionNode[]): DecisionNode[] =>
  nodes.flatMap(node => [node, ...flattenTree(node.children || [])])

export const indexTree = (nodes: DecisionNode[]): Map<number, DecisionNode> => {
  const map = new Map<number, DecisionNode>()
  flattenTree(nodes).forEach(node => map.set(node.id, node))
  return map
}

export const rootIdsWithChildren = (nodes: DecisionNode[]): Set<number> => {
  const parentIds = new Set(nodes.map(n => n.parent))
  return new Set(nodes.filter(n => !n.parent && parentIds.has(n.id)).map(n => n.id))
}

export const collapsibleMilestoneIds = (nodes: DecisionNode[]): number[] =>
  nodes
    .filter(n => (n.node_type === 'milestone' || !n.parent) && n.children && n.children.length > 0)
    .map(n => n.id)

export const treeHasDbPositions = (nodes: DecisionNode[]): boolean =>
  flattenTree(nodes).some(n => Boolean(n.position_x && n.position_y && !(n.position_x === 0 && n.position_y === 0)))

const isUsableDbPosition = (node: DecisionNode) =>
  node.position_x !== null && node.position_x !== undefined &&
  node.position_y !== null && node.position_y !== undefined &&
  !(node.position_x === 0 && node.position_y === 0) &&
  Math.abs(node.position_x) < MAX_DB_COORDINATE && Math.abs(node.position_y) < MAX_DB_COORDINATE

export const collectDbPositions = (nodes: DecisionNode[]): Map<string, XYPosition> => {
  const positions = new Map<string, XYPosition>()
  flattenTree(nodes).forEach(node => {
    if (isUsableDbPosition(node)) {
      positions.set(`node-${node.id}`, { x: Number(node.position_x), y: Number(node.position_y) })
    }
  })
  return positions
}

const childrenIndex = (dataMap: Map<number, DecisionNode>) => {
  const index = new Map<number, DecisionNode[]>()
  dataMap.forEach(node => {
    if (node.parent === null || node.parent === undefined) return
    const siblings = index.get(node.parent) ?? []
    siblings.push(node)
    index.set(node.parent, siblings)
  })
  return index
}

const aggregatedCostOf = (nodeId: number, dataMap: Map<number, DecisionNode>, children: Map<number, DecisionNode[]>): number => {
  const kids = children.get(nodeId) ?? []
  if (kids.length === 0) {
    return parseFloat(dataMap.get(nodeId)?.estimated_cost ?? '0') || 0
  }
  const selectedChild = kids.find(c => c.status === 'selected')
  return selectedChild ? aggregatedCostOf(selectedChild.id, dataMap, children) : 0
}

interface BuildFlowTreeOptions {
  projectId: number
  projectBudget: number
  preservePositions: boolean
  collapsedNodes: Set<number>
  weights: CriteriaWeights
  actions: NodeActions
}

export interface FlowTree {
  nodes: Node<TreeNodeData>[]
  edges: Edge[]
  nodeMap: Map<number, DecisionNode>
  winningPath: Set<number>
  collapsedNodes: Set<number> | null
}

export const buildFlowTree = (nodesData: DecisionNode[], options: BuildFlowTreeOptions): FlowTree => {
  const { projectId, projectBudget, preservePositions, weights, actions } = options
  const flowNodes: Node<TreeNodeData>[] = []
  const flowEdges: Edge[] = []
  const flowNodeMap = new Map<number, Node<TreeNodeData>>()

  let positionMap = new Map<string, XYPosition>()
  let hasManualLayout = false

  if (preservePositions && projectId > 0) {
    positionMap = collectDbPositions(nodesData)
    if (positionMap.size > 0) {
      hasManualLayout = true
    } else {
      positionMap = readStoredPositions(projectId)
      hasManualLayout = positionMap.size > 0
    }
  }

  const dataMap = indexTree(nodesData)
  const children = childrenIndex(dataMap)

  let collapsed = options.collapsedNodes
  let collapsedChanged = false
  if (!hasManualLayout && projectId > 0) {
    const milestoneIds = Array.from(dataMap.values())
      .filter(node => node.node_type === 'milestone' || !node.parent)
      .map(node => node.id)
    if (milestoneIds.length > 0) {
      collapsed = new Set(collapsed)
      milestoneIds.forEach(id => collapsed.add(id))
      collapsedChanged = true
    }
  }

  const bestPath = findBestPath(dataMap, weights)

  const isNodeHidden = (nodeData: DecisionNode): boolean => {
    let current = nodeData.parent
    while (current) {
      if (collapsed.has(current)) return true
      const parentNode = dataMap.get(current)
      if (!parentNode) break
      current = parentNode.parent
    }
    return false
  }

  const createNode = (nodeData: DecisionNode, level: number, index: number): Node<TreeNodeData> => {
    const nodeId = `node-${nodeData.id}`
    const position = positionMap.get(nodeId) ?? { x: level * 320 + 100, y: index * 180 + 100 }
    const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
    const nodeChildren = children.get(nodeData.id) ?? []
    const hasChildren = nodeChildren.length > 0

    return {
      id: nodeId,
      type: 'decisionNode',
      position: { x: position.x, y: position.y },
      data: {
        nodeId: nodeData.id,
        title: nodeData.title,
        description: nodeData.description,
        estimated_cost: nodeData.estimated_cost,
        vote_count: nodeData.vote_count || 0,
        pathCost,
        exceedsBudget: pathCost > projectBudget,
        score_comfort: nodeData.score_comfort,
        score_risk: nodeData.score_risk,
        score_time: nodeData.score_time,
        score_pleasure: nodeData.score_pleasure,
        status: nodeData.status,
        section: nodeData.section,
        order: nodeData.order,
        node_type: nodeData.parent ? 'option' : 'milestone',
        parent: nodeData.parent,
        hasChildren,
        isCollapsed: collapsed.has(nodeData.id),
        onToggleCollapse: actions.onToggleCollapse,
        onToggleSelection: actions.onToggleSelection,
        isOnWinningPath: bestPath.has(nodeData.id),
        aggregatedCost: hasChildren
          ? aggregatedCostOf(nodeData.id, dataMap, children)
          : parseFloat(nodeData.estimated_cost) || 0,
        childrenCount: nodeChildren.length,
        selectedChildrenCount: nodeChildren.filter(c => c.status === 'selected').length,
        onAddChild: actions.onAddChild,
        onDeleteNode: actions.onDeleteNode,
        onEditNode: actions.onEditNode,
        tasks: nodeData.tasks || [],
        comments: nodeData.comments || [],
        comment_count: nodeData.comment_count || 0,
        weights,
      },
    }
  }

  const createEdge = (nodeData: DecisionNode, parentNode: Node<TreeNodeData>, flowNode: Node<TreeNodeData>): Edge => {
    const parentId = nodeData.parent as number
    const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
    const exceedsBudget = pathCost > projectBudget
    const isOnWinningPath = bestPath.has(nodeData.id) && bestPath.has(parentId)
    const isMainFlow = parentNode.data.node_type === 'milestone' && flowNode.data.node_type === 'milestone'
    const accent = isOnWinningPath ? '#f59e0b' : exceedsBudget ? '#ef4444' : MILESTONE_COLOR

    return {
      id: `edge-${parentId}-${nodeData.id}`,
      source: parentNode.id,
      target: flowNode.id,
      type: 'smoothstep',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      animated: isOnWinningPath,
      style: {
        stroke: accent,
        strokeWidth: isOnWinningPath ? 6 : (isMainFlow ? 16 : 6),
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        opacity: isMainFlow ? 1 : 0.85,
        filter: isMainFlow ? MILESTONE_GLOW : undefined,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: isMainFlow ? 40 : 26,
        height: isMainFlow ? 40 : 26,
        color: accent,
      },
      pathOptions: { borderRadius: isMainFlow ? 30 : 40 },
      zIndex: isMainFlow ? 10 : 1,
    }
  }

  const processNode = (nodeData: DecisionNode, level: number, index: number) => {
    if (isNodeHidden(nodeData)) return

    const flowNode = createNode(nodeData, level, index)
    flowNodes.push(flowNode)
    flowNodeMap.set(nodeData.id, flowNode)

    if (nodeData.parent) {
      const parentNode = flowNodeMap.get(nodeData.parent)
      if (!parentNode) return
      flowEdges.push(createEdge(nodeData, parentNode, flowNode))
    }

    nodeData.children.forEach((child, childIndex) => {
      processNode(child, level + 1, index * 10 + childIndex)
    })
  }

  nodesData.forEach((node, index) => {
    if (!node.parent) processNode(node, 0, index)
  })

  return {
    nodes: flowNodes,
    edges: flowEdges,
    nodeMap: dataMap,
    winningPath: bestPath,
    collapsedNodes: collapsedChanged ? collapsed : null,
  }
}
