import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from 'reactflow'
import type { Connection, NodeDragHandler, NodeMouseHandler } from 'reactflow'
import 'reactflow/dist/style.css'
import { ChevronsDown, ChevronsUp } from 'lucide-react'
import NodeSidebar from './NodeSidebar'
import CustomNode from './CustomNode'
import ProjectAdvisor from './ProjectAdvisor'
import AIChat from './AIChat'
import SectionHeader from './SectionHeader'
import FloatingDashboard from './FloatingDashboard'
import EditProjectModal from './EditProjectModal'
import GlobalActionBoard from './GlobalActionBoard'
import ProjectTimeline from './ProjectTimeline'
import ProjectAnalytics from './ProjectAnalytics'
import ViewModeSwitcher from './tree/ViewModeSwitcher'
import ProjectInfoCard from './tree/ProjectInfoCard'
import ProjectActions from './tree/ProjectActions'
import ScenarioMenu from './tree/ScenarioMenu'
import TreeToolbar from './tree/TreeToolbar'
import ShareToast from './tree/ShareToast'
import { lightButtonClass } from './tree/buttonStyles'
import { useLanguage } from '../contexts/LanguageContext'
import { useCollapsedNodes } from '../hooks/useCollapsedNodes'
import { useCriteriaWeights } from '../hooks/useCriteriaWeights'
import { usePositionHistory } from '../hooks/usePositionHistory'
import { useUiStatePersistence } from '../hooks/useUiStatePersistence'
import { getChronologicalLayout } from '../utils/layoutUtils'
import { exportProjectToPDF } from '../utils/pdfExport'
import { buildActionPlan, downloadJson, selectedOptionsOf } from '../utils/actionPlan'
import { findBestPath } from '../utils/scoring'
import {
  buildFlowTree,
  collapsibleMilestoneIds,
  flattenTree,
  rootIdsWithChildren,
  treeHasDbPositions,
} from '../utils/treeBuilder'
import {
  applyCollapseVisibility,
  buildManualConnectionEdge,
  buildMilestoneChainEdges,
  buildOptionEdges,
  withVerticalHandles,
} from '../utils/treeEdges'
import {
  clearStoredLayout,
  isManualLayout,
  positionsDiffer,
  positionsOf,
  readStoredCollapsed,
  setManualLayout,
  storeCollapsed,
  storePositions,
} from '../utils/layoutStorage'
import {
  applyScenario,
  createNode,
  deleteNode,
  fetchNode,
  fetchProject,
  fetchProjectTree,
  patchNode,
  saveLayout,
} from '../utils/treeApi'
import type {
  DecisionNode,
  NodeActions,
  Project,
  ScenarioMode,
  SectionHeaderInfo,
  ViewMode,
  XYPosition,
} from '../types/tree'

export type { Task, ProjectTask, Comment, DecisionNode } from '../types/tree'

interface TreeVisualizerProps {
  projectId: number
}

const nodeTypes = {
  decisionNode: CustomNode,
}

const SHOW_SECTION_HEADERS = false
const MAX_DRAG_COORDINATE = 50000

const gridOverlayStyle = {
  backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px)',
  backgroundSize: '50px 50px',
}

const isWithinDragRange = (position: XYPosition) =>
  Math.abs(position.x) < MAX_DRAG_COORDINATE && Math.abs(position.y) < MAX_DRAG_COORDINATE

const TreeVisualizer = ({ projectId }: TreeVisualizerProps) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<DecisionNode | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [nodeDataMap, setNodeDataMap] = useState<Map<number, DecisionNode>>(new Map())
  const [project, setProject] = useState<Project | null>(null)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [globalActionBoardOpen, setGlobalActionBoardOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [sectionHeaders, setSectionHeaders] = useState<SectionHeaderInfo[]>([])
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [isUpdatingProjectMeta, setIsUpdatingProjectMeta] = useState(false)
  const [shouldAutoLayout, setShouldAutoLayout] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [shareToastVisible, setShareToastVisible] = useState(false)
  const [allExpanded, setAllExpanded] = useState(true)

  const { collapsedNodes, collapsedNodesRef, setCollapsedNodes } = useCollapsedNodes()
  const { push: saveToHistory, undo: undoPositions, getCurrent: currentHistoryState } = usePositionHistory()
  const { weights, setWeights, resetWeights, saveStatus } = useCriteriaWeights(projectId, project)
  const weightsRef = useRef(weights)
  weightsRef.current = weights

  const saveHistoryTimeoutRef = useRef<number | null>(null)
  const savePositionTimeoutRef = useRef<number | null>(null)
  const isInitialLoadRef = useRef(true)
  const onLayoutRef = useRef<() => void>()
  const nodeActionsRef = useRef<NodeActions | null>(null)
  const hasAutoLayoutedRef = useRef<Record<number, boolean>>({})
  const prevCollapsedNodesSize = useRef(0)

  const { fitView, getNodes } = useReactFlow()
  const { formatCurrency, t } = useLanguage()

  useUiStatePersistence({
    projectId,
    project,
    nodes,
    edges,
    collapsedNodes,
    isInitialLoadRef,
    setEdges,
    restoreCollapsed: setCollapsedNodes,
  })

  const nodeActions = useMemo<NodeActions>(() => ({
    onToggleCollapse: nodeId => nodeActionsRef.current?.onToggleCollapse(nodeId),
    onToggleSelection: nodeId => nodeActionsRef.current?.onToggleSelection(nodeId),
    onAddChild: nodeId => nodeActionsRef.current?.onAddChild(nodeId),
    onDeleteNode: nodeId => nodeActionsRef.current?.onDeleteNode(nodeId),
    onEditNode: nodeId => nodeActionsRef.current?.onEditNode(nodeId),
  }), [])

  const forceCenterView = useCallback(() => {
    setTimeout(() => {
      window.requestAnimationFrame(() => {
        fitView({
          padding: 0.5,
          duration: 1000,
          maxZoom: 0.25,
          minZoom: 0.05,
          includeHiddenNodes: false,
        })
      })
    }, 200)
  }, [fitView])

  const handleToggleSelection = useCallback(async (nodeId: number) => {
    const nodeData = nodeDataMap.get(nodeId)
    if (!nodeData) {
      console.error(`[handleToggleSelection] Node ${nodeId} not found in nodeDataMap`)
      return
    }

    const newStatus = (nodeData.status || 'pending') === 'selected' ? 'pending' : 'selected'

    try {
      await patchNode(nodeId, { status: newStatus })

      setNodeDataMap(prev => {
        const newMap = new Map(prev)
        const node = newMap.get(nodeId)
        if (node) {
          node.status = newStatus
        }
        return newMap
      })

      setNodes(currentNodes =>
        currentNodes.map(node =>
          node.data.nodeId === nodeId
            ? { ...node, data: { ...node.data, status: newStatus } }
            : node
        )
      )
    } catch (error) {
      console.error(`[handleToggleSelection] Failed to update node ${nodeId}:`, error)
    }
  }, [nodeDataMap, setNodes])

  const onToggleCollapse = useCallback((nodeId: number) => {
    const wasCollapsed = collapsedNodesRef.current.has(nodeId)
    const newSet = new Set(collapsedNodesRef.current)
    if (wasCollapsed) {
      newSet.delete(nodeId)
    } else {
      newSet.add(nodeId)
    }
    setCollapsedNodes(newSet)

    setNodes(currentNodes =>
      currentNodes.map(node =>
        node.data.nodeId === nodeId
          ? { ...node, data: { ...node.data, isCollapsed: !wasCollapsed } }
          : node
      )
    )

    setTimeout(() => {
      const hadManualFlag = isManualLayout(projectId)
      if (hadManualFlag) {
        setManualLayout(projectId, false)
      }

      onLayoutRef.current?.()

      if (hadManualFlag) {
        setTimeout(() => setManualLayout(projectId, true), 300)
      }
    }, 50)
  }, [projectId, setNodes, setCollapsedNodes])

  const applyVisibilityFilter = useCallback(() => {
    setNodes(currentNodes => {
      const updatedNodes = applyCollapseVisibility(currentNodes, collapsedSections, collapsedNodesRef.current)
      const visibleNodes = updatedNodes.filter(n => !n.hidden)
      const timestamp = Date.now()
      const milestoneEdges = buildMilestoneChainEdges(visibleNodes, {
        markerSize: 40,
        borderRadius: 30,
        idSuffix: index => `-${timestamp}-${index}`,
      })

      setEdges(() => [...milestoneEdges, ...buildOptionEdges(visibleNodes)])

      return updatedNodes
    })
  }, [collapsedNodes, collapsedSections, setNodes, setEdges])

  const onLayout = useCallback(() => {
    if (isInitialLoadRef.current) {
      console.warn('[onLayout] Skipped: initial load in progress')
      return
    }

    if (isManualLayout(projectId)) {
      applyVisibilityFilter()
      return
    }

    const { nodes: layoutedNodes, sectionHeaders: headers } = getChronologicalLayout(
      nodes,
      edges,
      collapsedNodesRef.current
    )

    const updatedNodes = withVerticalHandles(
      applyCollapseVisibility(layoutedNodes, collapsedSections, collapsedNodesRef.current)
    )
    const visibleNodes = updatedNodes.filter(n => !n.hidden)

    setNodes(updatedNodes)
    setEdges([
      ...buildMilestoneChainEdges(visibleNodes, { markerSize: 48, borderRadius: 40 }),
      ...buildOptionEdges(visibleNodes),
    ])
    setSectionHeaders(headers)

    storePositions(projectId, positionsOf(layoutedNodes))
    saveLayout(projectId, layoutedNodes).catch(error => {
      console.error('[onLayout] Failed to save layout:', error)
    })
  }, [nodes, edges, setNodes, setEdges, projectId, collapsedSections, collapsedNodes, applyVisibilityFilter])

  useEffect(() => {
    onLayoutRef.current = onLayout
  }, [onLayout])

  const toggleSectionCollapse = useCallback((section: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })

    setTimeout(() => {
      onLayout()
    }, 100)
  }, [onLayout])

  const onExportPDF = useCallback(async () => {
    if (!project) return

    setExportingPDF(true)
    try {
      const nodesData = Array.from(nodeDataMap.values()).map(node => ({
        id: node.id,
        title: node.title,
        description: node.description,
        estimated_cost: node.estimated_cost,
        section: node.section,
        order: node.order,
        node_type: node.node_type,
        score_comfort: node.score_comfort,
        score_risk: node.score_risk,
        score_time: node.score_time,
        score_pleasure: node.score_pleasure,
        status: node.status,
      }))

      const result = await exportProjectToPDF(project, nodesData, 'react-flow-wrapper', formatCurrency, t.pdf)

      if (!result.success) {
        console.error('PDF export failed:', result.error)
        alert(t.tree.failedToExportPDF)
      }
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert(t.tree.failedToExportPDF)
    } finally {
      setExportingPDF(false)
    }
  }, [project, nodeDataMap, formatCurrency, t])

  const onShareProject = useCallback(async () => {
    if (!project) return

    const shareUrl = `${window.location.origin}/share/${project.share_token}`

    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareToastVisible(true)
      setTimeout(() => setShareToastVisible(false), 3000)
    } catch (error) {
      console.error('Failed to copy share link:', error)
      alert(t.tree.shareLink.replace('{url}', shareUrl))
    }
  }, [project, t])

  const onUndoPositions = useCallback(() => {
    const result = undoPositions()

    switch (result.status) {
      case 'empty':
        alert(t.tree.noHistoryToRestore)
        return
      case 'atStart':
        alert(t.tree.noEarlierStates)
        return
      case 'missing':
        alert(t.tree.errorStateNotFound)
        console.error('[onUndoPositions] State not found at index', result.index)
        return
      case 'restored':
        setNodes(currentNodes =>
          currentNodes.map(node =>
            result.positions[node.id] ? { ...node, position: result.positions[node.id] } : node
          )
        )
        alert(t.tree.restoredToState
          .replace('{current}', String(result.index + 1))
          .replace('{total}', String(result.total)))
    }
  }, [undoPositions, setNodes, t])

  const onSavePositions = useCallback(() => {
    if (isInitialLoadRef.current) {
      console.warn('[onSavePositions] Skipped: initial load in progress')
      return
    }

    const positions = positionsOf(nodes)
    if (positionsDiffer(positions, currentHistoryState())) {
      saveToHistory(positions)
    }

    storePositions(projectId, positions)
    setManualLayout(projectId, true)
    storeCollapsed(projectId, collapsedNodes)

    const message = t.tree.savedPositions.replace('{count}', String(nodes.length))
    saveLayout(projectId, nodes)
      .then(() => alert(message))
      .catch(error => {
        console.error('[onSavePositions] Failed to save layout:', error)
        alert(message)
      })
  }, [nodes, projectId, saveToHistory, currentHistoryState, t, collapsedNodes])

  const onToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      setCollapsedNodes(new Set(collapsibleMilestoneIds(Array.from(nodeDataMap.values()))))
      setAllExpanded(false)
    } else {
      setCollapsedNodes(new Set())
      setAllExpanded(true)
    }
    applyVisibilityFilter()
  }, [allExpanded, nodeDataMap, applyVisibilityFilter, setCollapsedNodes])

  const loadProject = useCallback(async () => {
    try {
      setProject(await fetchProject(projectId))
    } catch (err) {
      console.error('Error fetching project:', err)
    }
  }, [projectId])

  const fetchTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const treeData = await fetchProjectTree(projectId)

      if (treeData.length > 0) {
        const projectBudget = project ? parseFloat(project.budget_total) : 0
        const hasManualLayout = isManualLayout(projectId)
        const hasDbPositions = treeHasDbPositions(treeData)

        if (!hasManualLayout && !hasDbPositions) {
          const rootsWithChildren = rootIdsWithChildren(flattenTree(treeData))
          if (rootsWithChildren.size > 0) {
            setCollapsedNodes(rootsWithChildren)
          }
        } else if (hasManualLayout) {
          const savedCollapsed = readStoredCollapsed(projectId)
          if (savedCollapsed) {
            setCollapsedNodes(savedCollapsed)
          }
        }

        const tree = buildFlowTree(treeData, {
          projectId,
          projectBudget,
          preservePositions: true,
          collapsedNodes: collapsedNodesRef.current,
          weights: weightsRef.current,
          actions: nodeActions,
        })

        if (tree.collapsedNodes) {
          setCollapsedNodes(tree.collapsedNodes)
        }

        if (hasDbPositions && !hasManualLayout) {
          setManualLayout(projectId, true)
        }

        setNodes(tree.nodes)
        setEdges(tree.edges)
        setNodeDataMap(tree.nodeMap)
      } else {
        setNodes([])
        setEdges([])
        setNodeDataMap(new Map())
      }
    } catch (err) {
      console.error('Error fetching tree:', err)
      setError(t.tree.failedToLoadTree)
    } finally {
      setLoading(false)
    }
  }, [projectId, project, setNodes, setEdges, nodeActions, setCollapsedNodes])

  const handleAddChild = useCallback(async (parentId: number) => {
    const parentNode = nodeDataMap.get(parentId)
    if (!parentNode) return

    try {
      const newNode = await createNode({
        project: parentNode.project,
        parent: parentNode.id,
        title: t.common.newOption,
        description: '',
        estimated_cost: '0.00',
      })

      await fetchTree()

      setSelectedNode(newNode)
      setSidebarOpen(true)
    } catch (error) {
      console.error('[handleAddChild] Failed to create child node:', error)
    }
  }, [nodeDataMap, fetchTree, t])

  const handleDeleteNode = useCallback(async (nodeId: number) => {
    try {
      await deleteNode(nodeId)
      fetchTree()
      setSidebarOpen(false)
      setSelectedNode(null)
    } catch (error) {
      console.error(`[handleDeleteNode] Failed to delete node ${nodeId}:`, error)
    }
  }, [fetchTree])

  const handleEditNode = useCallback((nodeId: number) => {
    const node = nodeDataMap.get(nodeId)
    if (node) {
      setSelectedNode(node)
      setSidebarOpen(true)
    } else {
      console.warn(`[handleEditNode] Node ${nodeId} not found in nodeDataMap`)
    }
  }, [nodeDataMap])

  nodeActionsRef.current = {
    onToggleCollapse,
    onToggleSelection: handleToggleSelection,
    onAddChild: handleAddChild,
    onDeleteNode: handleDeleteNode,
    onEditNode: handleEditNode,
  }

  useEffect(() => {
    if (projectId) {
      loadProject()
    }
  }, [projectId, loadProject])

  const initialLayoutRef = useRef<() => void>()
  initialLayoutRef.current = () => {
    onLayout()
    forceCenterView()
  }

  useEffect(() => {
    if (projectId && project && !isUpdatingProjectMeta) {
      fetchTree()

      setTimeout(() => {
        isInitialLoadRef.current = false
        if (!isManualLayout(projectId)) {
          initialLayoutRef.current?.()
        }
      }, 2000)
    }
  }, [projectId, project, fetchTree, isUpdatingProjectMeta])

  useEffect(() => {
    const bestPath = findBestPath(nodeDataMap, weights)
    setNodes(currentNodes => {
      let changed = false
      const nextNodes = currentNodes.map(node => {
        const isOnWinningPath = bestPath.has(node.data.nodeId)
        if (node.data.isOnWinningPath === isOnWinningPath && node.data.weights === weights) return node
        changed = true
        return { ...node, data: { ...node.data, isOnWinningPath, weights } }
      })
      return changed ? nextNodes : currentNodes
    })
  }, [weights, nodeDataMap, setNodes])

  useEffect(() => {
    if (shouldAutoLayout && nodes.length > 0 && !loading) {
      onLayout()
      setShouldAutoLayout(false)

      setTimeout(() => {
        fitView({ padding: 0.3, duration: 800, maxZoom: 0.8, minZoom: 0.1 })
      }, 300)
    }
  }, [shouldAutoLayout, nodes.length, loading, onLayout, fitView])

  useEffect(() => {
    const autoLayout = searchParams.get('autoLayout')
    if (autoLayout === 'true' && nodes.length > 0 && !loading) {
      setTimeout(() => {
        onLayout()
        searchParams.delete('autoLayout')
        setSearchParams(searchParams)

        setTimeout(() => {
          fitView({ padding: 0.3, duration: 800, maxZoom: 0.8, minZoom: 0.1 })
        }, 300)
      }, 500)
    }
  }, [searchParams, nodes.length, loading, onLayout, setSearchParams, fitView])

  useEffect(() => {
    hasAutoLayoutedRef.current[projectId] = false
  }, [projectId])

  useEffect(() => {
    if (nodes.length === 0 || loading || hasAutoLayoutedRef.current[projectId]) return

    const attemptFitView = () => {
      const visibleNodes = getNodes().filter(n => !n.hidden)
      const ready = visibleNodes.length > 0 && visibleNodes.every(n => n.width && n.width > 0)
      if (!ready) return false

      const hasPositions = visibleNodes.some(n => Math.abs(n.position.x) > 1 || Math.abs(n.position.y) > 1)

      if (hasPositions) {
        applyVisibilityFilter()
        saveToHistory(positionsOf(nodes))

        window.requestAnimationFrame(() => {
          fitView({
            padding: 0.5,
            duration: 1000,
            maxZoom: 0.25,
            minZoom: 0.05,
            includeHiddenNodes: false,
          })
        })
      } else {
        onLayout()
        setTimeout(() => saveToHistory(positionsOf(nodes)), 800)
      }

      hasAutoLayoutedRef.current[projectId] = true
      return true
    }

    let attempts = 0
    const intervalId = setInterval(() => {
      attempts++
      const success = attemptFitView()

      if (success || attempts > 20) {
        clearInterval(intervalId)
        if (!success) console.warn('[TreeVisualizer] Timed out waiting for node dimensions before fitting the view')
      }
    }, 100)

    return () => clearInterval(intervalId)
  }, [nodes.length, loading, projectId, getNodes, fitView, onLayout, applyVisibilityFilter, saveToHistory])

  useEffect(() => {
    if (collapsedNodes.size > 0 &&
        collapsedNodes.size !== prevCollapsedNodesSize.current &&
        nodes.length > 0 &&
        !loading) {
      prevCollapsedNodesSize.current = collapsedNodes.size
      if (isManualLayout(projectId)) return

      setTimeout(() => {
        onLayoutRef.current?.()
      }, 100)
    }
  }, [collapsedNodes.size, nodes.length, loading, projectId])

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const nodeId = node.data.nodeId
    if (!nodeId) return
    const nodeData = nodeDataMap.get(nodeId)
    if (nodeData) {
      setSelectedNode(nodeData)
      setSidebarOpen(true)
    }
  }, [nodeDataMap])

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
    setSelectedNode(null)
  }, [])

  const handleNodesGenerated = useCallback(() => {
    fetchTree()
    setShouldAutoLayout(true)
  }, [fetchTree])

  const handleNodeUpdated = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      fetchTree()
      if (selectedNode) {
        const updatedNode = nodeDataMap.get(selectedNode.id)
        if (updatedNode) {
          setSelectedNode(updatedNode)
        }
      }
      return
    }

    if (!selectedNode) return

    try {
      const updatedNodeData = await fetchNode(selectedNode.id)

      setNodeDataMap(prev => {
        const newMap = new Map(prev)
        newMap.set(updatedNodeData.id, updatedNodeData)
        return newMap
      })

      setNodes(currentNodes =>
        currentNodes.map(node =>
          node.data.nodeId === updatedNodeData.id
            ? { ...node, data: { ...node.data, ...updatedNodeData } }
            : node
        )
      )

      setSelectedNode(updatedNodeData)

      setTimeout(() => {
        applyVisibilityFilter()
      }, 50)
    } catch (err) {
      console.error('[handleNodeUpdated] Failed to fetch updated node:', err)
      fetchTree()
    }
  }, [selectedNode, setNodes, fetchTree, nodeDataMap, applyVisibilityFilter])

  const handleNodeDeleted = useCallback(() => {
    setSidebarOpen(false)
    setSelectedNode(null)
    fetchTree()
  }, [fetchTree])

  const handleProjectUpdated = useCallback(async () => {
    setIsUpdatingProjectMeta(true)
    try {
      setProject(await fetchProject(projectId))
      setTimeout(() => {
        setIsUpdatingProjectMeta(false)
      }, 100)
    } catch (error) {
      console.error('Error refreshing project:', error)
      setIsUpdatingProjectMeta(false)
    }
  }, [projectId])

  const onConnect = useCallback((params: Connection) => {
    const { source, target } = params
    if (!source || !target) return
    setEdges(eds => [...eds, buildManualConnectionEdge(source, target, params.sourceHandle, params.targetHandle)])
  }, [setEdges])

  const onNodeDragStop: NodeDragHandler = useCallback((_event, node) => {
    if (isInitialLoadRef.current) {
      console.warn('[onNodeDragStop] Skipped: initial load in progress')
      return
    }

    if (!isWithinDragRange(node.position)) {
      console.error(`[onNodeDragStop] Ignored out-of-range position for node ${node.data.nodeId}: (${node.position.x}, ${node.position.y})`)
      return
    }

    const positions = positionsOf(nodes, position => {
      const valid = isWithinDragRange(position)
      if (!valid) console.warn(`[onNodeDragStop] Skipping out-of-range position (${position.x}, ${position.y})`)
      return valid
    })

    storePositions(projectId, positions)
    storeCollapsed(projectId, collapsedNodes)
    setManualLayout(projectId, true)

    if (saveHistoryTimeoutRef.current) {
      clearTimeout(saveHistoryTimeoutRef.current)
    }
    saveHistoryTimeoutRef.current = window.setTimeout(() => {
      saveToHistory(positions)
    }, 500)

    if (savePositionTimeoutRef.current) {
      clearTimeout(savePositionTimeoutRef.current)
    }
    savePositionTimeoutRef.current = window.setTimeout(async () => {
      try {
        await patchNode(node.data.nodeId, { position_x: node.position.x, position_y: node.position.y })
      } catch (error) {
        console.error('[onNodeDragStop] Failed to save position:', error)
      }
    }, 1000)
  }, [nodes, projectId, saveToHistory, collapsedNodes])

  const onActionPlan = useCallback(() => {
    const plan = buildActionPlan(projectId, project, nodeDataMap.values())
    downloadJson(plan, `action_plan_project_${projectId}.json`)

    alert(
      t.tree.actionPlanGenerated
        .replace('{count}', String(plan.summary.optionsCount))
        .replace('{cost}', formatCurrency(plan.summary.totalCost)) +
      t.tree.actionPlanStats
        .replace('{joy}', plan.summary.avgJoy)
        .replace('{usage}', String(plan.summary.budgetUsage))
    )
  }, [projectId, project, nodeDataMap, t, formatCurrency])

  const onAutoLayout = useCallback(() => {
    clearStoredLayout(projectId)
    setCollapsedNodes(rootIdsWithChildren(Array.from(nodeDataMap.values())))

    setTimeout(() => {
      onLayout()
      forceCenterView()
    }, 50)
  }, [projectId, nodeDataMap, onLayout, forceCenterView, setCollapsedNodes])

  const onScenarioSelect = useCallback(async (mode: ScenarioMode) => {
    try {
      await applyScenario(Array.from(nodeDataMap.values()), mode, weights)
    } catch (error) {
      console.error('[onScenarioSelect] Failed to apply scenario:', error)
    }
    fetchTree()
  }, [nodeDataMap, weights, fetchTree])

  const onTimelineNodeClick = useCallback((nodeId: number) => {
    setViewMode('tree')
    const node = nodeDataMap.get(nodeId)
    if (node) {
      setSelectedNode(node)
      setSidebarOpen(true)
    }
  }, [nodeDataMap])

  const dashboardNodes = useMemo(() =>
    selectedOptionsOf(nodeDataMap.values()).map(node => ({
      nodeId: node.id,
      title: node.title,
      cost: node.actual_cost ? parseFloat(node.actual_cost) : parseFloat(node.estimated_cost) || 0,
      joy: node.score_pleasure || 0,
      risk: node.score_risk || 0,
      section: node.section || 'general',
      scores: {
        score_comfort: node.score_comfort,
        score_risk: node.score_risk,
        score_time: node.score_time,
        score_pleasure: node.score_pleasure,
      },
    })),
  [nodeDataMap])

  const defaultEdgeOptions = useMemo(() => ({
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: '#10b981',
      strokeWidth: 3,
      opacity: 0.8,
    },
    pathOptions: { borderRadius: 40 },
  }), [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50" data-testid="loading">
        <div className="text-xl text-slate-600">{t.tree.loadingTree}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50" data-testid="error-state">
        <div className="text-rose-600">{error}</div>
      </div>
    )
  }

  if (viewMode === 'analytics') {
    return (
      <div className="w-full h-full relative">
        <ViewModeSwitcher variant="panel" mode={viewMode} onChange={setViewMode} />
        <ProjectAnalytics projectId={projectId} />
      </div>
    )
  }

  if (viewMode === 'timeline') {
    return (
      <div className="w-full h-full relative">
        <ViewModeSwitcher variant="panel" mode={viewMode} onChange={setViewMode} />
        <ProjectTimeline projectId={projectId} onNodeClick={onTimelineNodeClick} />
      </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#0f172a_50%,_#020617_100%)]">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={gridOverlayStyle} />

      {project && (
        <>
          <ProjectInfoCard title={project.title} budget={project.budget_total} />

          <ViewModeSwitcher variant="pill" mode={viewMode} onChange={setViewMode} />

          <ProjectActions
            onOpenTasks={() => setGlobalActionBoardOpen(true)}
            onOpenAdvisor={() => setAdvisorOpen(true)}
            onEditProject={() => setEditProjectOpen(true)}
          />

          <div className="absolute top-20 left-6 flex gap-3 z-50">
            <ScenarioMenu onSelect={onScenarioSelect} />

            <button
              onClick={onToggleExpandAll}
              className={lightButtonClass}
              title={allExpanded ? t.tree.collapseAllMilestones : t.tree.expandAllMilestones}
            >
              {allExpanded ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
              {allExpanded ? t.tree.collapseAll : t.tree.expandAll}
            </button>
          </div>

          <TreeToolbar
            onActionPlan={onActionPlan}
            onAutoLayout={onAutoLayout}
            onSave={onSavePositions}
            onUndo={onUndoPositions}
            onCenter={forceCenterView}
            onExportPDF={onExportPDF}
            onShare={onShareProject}
            exportingPDF={exportingPDF}
            priorities={{ weights, onChange: setWeights, onReset: resetWeights, saveStatus }}
          />
        </>
      )}

      <ReactFlow
        id="react-flow-wrapper"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.01}
        maxZoom={2}
        className="bg-transparent"
      >
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <linearGradient id="milestone-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="1" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="1" />
            </linearGradient>
          </defs>
        </svg>

        {SHOW_SECTION_HEADERS && sectionHeaders.map(header => (
          <SectionHeader
            key={header.section}
            section={header.section}
            nodeCount={header.nodeCount}
            y={header.y}
            collapsed={collapsedSections.has(header.section)}
            onToggle={() => toggleSectionCollapse(header.section)}
          />
        ))}

        <Background
          variant={BackgroundVariant.Lines}
          gap={50}
          size={0.5}
          color="#1e293b"
          className="opacity-20"
        />
        <Controls
          className="bg-white/90 backdrop-blur-xl border border-white/40 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all"
          showInteractive={false}
        />
        <MiniMap
          className="bg-white/90 backdrop-blur-xl border border-white/40 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          nodeColor="#6366f1"
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{ height: 120, width: 180 }}
        />
      </ReactFlow>

      <FloatingDashboard
        selectedNodes={dashboardNodes}
        totalBudget={project ? parseFloat(project.budget_total) : 0}
        weights={weights}
      />

      <NodeSidebar
        node={selectedNode}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        onNodesGenerated={handleNodesGenerated}
        onNodeUpdated={handleNodeUpdated}
        onNodeDeleted={handleNodeDeleted}
      />
      <ProjectAdvisor
        projectId={projectId}
        isOpen={advisorOpen}
        onClose={() => setAdvisorOpen(false)}
        onSuggestionsApplied={fetchTree}
      />
      {project && (
        <EditProjectModal
          isOpen={editProjectOpen}
          onClose={() => setEditProjectOpen(false)}
          project={project}
          onProjectUpdated={handleProjectUpdated}
        />
      )}

      {project && (
        <GlobalActionBoard
          projectId={project.id}
          isOpen={globalActionBoardOpen}
          onClose={() => setGlobalActionBoardOpen(false)}
          onTaskUpdated={() => {
            fetchTree()
          }}
        />
      )}

      {shareToastVisible && <ShareToast />}

      <AIChat projectId={projectId} />
    </div>
  )
}

export default TreeVisualizer
