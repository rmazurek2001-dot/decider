import dagre from 'dagre'
import { Node, Edge } from 'reactflow'

const nodeWidth = 3000
const nodeHeight = 2250
const sectionHeaderHeight = 450
const sectionSpacing = 100
const minMilestoneSpacing = 300

const sectionOrder = [
  'general', 'transport', 'accommodation', 'food', 'activities', 
  'entertainment', 'services', 'equipment', 'other',
]

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: direction, nodesep: 120, ranksep: 300 })
  nodes.forEach((node) => dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight }))
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target))
  dagre.layout(dagreGraph)
  return {
    nodes: nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id)
      return { ...node, position: { x: nodeWithPosition.x - nodeWidth / 2, y: nodeWithPosition.y - nodeHeight / 2 } }
    }),
    edges
  }
}

export const getChronologicalLayout = (
  nodes: Node[],
  _edges: Edge[],
  collapsedNodes: Set<number | string> = new Set()
): { nodes: Node[]; sectionHeaders: Array<{ section: string; y: number; nodeCount: number }> } => {
  
  const collapsedSet = new Set(Array.from(collapsedNodes).map(id => String(id)));

  const sortedInputNodes = [...nodes].sort((a, b) => (a.data.nodeId || 0) - (b.data.nodeId || 0))
  const nodesBySection = new Map<string, Node[]>()
  
  sortedInputNodes.forEach(node => {
    const section = node.data.section || 'general'
    if (!nodesBySection.has(section)) nodesBySection.set(section, [])
    nodesBySection.get(section)!.push(node)
  })

  const sortedSections = Array.from(nodesBySection.keys()).sort((a, b) => {
    const indexA = sectionOrder.indexOf(a)
    const indexB = sectionOrder.indexOf(b)
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
  })

  const layoutedNodes: Node[] = []
  const sectionHeaders: Array<{ section: string; y: number; nodeCount: number }> = []
  
  let runningY = 100 
  let globalMilestoneIndex = 0 

  sortedSections.forEach(section => {
    const sectionNodes = nodesBySection.get(section)!
    const rootNodes = sectionNodes.filter(node => {
      if (node.data.node_type !== 'milestone') return false; 
      if (!node.data.parent) return true
      const parentNode = nodes.find(n => String(n.data.nodeId) === String(node.data.parent))
      return !parentNode || parentNode.data.section !== section
    })

    if (rootNodes.length === 0) return;

    sectionHeaders.push({ section, y: runningY, nodeCount: rootNodes.length })
    runningY += sectionHeaderHeight

    rootNodes.forEach((rootNode) => {
      const startY = runningY
      const isEven = globalMilestoneIndex % 2 === 0
      
      const milestoneX = isEven ? -3500 : 3500
      const optionsX = isEven ? milestoneX - 5500 : milestoneX + 5500
      
      const { nodes: treeNodes, height: treeHeight } = layoutNodeTree(
        rootNode,
        sortedInputNodes, 
        0,
        startY,
        milestoneX,
        optionsX,
        collapsedSet
      )
      
      layoutedNodes.push(...treeNodes)
      runningY += treeHeight + minMilestoneSpacing
      globalMilestoneIndex++
    })

    runningY += sectionSpacing
  })

  return { nodes: layoutedNodes, sectionHeaders }
}

function layoutNodeTree(
  node: Node,
  allNodes: Node[],
  depth: number,
  startY: number,
  milestoneX: number,
  optionsX: number,
  collapsedSet: Set<string>
): { nodes: Node[]; height: number } {
  const layoutedNodes: Node[] = []
  const nodeIdStr = String(node.data.nodeId)
  const isCollapsed = collapsedSet.has(nodeIdStr)
  
  const FIXED_HEIGHT = 2250
  const SPACING = 300
  const TOTAL_STEP = FIXED_HEIGHT + SPACING;
  
  const nodeX = depth === 0 ? milestoneX : optionsX
  
  layoutedNodes.push({
    ...node,
    position: { x: nodeX, y: startY },
    hidden: false 
  })
  
  const children = allNodes.filter(n => String(n.data.parent) === nodeIdStr)
  children.sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
  
  if (children.length === 0 || isCollapsed) {
    if (isCollapsed) {
      children.forEach(child => layoutedNodes.push({ ...child, position: { x: optionsX, y: startY }, hidden: true }))
    }
    return { nodes: layoutedNodes, height: FIXED_HEIGHT }
  }
  
  let currentChildY = startY; 
  
  children.forEach((child) => {
    const childIdStr = String(child.data.nodeId)
    const isChildCollapsed = collapsedSet.has(childIdStr)
    
    layoutedNodes.push({
        ...child,
        position: { x: optionsX, y: currentChildY },
        hidden: false
    });
    
    const grandchildren = allNodes.filter(n => String(n.data.parent) === childIdStr)
    
    if (grandchildren.length > 0) {
      if (isChildCollapsed) {
        grandchildren.forEach(gc => {
          layoutedNodes.push({
            ...gc,
            position: { x: optionsX, y: currentChildY },
            hidden: true
          })
        })
      } else {
        let grandchildY = currentChildY + TOTAL_STEP
        grandchildren.sort((a, b) => (a.data.order || 0) - (b.data.order || 0))
        
        grandchildren.forEach(gc => {
          const { nodes: gcNodes, height: gcHeight } = layoutNodeTree(
            gc,
            allNodes,
            depth + 2,
            grandchildY,
            milestoneX,
            optionsX + 5500,
            collapsedSet
          )
          layoutedNodes.push(...gcNodes)
          grandchildY += gcHeight + SPACING
        })
        
        const grandchildrenHeight = grandchildren.length * TOTAL_STEP
        currentChildY += grandchildrenHeight
      }
    }
    
    currentChildY += TOTAL_STEP;
  })
  
  const totalChildrenHeight = children.length * TOTAL_STEP;
  return { nodes: layoutedNodes, height: Math.max(FIXED_HEIGHT, totalChildrenHeight) }
}