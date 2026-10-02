import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactFlow, {
  Node,
  Edge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  NodeMouseHandler,
  useReactFlow,
  MarkerType,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import axios from 'axios'
import { Brain, Sparkles, Target, FileDown, LayoutGrid, Save, Undo, DollarSign, Heart, ChevronsDown, ChevronsUp, ChevronDown, Settings, ListTodo, Calendar, BarChart3, Link } from 'lucide-react'
import { motion } from 'framer-motion'
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
import { getLayoutedElements, getChronologicalLayout } from '../utils/layoutUtils'
import { useLanguage } from '../contexts/LanguageContext'
import { exportProjectToPDF } from '../utils/pdfExport'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface Task {
  id: number
  title: string
  is_completed: boolean
  node: number
  due_date?: string | null
  created_at: string
}

export interface ProjectTask extends Task {
  node_id: number
  node_title: string
  node_section: string
}

export interface Comment {
  id: number
  node: number
  author_name: string
  content: string
  created_at: string
}

export interface DecisionNode {
  id: number
  title: string
  description: string
  estimated_cost: string
  actual_cost?: string | null
  parent: number | null
  project: number
  children: DecisionNode[]
  vote_count?: number
  path_cost?: number
  score_comfort?: number
  score_risk?: number
  score_time?: number
  score_pleasure?: number
  status?: 'pending' | 'selected' | 'rejected'
  section?: string
  order?: number
  node_type?: 'decision' | 'milestone' | 'option'
  tasks?: Task[]
  comments?: Comment[]
  comment_count?: number
  position_x?: number
  position_y?: number
}

interface Project {
  id: number
  title: string
  description: string
  budget_total: string
  ui_state?: Record<string, unknown> | null
  share_token?: string
}

interface TreeVisualizerProps {
  projectId: number
}

const nodeTypes = {
  decisionNode: CustomNode,
}

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
  const [showTimeline, setShowTimeline] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<number>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [sectionHeaders, setSectionHeaders] = useState<Array<{ section: string; y: number; nodeCount: number }>>([])
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [isUpdatingProjectMeta, setIsUpdatingProjectMeta] = useState(false)
  
  const chronologicalMode = true
  
  const [positionHistory, setPositionHistory] = useState<Array<Record<string, { x: number; y: number }>>>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const historyIndexRef = useRef(-1)
  const saveHistoryTimeoutRef = useRef<number | null>(null)
  const savePositionTimeoutRef = useRef<number | null>(null)
  
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])
  
  const [shouldAutoLayout, setShouldAutoLayout] = useState(false)
  const { fitView, getNodes } = useReactFlow()
  const { formatCurrency, t, language } = useLanguage()
  const [exportingPDF, setExportingPDF] = useState(false)
  const [shareToastVisible, setShareToastVisible] = useState(false)
  const nodesRef = useRef<Node[]>([])
  const collapsedNodesRef = useRef<Set<number>>(new Set())
  
  const isInitialLoadRef = useRef(true)
  
  const [disableAutoLayout, setDisableAutoLayout] = useState(false)
  
  const forceCenterView = useCallback(() => {
    setTimeout(() => {
      window.requestAnimationFrame(() => {
        fitView({ 
          padding: 0.5, 
          duration: 1000, 
          maxZoom: 0.25,
          minZoom: 0.05,
          includeHiddenNodes: false
        })
      })
    }, 200)
  }, [fitView])
  
  useEffect(() => {
    collapsedNodesRef.current = collapsedNodes
  }, [collapsedNodes])
  
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const { setViewport, getViewport } = useReactFlow()
  const saveUiStateTimeoutRef = useRef<number | null>(null)
  
  const saveUiState = useCallback(async () => {
    if (!project) return
    
    const viewport = getViewport()
    const currentEdges = edges
    
    const uiState = {
      collapsedNodes: Array.from(collapsedNodes),
      viewport: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom
      },
      edges: currentEdges
    }
    
    try {
      await axios.patch(`${API_URL}/api/projects/${projectId}/`, {
        ui_state: uiState
      })
    } catch (error) {
      console.error('[saveUiState] ❌ Failed to save UI state:', error)
    }
  }, [projectId, project, collapsedNodes, getViewport, edges])
  
  const debouncedSaveUiState = useCallback(() => {
    if (saveUiStateTimeoutRef.current) {
      clearTimeout(saveUiStateTimeoutRef.current)
    }
    
    saveUiStateTimeoutRef.current = setTimeout(() => {
      saveUiState()
    }, 1000)
  }, [saveUiState])
  
  useEffect(() => {
    if (isInitialLoadRef.current || !project) return
    
    debouncedSaveUiState()
  }, [edges, debouncedSaveUiState, project])
  
  const loadUiState = useCallback((currentNodes: Node[]) => {
    if (!project || !project.ui_state) return
    
    const uiState = project.ui_state as any
    
    if (uiState.collapsedNodes && Array.isArray(uiState.collapsedNodes)) {
      const collapsedSet = new Set<number>(uiState.collapsedNodes)
      setCollapsedNodes(collapsedSet)
      collapsedNodesRef.current = collapsedSet
    }
    
    if (uiState.edges && Array.isArray(uiState.edges)) {
      const currentNodeIds = new Set(currentNodes.map(n => n.id))
      const validEdges = uiState.edges.filter((edge: Edge) => 
        currentNodeIds.has(edge.source) && currentNodeIds.has(edge.target)
      )
      
      if (validEdges.length > 0) {
        setEdges(validEdges)
      }
    }
    
    if (uiState.viewport) {
      setTimeout(() => {
        setViewport({
          x: uiState.viewport.x || 0,
          y: uiState.viewport.y || 0,
          zoom: uiState.viewport.zoom || 1
        }, { duration: 800 })
      }, 500)
    }
  }, [project, setViewport, setEdges])

  const handleToggleSelection = useCallback(async (nodeId: number) => {
    
    const nodeData = nodeDataMap.get(nodeId)
    if (!nodeData) {
      console.error(`[handleToggleSelection] Node ${nodeId} not found in nodeDataMap`)
      return
    }
    
    const currentStatus = nodeData.status || 'pending'
    const newStatus = currentStatus === 'selected' ? 'pending' : 'selected'

    try {
      await axios.patch(`${API_URL}/api/decision-nodes/${nodeId}/`, {
        status: newStatus
      })
      
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
      console.error(`[handleToggleSelection] ❌ Failed to update node ${nodeId}:`, error)
    }
  }, [nodeDataMap, setNodes])

  const findBestPath = useCallback((nodesMap: Map<number, DecisionNode>) => {
    const calculateAvgScore = (node: DecisionNode): number => {
      const comfort = node.score_comfort || 50
      const risk = 100 - (node.score_risk || 50)
      const time = node.score_time || 50
      const pleasure = node.score_pleasure || 50
      return (comfort + risk + time + pleasure) / 4
    }

    const bestOptions = new Set<number>()

    Array.from(nodesMap.values()).forEach(node => {
      const isMilestone = node.node_type === 'milestone' || (!node.parent && node.children && node.children.length > 0)
      
      if (isMilestone) {
        const options = Array.from(nodesMap.values()).filter(n => 
          n.parent === node.id && 
          n.status !== 'rejected' &&
          (n.node_type === 'option' || n.node_type === 'decision')
        )
        
        if (options.length > 0) {
          let bestOption = options[0]
          let bestScore = calculateAvgScore(bestOption)
          
          for (const option of options) {
            const score = calculateAvgScore(option)
            if (score > bestScore) {
              bestScore = score
              bestOption = option
            }
          }
          
          bestOptions.add(bestOption.id)
        }
      }
    })
    
    return bestOptions
  }, [])

  const onToggleCollapse = useCallback((nodeId: number) => {
    
    const wasCollapsed = collapsedNodesRef.current.has(nodeId)
    const newSet = new Set(collapsedNodesRef.current)
    
    if (wasCollapsed) {
      newSet.delete(nodeId)
    } else {
      newSet.add(nodeId)
    }
    
    collapsedNodesRef.current = newSet
    
    setCollapsedNodes(newSet)
    
    setNodes(currentNodes =>
      currentNodes.map(node => {
        if (node.data.nodeId === nodeId) {
          return {
            ...node,
            data: { ...node.data, isCollapsed: !wasCollapsed }
          }
        }
        return node
      })
    )
    
    setTimeout(() => {
      
      const manualFlagKey = `project-${projectId}-manual-layout`
      const hadManualFlag = localStorage.getItem(manualFlagKey) === 'true'
      
      if (hadManualFlag) {
        localStorage.removeItem(manualFlagKey)
      }
      
      if (onLayoutRef.current) {
        onLayoutRef.current()
      }
      
      if (hadManualFlag) {
        setTimeout(() => {
          localStorage.setItem(manualFlagKey, 'true')
        }, 300)
      }
    }, 50)
  }, [projectId, setNodes])

  const applyVisibilityFilter = useCallback(() => {

      if (!chronologicalMode) {
        return
      }

      setNodes(currentNodes => {
        const updatedNodes = currentNodes.map(node => {
          const nodeType = node.data.node_type
          const parent = node.data.parent
          const section = node.data.section || 'general'

          if (collapsedSections.has(section)) {
            return { ...node, hidden: true }
          }

          if (nodeType === 'milestone') {
            return { ...node, hidden: false }
          }

          if (nodeType === 'option' || nodeType === 'decision') {
            if (!parent) {
              return { ...node, hidden: false }
            }

            const isParentCollapsed = collapsedNodesRef.current.has(parent)
            return { ...node, hidden: isParentCollapsed }
          }

          return { ...node, hidden: false }
        })

        const visibleNodes = updatedNodes.filter(n => !n.hidden)

        const milestones = visibleNodes.filter(n => n.data.node_type === 'milestone')
        const milestoneEdges: Edge[] = []
        const timestamp = Date.now()

        for (let i = 0; i < milestones.length - 1; i++) {
          const source = milestones[i]
          const target = milestones[i + 1]

          milestoneEdges.push({
            id: `ms-edge-${source.data.nodeId}-${target.data.nodeId}-${timestamp}-${i}`,
            source: source.id,
            target: target.id,
            type: 'smoothstep',
            animated: false,
            style: {
              strokeWidth: 12,
              stroke: '#4ade80',
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              filter: 'drop-shadow(0 0 24px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 48px rgba(74, 222, 128, 0.6))',
              opacity: 1,
            },
            markerEnd: {
              type: 'arrowclosed' as any,
              width: 40,
              height: 40,
              color: '#4ade80',
            },
            pathOptions: { borderRadius: 30 },
            zIndex: 10,
          })
        }

        const optionEdges: Edge[] = []
        
        visibleNodes.forEach(node => {
          if ((node.data.node_type === 'option' || node.data.node_type === 'decision') && node.data.parent) {
            const parentNode = visibleNodes.find(n => n.data.nodeId === node.data.parent)
            if (parentNode && parentNode.data.node_type === 'milestone') {
              const isSelected = node.data.status === 'selected'
              const isRejected = node.data.status === 'rejected'
              const isWinning = node.data.isOnWinningPath
              
              const sourceHandle = 'bottom'
              const targetHandle = 'top'
              
              let edgeColor = '#94a3b8'
              let edgeWidth = 6
              let edgeOpacity = 0.8
              
              if (isSelected) {
                edgeColor = '#10b981'
                edgeWidth = 10
                edgeOpacity = 1
              } else if (isRejected) {
                edgeColor = '#ef4444'
                edgeWidth = 6
                edgeOpacity = 0.7
              } else if (isWinning) {
                edgeColor = '#94a3b8'
                edgeWidth = 6
                edgeOpacity = 0.8
              }
              
              optionEdges.push({
                id: `opt-edge-${parentNode.data.nodeId}-${node.data.nodeId}`,
                source: parentNode.id,
                target: node.id,
                type: 'smoothstep',
                sourceHandle: sourceHandle,
                targetHandle: targetHandle,
                animated: isSelected,
                style: {
                  strokeWidth: edgeWidth,
                  stroke: edgeColor,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  opacity: edgeOpacity,
                },
                markerEnd: {
                  type: 'arrowclosed' as any,
                  width: 20,
                  height: 20,
                  color: edgeColor,
                },
                pathOptions: { borderRadius: 50, offset: 20 },
                zIndex: isSelected ? 10 : 1,
              })
            }
          }
        })

        setEdges(() => {
          const allEdges = [...milestoneEdges, ...optionEdges]

          return allEdges
        })

        return updatedNodes
      })
    }, [chronologicalMode, collapsedNodes, collapsedSections, setNodes, setEdges])

  const onLayout = useCallback(() => {
    if (isInitialLoadRef.current) {
      console.warn('[onLayout] 🛡️ Blokada auto-layout podczas ładowania początkowego!')
      return
    }
    
    const manualFlagKey = `project-${projectId}-manual-layout`
    const hasManualLayout = localStorage.getItem(manualFlagKey) === 'true'
    
    if (hasManualLayout) {
      
      applyVisibilityFilter()
      return
    }

    if (chronologicalMode) {
      
      const { nodes: layoutedNodes, sectionHeaders: headers } = getChronologicalLayout(
        nodes,
        edges, 
        collapsedNodesRef.current
      )

      const updatedNodes = layoutedNodes.map(node => {
        const nodeType = node.data.node_type
        const parent = node.data.parent
        const section = node.data.section || 'general'
        
        const targetPos = Position.Top
        const sourcePos = Position.Bottom
        
        if (collapsedSections.has(section)) {
          return { ...node, hidden: true, targetPosition: targetPos, sourcePosition: sourcePos }
        }
        
        if (nodeType === 'milestone') {
          return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
        }
        
        if (nodeType === 'option' || nodeType === 'decision') {
          if (!parent) {
            return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
          }
          
          const isParentCollapsed = collapsedNodesRef.current.has(parent)
          
          if (isParentCollapsed) {
            return { ...node, hidden: true, targetPosition: targetPos, sourcePosition: sourcePos }
          } else {
            return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
          }
        }
        
        return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
      })
      
      const visibleNodes = updatedNodes.filter(n => !n.hidden)
      
      setNodes(updatedNodes)
      
      const allNewEdges: Edge[] = []
      
      const milestones = visibleNodes.filter(n => n.data.node_type === 'milestone')
      
      for (let i = 0; i < milestones.length - 1; i++) {
        const source = milestones[i]
        const target = milestones[i + 1]
        
        allNewEdges.push({
          id: `ms-edge-${source.data.nodeId}-${target.data.nodeId}`,
          source: source.id,
          target: target.id,
          type: 'smoothstep',
          animated: false,
          style: {
            strokeWidth: 12,
            stroke: '#4ade80',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            filter: 'drop-shadow(0 0 24px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 48px rgba(74, 222, 128, 0.6))',
            opacity: 1,
          },
          markerEnd: {
            type: 'arrowclosed' as any,
            width: 48,
            height: 48,
            color: '#4ade80',
          },
          pathOptions: { borderRadius: 40 },
          zIndex: 10,
        })
      }

      visibleNodes.forEach(node => {
        if ((node.data.node_type === 'option' || node.data.node_type === 'decision') && node.data.parent) {
          const parentNode = visibleNodes.find(n => n.data.nodeId === node.data.parent)
          if (parentNode && parentNode.data.node_type === 'milestone') {
            const isSelected = node.data.status === 'selected'
            const isRejected = node.data.status === 'rejected'
            const isWinning = node.data.isOnWinningPath
            
            const sourceHandle = 'bottom'
            const targetHandle = 'top'
            
            let edgeColor = '#94a3b8'
            let edgeWidth = 6
            let edgeOpacity = 0.8
            
            if (isSelected) {
              edgeColor = '#10b981'
              edgeWidth = 10
              edgeOpacity = 1
            } else if (isRejected) {
              edgeColor = '#ef4444'
              edgeWidth = 6
              edgeOpacity = 0.7
            } else if (isWinning) {
              edgeColor = '#94a3b8'
              edgeWidth = 6
              edgeOpacity = 0.8
            }
            
            allNewEdges.push({
              id: `opt-edge-${parentNode.data.nodeId}-${node.data.nodeId}`,
              source: parentNode.id,
              target: node.id,
              type: 'smoothstep',
              
              sourceHandle: sourceHandle,
              targetHandle: targetHandle,
              
              animated: isSelected,
              style: {
                strokeWidth: edgeWidth,
                stroke: edgeColor,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                opacity: edgeOpacity,
              },
              markerEnd: {
                type: 'arrowclosed' as any,
                width: 20,
                height: 20,
                color: edgeColor,
              },
              pathOptions: { borderRadius: 50, offset: 20 },
              zIndex: isSelected ? 10 : 1,
            })
          }
        }
      })
      
      setEdges(allNewEdges)
      setSectionHeaders(headers)
      
      const positions: Record<string, { x: number; y: number }> = {}
      layoutedNodes.forEach(node => {
        positions[node.id] = node.position
      })
      const storageKey = `project-${projectId}-positions`
      localStorage.setItem(storageKey, JSON.stringify(positions))
      
      const apiPositions = layoutedNodes.map(node => ({
        id: node.data.nodeId,
        position_x: node.position.x,
        position_y: node.position.y
      }))
      
      axios.post(`${API_URL}/api/projects/${projectId}/save_layout/`, {
        positions: apiPositions
      }).then(() => {
      }).catch(error => {
        console.error(`[onLayout] ❌ Failed to batch save positions to API:`, error)
      })
    } else {
      const layouted = getLayoutedElements(nodes, edges, 'TB')
      setNodes(layouted.nodes)
      setEdges(layouted.edges)
      setSectionHeaders([])
      
      const positions: Record<string, { x: number; y: number }> = {}
      layouted.nodes.forEach(node => {
        positions[node.id] = node.position
      })
      const storageKey = `project-${projectId}-positions`
      localStorage.setItem(storageKey, JSON.stringify(positions))
      
      const apiPositions = layouted.nodes.map(node => ({
        id: node.data.nodeId,
        position_x: node.position.x,
        position_y: node.position.y
      }))
      
      axios.post(`${API_URL}/api/projects/${projectId}/save_layout/`, {
        positions: apiPositions
      }).then(() => {
      }).catch(error => {
        console.error(`[onLayout] ❌ Failed to batch save positions to API:`, error)
      })
    }
  }, [nodes, edges, setNodes, setEdges, fitView, projectId, chronologicalMode, collapsedSections, collapsedNodes, disableAutoLayout, applyVisibilityFilter])

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

  const onCenterView = useCallback(() => {
    forceCenterView()
  }, [forceCenterView])
  
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
      
      const result = await exportProjectToPDF(
        project,
        nodesData,
        'react-flow-wrapper',
        formatCurrency,
        t.pdf
      )
      
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
  }, [project, nodeDataMap, formatCurrency])

  const onShareProject = useCallback(async () => {
    if (!project) return
    
    const shareUrl = `${window.location.origin}/share/${project.share_token}`
    
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareToastVisible(true)
      
      setTimeout(() => {
        setShareToastVisible(false)
      }, 3000)
    } catch (error) {
      console.error('Failed to copy share link:', error)
      alert(`Share link: ${shareUrl}`)
    }
  }, [project])

  const saveToHistory = useCallback((positions: Record<string, { x: number; y: number }>) => {
    const currentIndex = historyIndexRef.current
    
    setPositionHistory(prev => {
      const newHistory = prev.slice(0, currentIndex + 1)
      
      newHistory.push(positions)
      
      if (newHistory.length > 20) {
        newHistory.shift()
      } else {
        const newIndex = newHistory.length - 1
        setHistoryIndex(newIndex)
      }
      
      return newHistory
    })
  }, [])

  const onUndoPositions = useCallback(() => {
    
    if (positionHistory.length === 0) {
      alert(t.tree.noHistoryToRestore)
      return
    }
    
    if (historyIndex <= 0) {
      alert(t.tree.noEarlierStates)
      return
    }
    
    const targetIndex = historyIndex - 1
    const targetPositions = positionHistory[targetIndex]
    
    if (!targetPositions) {
      alert(t.tree.errorStateNotFound)
      console.error('[onUndoPositions] ❌ State not found at index', targetIndex)
      return
    }

    setNodes(currentNodes => {
      return currentNodes.map(node => {
        if (targetPositions[node.id]) {
          return {
            ...node,
            position: targetPositions[node.id]
          }
        }
        return node
      })
    })
    
    setHistoryIndex(targetIndex)
    alert(t.tree.restoredToState.replace('{current}', String(targetIndex + 1)).replace('{total}', String(positionHistory.length)))
  }, [historyIndex, positionHistory, setNodes, t])

  const onSavePositions = useCallback(() => {
    if (isInitialLoadRef.current) {
      console.warn('[onSavePositions] 🛡️ Blokada zapisu podczas ładowania początkowego!')
      return
    }
    
    const positions: Record<string, { x: number; y: number }> = {}
    nodes.forEach(n => {
      positions[n.id] = n.position
    })
    
    const lastHistoryState = positionHistory[historyIndexRef.current]
    let isDifferent = false
    
    if (!lastHistoryState) {
      isDifferent = true
    } else {
      const currentKeys = Object.keys(positions)
      const lastKeys = Object.keys(lastHistoryState)
      
      if (currentKeys.length !== lastKeys.length) {
        isDifferent = true
      } else {
        for (const key of currentKeys) {
          const current = positions[key]
          const last = lastHistoryState[key]
          
          if (!last || current.x !== last.x || current.y !== last.y) {
            isDifferent = true
            break
          }
        }
      }
    }
    
    if (isDifferent) {
      saveToHistory(positions)
    }
    
    const storageKey = `project-${projectId}-positions`
    const manualFlagKey = `project-${projectId}-manual-layout`
    const collapsedKey = `project-${projectId}-collapsed`
    
    localStorage.setItem(storageKey, JSON.stringify(positions))
    localStorage.setItem(manualFlagKey, 'true')
    
    const collapsedArray = Array.from(collapsedNodes)
    localStorage.setItem(collapsedKey, JSON.stringify(collapsedArray))

    const apiPositions = nodes.map(node => ({
      id: node.data.nodeId,
      position_x: node.position.x,
      position_y: node.position.y
    }))
    
    axios.post(`${API_URL}/api/projects/${projectId}/save_layout/`, {
      positions: apiPositions
    }).then(() => {
      alert(t.tree.savedPositions.replace('{count}', String(nodes.length)))
    }).catch(error => {
      console.error(`[onSavePositions] ❌ Failed to batch save positions to API:`, error)
      alert(t.tree.savedPositions.replace('{count}', String(nodes.length)))
    })
  }, [nodes, projectId, saveToHistory, positionHistory, t, collapsedNodes])

  const [allExpanded, setAllExpanded] = useState(true)
  
  const onToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      const milestonesToCollapse = Array.from(nodeDataMap.values())
        .filter(n => (n.node_type === 'milestone' || !n.parent) && n.children && n.children.length > 0)
        .map(n => n.id)
      
      const newSet = new Set(milestonesToCollapse)
      collapsedNodesRef.current = newSet
      setCollapsedNodes(newSet)
      setAllExpanded(false)
    } else {
      collapsedNodesRef.current = new Set()
      setCollapsedNodes(new Set())
      setAllExpanded(true)
    }
    applyVisibilityFilter()
  }, [allExpanded, nodeDataMap, applyVisibilityFilter])

  const buildTree = useCallback(
    (
      nodesData: DecisionNode[],
      projectBudget: number,
      preservePositions: boolean = false,
      projectId: number = 0
    ): { nodes: Node[]; edges: Edge[]; nodeMap: Map<number, DecisionNode>; winningPath: Set<number> } => {
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      const reactFlowNodeMap = new Map<number, Node>()
      const dataMap = new Map<number, DecisionNode>()
      
      const positionMap = new Map<string, { x: number; y: number }>()
      let hasManualLayout = false
      
      let dbPositionsCount = 0
      const buildDbPositionMap = (nodes: DecisionNode[]) => {
        nodes.forEach(node => {
          if (node.position_x !== null && node.position_x !== undefined && 
              node.position_y !== null && node.position_y !== undefined &&
              !(node.position_x === 0 && node.position_y === 0) &&
              Math.abs(node.position_x) < 1000000 && Math.abs(node.position_y) < 1000000) {
            const nodeId = `node-${node.id}`
            positionMap.set(nodeId, { 
              x: Number(node.position_x), 
              y: Number(node.position_y) 
            })
            dbPositionsCount++
          }
          if (node.children && node.children.length > 0) {
            buildDbPositionMap(node.children)
          }
        })
      }
      
      if (preservePositions && projectId > 0) {
        buildDbPositionMap(nodesData)
        
        if (dbPositionsCount > 0) {
          hasManualLayout = true
        } else {
          const storageKey = `project-${projectId}-positions`
          const savedPositions = localStorage.getItem(storageKey)
          
          if (savedPositions) {
            try {
              const positions = JSON.parse(savedPositions)
              Object.entries(positions).forEach(([nodeId, pos]) => {
                const position = pos as { x: number; y: number }
                if (Math.abs(position.x) < 1000000 && Math.abs(position.y) < 1000000) {
                  positionMap.set(nodeId, position)
                } else {
                  console.warn(`[buildTree] ⚠️ Skipping extreme position from localStorage: ${nodeId} (${position.x}, ${position.y})`)
                }
              })
              hasManualLayout = positionMap.size > 0
            } catch (e) {
              console.error('[buildTree] Failed to parse saved positions:', e)
            }
          }
        }
      }

      const buildDataMap = (nodes: DecisionNode[]) => {
        nodes.forEach(node => {
          dataMap.set(node.id, node)
          if (node.children && node.children.length > 0) {
            buildDataMap(node.children)
          }
        })
      }
      buildDataMap(nodesData)

      if (!hasManualLayout && projectId > 0) {
        const milestoneIds: number[] = []
        dataMap.forEach((node) => {
          if (node.node_type === 'milestone' || !node.parent) {
            milestoneIds.push(node.id)
          }
        })
        
        if (milestoneIds.length > 0) {
          const newCollapsedSet = new Set(collapsedNodesRef.current)
          milestoneIds.forEach(id => newCollapsedSet.add(id))
          collapsedNodesRef.current = newCollapsedSet
          setCollapsedNodes(newCollapsedSet)
        }
      }
      
      const bestPath = findBestPath(dataMap)

      const isNodeHidden = (nodeData: DecisionNode): boolean => {
        let current = nodeData.parent
        while (current) {
          if (collapsedNodesRef.current.has(current)) {
            return true
          }
          const parentNode = dataMap.get(current)
          if (!parentNode) break
          current = parentNode.parent
        }
        return false
      }

      const createNode = (nodeData: DecisionNode, level: number, index: number): Node => {
        const nodeId = `node-${nodeData.id}`
        
        let x, y
        
        if (positionMap.has(nodeId)) {
          const pos = positionMap.get(nodeId)!
          x = pos.x
          y = pos.y
        } else {
          x = level * 320 + 100
          y = index * 180 + 100
        }

        const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
        const exceedsBudget = pathCost > projectBudget
        
        const children = Array.from(dataMap.values()).filter(n => n.parent === nodeData.id)
        const hasChildren = children.length > 0
        const isCollapsed = collapsedNodesRef.current.has(nodeData.id)
        const isOnWinningPath = bestPath.has(nodeData.id)
        
        const calculateAggregatedCost = (nodeId: number): number => {
          const children = Array.from(dataMap.values()).filter(n => n.parent === nodeId)
          if (children.length === 0) {
            return parseFloat(dataMap.get(nodeId)?.estimated_cost ?? '0') || 0
          }
          
          const selectedChild = children.find(c => c.status === 'selected')
          if (selectedChild) {
            return calculateAggregatedCost(selectedChild.id)
          }
          
          return 0
        }
        
        const aggregatedCost = hasChildren ? calculateAggregatedCost(nodeData.id) : parseFloat(nodeData.estimated_cost) || 0
        const childrenCount = children.length
        const selectedChildrenCount = children.filter(c => c.status === 'selected').length

        let nodeType = nodeData.node_type || 'decision'
        if (!nodeData.parent) {
          nodeType = 'milestone'
        } else {
          nodeType = 'option'
        }

        const flowNode: Node = {
          id: nodeId,
          type: 'decisionNode',
          position: { x, y },
          data: {
            nodeId: nodeData.id,
            title: nodeData.title,
            description: nodeData.description,
            estimated_cost: nodeData.estimated_cost,
            vote_count: nodeData.vote_count || 0,
            pathCost,
            exceedsBudget,
            score_comfort: nodeData.score_comfort,
            score_risk: nodeData.score_risk,
            score_time: nodeData.score_time,
            score_pleasure: nodeData.score_pleasure,
            status: nodeData.status,
            section: nodeData.section,
            order: nodeData.order,
            node_type: nodeType,
            parent: nodeData.parent,
            hasChildren,
            isCollapsed,
            onToggleCollapse,
            onToggleSelection: handleToggleSelection,
            isOnWinningPath,
            aggregatedCost,
            childrenCount,
            selectedChildrenCount,
            onAddChild: handleAddChild,
            onDeleteNode: handleDeleteNode,
            onEditNode: handleEditNode,
            tasks: nodeData.tasks || [],
            comments: nodeData.comments || [],
            comment_count: nodeData.comment_count || 0,
          },
        }

        return flowNode
      }

      const processNode = (nodeData: DecisionNode, level: number, index: number) => {
        const shouldBeHidden = isNodeHidden(nodeData)
        
        if (shouldBeHidden) {
          return
        }
        
        const flowNode = createNode(nodeData, level, index)
        flowNodes.push(flowNode)
        reactFlowNodeMap.set(nodeData.id, flowNode)

        if (nodeData.parent) {
          const parentNode = reactFlowNodeMap.get(nodeData.parent)
          
          if (!parentNode) {
            return
          }
          
          const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
          const exceedsBudget = pathCost > projectBudget
          const isOnWinningPath = bestPath.has(nodeData.id) && bestPath.has(nodeData.parent)
          
          const parentIsMilestone = parentNode.data.node_type === 'milestone'
          const childIsMilestone = flowNode.data.node_type === 'milestone'

          const isMainFlow = parentIsMilestone && childIsMilestone
          
          const sourceHandle = 'bottom'
          const targetHandle = 'top'

          flowEdges.push({
            id: `edge-${nodeData.parent}-${nodeData.id}`,
            source: parentNode.id,
            target: flowNode.id,
            type: 'smoothstep',
            sourceHandle: sourceHandle,
            targetHandle: targetHandle,
            animated: isOnWinningPath,
            style: {
              stroke: isOnWinningPath ? '#f59e0b' : exceedsBudget ? '#ef4444' : (isMainFlow ? '#4ade80' : '#4ade80'),
              strokeWidth: isOnWinningPath ? 6 : (isMainFlow ? 16 : 6),
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              opacity: isMainFlow ? 1 : 0.85,
              filter: isMainFlow ? 'drop-shadow(0 0 24px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 48px rgba(74, 222, 128, 0.6))' : undefined,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: isMainFlow ? 40 : 26,
              height: isMainFlow ? 40 : 26,
              color: isOnWinningPath ? '#f59e0b' : exceedsBudget ? '#ef4444' : '#4ade80',
            },
            pathOptions: { borderRadius: isMainFlow ? 30 : 40 },
            zIndex: isMainFlow ? 10 : 1,
          })
        }

        nodeData.children.forEach((child, childIndex) => {
          processNode(child, level + 1, index * 10 + childIndex)
        })
      }

      nodesData.forEach((node, index) => {
        if (!node.parent) {
          processNode(node, 0, index)
        }
      })

      return { nodes: flowNodes, edges: flowEdges, nodeMap: dataMap, winningPath: bestPath }
    },
    [findBestPath, onToggleCollapse]
  )

  const fetchProject = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/`)
      setProject(response.data)
    } catch (err) {
      console.error('Error fetching project:', err)
    }
  }, [projectId])

  const fetchTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/tree/`)
      const treeData = response.data
      
      if (Array.isArray(treeData) && treeData.length > 0) {
        const projectBudget = project ? parseFloat(project.budget_total) : 0
        
        const manualFlagKey = `project-${projectId}-manual-layout`
        const hasManualLayout = localStorage.getItem(manualFlagKey) === 'true'
        
        const hasDbPositions = treeData.some((node: any) => {
          const checkNode = (n: any): boolean => {
            if (n.position_x && n.position_y && !(n.position_x === 0 && n.position_y === 0)) {
              return true
            }
            if (n.children && n.children.length > 0) {
              return n.children.some((child: any) => checkNode(child))
            }
            return false
          }
          return checkNode(node)
        })

        if (chronologicalMode && !hasManualLayout && !hasDbPositions) {
          const rootNodesWithChildren = new Set<number>()

          const findMilestones = (nodes: any[]) => {
            nodes.forEach(node => {
              if (!node.parent && node.children && node.children.length > 0) {
                rootNodesWithChildren.add(node.id)
              }
              
              if (node.children && node.children.length > 0) {
                findMilestones(node.children)
              }
            })
          }
          
          findMilestones(treeData)
          
          if (rootNodesWithChildren.size > 0) {
            setCollapsedNodes(rootNodesWithChildren)
            collapsedNodesRef.current = rootNodesWithChildren
          }
        } else if (hasManualLayout) {
          const collapsedKey = `project-${projectId}-collapsed`
          const savedCollapsed = localStorage.getItem(collapsedKey)
          if (savedCollapsed) {
            try {
              const collapsedArray = JSON.parse(savedCollapsed)
              const collapsedSet = new Set<number>(collapsedArray)
              setCollapsedNodes(collapsedSet)
              collapsedNodesRef.current = collapsedSet
            } catch (e) {
              console.error('[fetchTree] Failed to parse saved collapsed nodes:', e)
            }
          }
        }
        
        const preservePositions = true
        const { nodes: flowNodes, edges: flowEdges, nodeMap } = buildTree(
          treeData,
          projectBudget,
          preservePositions,
          projectId
        )

        if (hasDbPositions && !hasManualLayout) {
          const manualFlagKey = `project-${projectId}-manual-layout`
          localStorage.setItem(manualFlagKey, 'true')
        }
        
        setNodes(flowNodes)
        setEdges(flowEdges)
        setNodeDataMap(nodeMap)
        
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
  }, [projectId, project, buildTree, setNodes, setEdges, chronologicalMode])

  const handleAddChild = useCallback(async (parentId: number) => {
    const parentNode = nodeDataMap.get(parentId)
    if (parentNode) {
      try {
        const response = await axios.post(`${API_URL}/api/decision-nodes/`, {
          project: parentNode.project,
          parent: parentNode.id,
          title: t.common.newOption,
          description: '',
          estimated_cost: '0.00',
        })

        await fetchTree()
        
        const newNode = response.data
        setSelectedNode(newNode)
        setSidebarOpen(true)
      } catch (error) {
        console.error(`[handleAddChild] Failed to create child node:`, error)
      }
    }
  }, [nodeDataMap, fetchTree])

  const handleDeleteNode = useCallback(async (nodeId: number) => {
    try {
      await axios.delete(`${API_URL}/api/decision-nodes/${nodeId}/`)
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

  useEffect(() => {
    if (projectId) {
      fetchProject()
    }
  }, [projectId, fetchProject])

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
        if (localStorage.getItem(`project-${projectId}-manual-layout`) !== 'true') {
          initialLayoutRef.current?.()
        }
      }, 2000)
    }
  }, [projectId, project, fetchTree, isUpdatingProjectMeta])
  
  useEffect(() => {
    if (nodes.length > 0 && project && project.ui_state && !isInitialLoadRef.current) {
      loadUiState(nodes)
    }
  }, [nodes.length, project?.id])

  useEffect(() => {
    if (shouldAutoLayout && nodes.length > 0 && !loading) {
      onLayout()
      setShouldAutoLayout(false)
      
      setTimeout(() => {
        fitView({ 
          padding: 0.3,
          duration: 800,
          maxZoom: 0.8,
          minZoom: 0.1
        })
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
          fitView({ 
            padding: 0.3,
            duration: 800,
            maxZoom: 0.8,
            minZoom: 0.1
          })
        }, 300)
      }, 500)
    }
  }, [searchParams, nodes.length, loading, onLayout, setSearchParams, fitView])

  const hasAutoLayoutedRef = useRef<Record<number, boolean>>({})
  
  useEffect(() => {
    hasAutoLayoutedRef.current[projectId] = false
  }, [projectId])
  
  useEffect(() => {
    if (nodes.length === 0) return
    if (loading) return
    
    if (hasAutoLayoutedRef.current[projectId]) {
      return
    }
    
    const attemptFitView = () => {
      const rfNodes = getNodes()
      const visibleNodes = rfNodes.filter(n => !n.hidden)
      
      const nodesWithDimensions = visibleNodes.filter(n => n.width && n.width > 0)
      const ready = visibleNodes.length > 0 && nodesWithDimensions.length === visibleNodes.length

      if (!ready) {
        return false
      }
      
      const hasPositions = visibleNodes.some(n => Math.abs(n.position.x) > 1 || Math.abs(n.position.y) > 1)

      if (hasPositions) {
        
        applyVisibilityFilter()
        
        const positions: Record<string, { x: number; y: number }> = {}
        nodes.forEach(n => {
          positions[n.id] = n.position
        })
        saveToHistory(positions)
        
        window.requestAnimationFrame(() => {
          fitView({ 
            padding: 0.5, 
            duration: 1000, 
            maxZoom: 0.25,
            minZoom: 0.05,
            includeHiddenNodes: false
          })
        })
        
        setDisableAutoLayout(true)
      } else {
        onLayout()
        
        setTimeout(() => {
          const positions: Record<string, { x: number; y: number }> = {}
          nodes.forEach(n => {
            positions[n.id] = n.position
          })
          saveToHistory(positions)
        }, 800)
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
        if (!success) console.warn('[Layout 🕵️‍♂️] ⚠️ Timeout! Nie udało się wycentrować (węzły nie dostały wymiarów).')
      }
    }, 100)
    
    return () => clearInterval(intervalId)
  }, [nodes.length, loading, projectId, getNodes, fitView, onLayout, applyVisibilityFilter, saveToHistory])

  const prevCollapsedNodesSize = useRef(0)
  const onLayoutRef = useRef(onLayout)
  
  useEffect(() => {
    onLayoutRef.current = onLayout
  }, [onLayout])
  
  useEffect(() => {
    if (chronologicalMode && 
        collapsedNodes.size > 0 && 
        collapsedNodes.size !== prevCollapsedNodesSize.current &&
        nodes.length > 0 && 
        !loading) {
      
      const manualFlagKey = `project-${projectId}-manual-layout`
      const hasManualLayout = localStorage.getItem(manualFlagKey) === 'true'
      
      if (hasManualLayout) {
        prevCollapsedNodesSize.current = collapsedNodes.size
        return
      }
      
      prevCollapsedNodesSize.current = collapsedNodes.size
      setTimeout(() => {
        onLayoutRef.current()
      }, 100)
    }
  }, [collapsedNodes.size, chronologicalMode, nodes.length, loading, projectId])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const nodeId = node.data.nodeId
      if (nodeId) {
        const nodeData = nodeDataMap.get(nodeId)
        if (nodeData) {
          setSelectedNode(nodeData)
          setSidebarOpen(true)
        }
      }
    },
    [nodeDataMap]
  )

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
      const response = await axios.get(`${API_URL}/api/decision-nodes/${selectedNode.id}/`)
      const updatedNodeData = response.data
      
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

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${params.source}-${params.target}`,
        source: params.source!,
        target: params.target!,
        type: 'smoothstep',
        sourceHandle: params.sourceHandle || 'bottom',
        targetHandle: params.targetHandle || 'top',
        animated: true,
        style: {
          strokeWidth: 6,
          stroke: '#4ade80',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          opacity: 0.8,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#4ade80',
        },
        pathOptions: { borderRadius: 40 },
      }
      
      setEdges((eds) => [...eds, newEdge])
    },
    [setEdges]
  )

  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      if (isInitialLoadRef.current) {
        console.warn('[onNodeDragStop] 🛡️ Blokada zapisu podczas ładowania początkowego!')
        return
      }
      
      const x = node.position.x
      const y = node.position.y
      
      if (Math.abs(x) >= 50000 || Math.abs(y) >= 50000) {
        console.error(`[onNodeDragStop] ❌ BLOCKED pathological position: Node ${node.data.nodeId} at (${x}, ${y})`)
        console.error(`[onNodeDragStop] ❌ Position NOT saved - coordinates out of valid range`)
        return
      }

      const positions: Record<string, { x: number; y: number }> = {}
      nodes.forEach(n => {
        if (Math.abs(n.position.x) < 50000 && Math.abs(n.position.y) < 50000) {
          positions[n.id] = n.position
        } else {
          console.warn(`[onNodeDragStop] ⚠️ Skipping pathological position for node ${n.id}: (${n.position.x}, ${n.position.y})`)
        }
      })
      
      const storageKey = `project-${projectId}-positions`
      const collapsedKey = `project-${projectId}-collapsed`
      localStorage.setItem(storageKey, JSON.stringify(positions))
      
      const collapsedArray = Array.from(collapsedNodes)
      localStorage.setItem(collapsedKey, JSON.stringify(collapsedArray))
      
      const manualFlagKey = `project-${projectId}-manual-layout`
      localStorage.setItem(manualFlagKey, 'true')
      
      setDisableAutoLayout(true)
      
      if (saveHistoryTimeoutRef.current) {
        clearTimeout(saveHistoryTimeoutRef.current)
      }
      
      saveHistoryTimeoutRef.current = setTimeout(() => {
        saveToHistory(positions)
      }, 500)
      
      if (savePositionTimeoutRef.current) {
        clearTimeout(savePositionTimeoutRef.current)
      }
      
      savePositionTimeoutRef.current = setTimeout(async () => {
        try {
          await axios.patch(`${API_URL}/api/decision-nodes/${node.data.nodeId}/`, {
            position_x: node.position.x,
            position_y: node.position.y
          })
        } catch (error) {
          console.error(`[onNodeDragStop] ❌ Failed to save position to API:`, error)
        }
      }, 1000)
    },
    [nodes, projectId, saveToHistory, collapsedNodes]
  )

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep',
      animated: false,
      style: { 
        stroke: '#10b981',
        strokeWidth: 3,
        opacity: 0.8
      },
      pathOptions: { borderRadius: 40 }
    }),
    []
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-xl text-slate-600">{t.tree.loadingTree}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-rose-600">{error}</div>
      </div>
    )
  }

  if (showAnalytics) {
    return (
      <div className="w-full h-full relative">
        <div className="absolute top-4 right-4 backdrop-blur-xl bg-white/90 border border-slate-200 rounded-xl shadow-lg z-[15] flex overflow-hidden">
          <button
            onClick={() => {
              setShowAnalytics(false)
              setShowTimeline(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              !showTimeline && !showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.treeView}
          >
            <LayoutGrid className="w-4 h-4" />
            {t.timeline.treeView}
          </button>
          <button
            onClick={() => {
              setShowTimeline(true)
              setShowAnalytics(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showTimeline
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.timelineView}
          >
            <Calendar className="w-4 h-4" />
            {t.timeline.timelineView}
          </button>
          <button
            onClick={() => {
              setShowAnalytics(true)
              setShowTimeline(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.analytics.analyticsView}
          >
            <BarChart3 className="w-4 h-4" />
            {t.analytics.analyticsView}
          </button>
        </div>

        <ProjectAnalytics projectId={projectId} />
      </div>
    )
  }

  if (showTimeline) {
    return (
      <div className="w-full h-full relative">
        <div className="absolute top-4 right-4 backdrop-blur-xl bg-white/90 border border-slate-200 rounded-xl shadow-lg z-[15] flex overflow-hidden">
          <button
            onClick={() => {
              setShowTimeline(false)
              setShowAnalytics(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              !showTimeline && !showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.treeView}
          >
            <LayoutGrid className="w-4 h-4" />
            {t.timeline.treeView}
          </button>
          <button
            onClick={() => {
              setShowTimeline(true)
              setShowAnalytics(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showTimeline
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.timelineView}
          >
            <Calendar className="w-4 h-4" />
            {t.timeline.timelineView}
          </button>
          <button
            onClick={() => {
              setShowAnalytics(true)
              setShowTimeline(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.analytics.analyticsView}
          >
            <BarChart3 className="w-4 h-4" />
            {t.analytics.analyticsView}
          </button>
        </div>

        <ProjectTimeline 
          projectId={projectId} 
          onNodeClick={(nodeId) => {
            setShowTimeline(false)
            setShowAnalytics(false)
            const node = nodeDataMap.get(nodeId)
            if (node) {
              setSelectedNode(node)
              setSidebarOpen(true)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#0f172a_50%,_#020617_100%)]">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      {project && (
        <>
          <div className="absolute top-32 left-4 bg-slate-900/80 backdrop-blur-xl shadow-[0_20px_70px_rgba(99,102,241,0.3)] rounded-2xl p-4 z-[5] border border-white/10 hover:shadow-[0_25px_90px_rgba(99,102,241,0.5)] transition-all max-w-xs">
            <div className="text-sm font-bold text-white line-clamp-2 mb-2">{project.title}</div>
            <div className="text-xs text-slate-300 flex items-center gap-2">
              <span className="text-slate-400">{t.tree.budget}:</span>
              <span className="font-semibold text-slate-100">
                {formatCurrency(project.budget_total)}
              </span>
            </div>
          </div>

          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center bg-slate-100/80 backdrop-blur-sm p-1 rounded-xl shadow-sm border border-slate-200">
            <button
              onClick={() => {
                setShowTimeline(false)
                setShowAnalytics(false)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                !showTimeline && !showAnalytics
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
              title={t.timeline.treeView}
            >
              <LayoutGrid className="w-4 h-4" />
              {t.timeline.treeView}
            </button>
            <button
              onClick={() => {
                setShowTimeline(true)
                setShowAnalytics(false)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                showTimeline
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
              title={t.timeline.timelineView}
            >
              <Calendar className="w-4 h-4" />
              {t.timeline.timelineView}
            </button>
            <button
              onClick={() => {
                setShowAnalytics(true)
                setShowTimeline(false)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                showAnalytics
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
              title={t.analytics.analyticsView}
            >
              <BarChart3 className="w-4 h-4" />
              {t.analytics.analyticsView}
            </button>
          </div>

          <div className="absolute top-6 right-6 flex items-center gap-3 z-50">
            <button
              onClick={() => setGlobalActionBoardOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={language === 'pl' ? 'Zobacz wszystkie zadania projektu' : 'View all project tasks'}
            >
              <ListTodo className="w-4 h-4" />
              {t.globalActionBoard.title}
            </button>

            <button
              onClick={() => setAdvisorOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={language === 'pl' ? 'Doradca strategiczny AI' : 'AI Strategic Advisor'}
            >
              <Brain className="w-4 h-4 text-indigo-600" />
              {language === 'pl' ? 'Doradca AI' : 'AI Advisor'}
            </button>

            <button
              onClick={() => setEditProjectOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={language === 'pl' ? 'Edytuj tytuł, opis i budżet projektu' : 'Edit project title, description and budget'}
            >
              <Settings className="w-4 h-4" />
              {language === 'pl' ? 'Edytuj' : 'Edit'}
            </button>
          </div>

          <div className="absolute top-20 left-6 flex gap-3 z-50">
            <div className="relative">
              <button
                onClick={() => setScenarioMenuOpen(!scenarioMenuOpen)}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
                title={language === 'pl' ? 'Wybierz scenariusz automatycznego wyboru opcji' : 'Select auto-selection scenario'}
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                {language === 'pl' ? 'Scenariusze' : 'Scenarios'}
                <motion.div
                  animate={{ rotate: scenarioMenuOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-3 h-3" />
                </motion.div>
              </button>

              {scenarioMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-12 left-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden min-w-[280px] z-20"
                >
                  <button
                    onClick={async () => {
                      const milestones = Array.from(nodeDataMap.values()).filter(n => n.node_type === 'milestone')
                      
                      for (const milestone of milestones) {
                        const options = Array.from(nodeDataMap.values()).filter(n => n.parent === milestone.id)
                        
                        if (options.length > 0) {
                          const cheapest = options.reduce((min, opt) => 
                            parseFloat(opt.estimated_cost) < parseFloat(min.estimated_cost) ? opt : min
                          )
                          
                          for (const opt of options) {
                            const newStatus = opt.id === cheapest.id ? 'selected' : 'pending'
                            await axios.patch(`${API_URL}/api/decision-nodes/${opt.id}/`, { status: newStatus })
                          }
                        }
                      }
                      
                      fetchTree()
                      setScenarioMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left text-slate-700 hover:bg-emerald-50 transition-all flex items-center gap-3 border-b border-slate-100"
                  >
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <div>
                      <div className="font-semibold text-sm">{t.tree.budgetMode}</div>
                      <div className="text-xs text-slate-500">{t.tree.budgetModeTooltip}</div>
                    </div>
                  </button>

                  <button
                    onClick={async () => {
                      const milestones = Array.from(nodeDataMap.values()).filter(n => n.node_type === 'milestone')
                      
                      for (const milestone of milestones) {
                        const options = Array.from(nodeDataMap.values()).filter(n => n.parent === milestone.id)
                        
                        if (options.length > 0) {
                          const balanced = options.reduce((best, opt) => {
                            const optScore = ((opt.score_comfort || 0) + (100 - (opt.score_risk || 0)) + (opt.score_time || 0) + (opt.score_pleasure || 0)) / 4
                            const bestScore = ((best.score_comfort || 0) + (100 - (best.score_risk || 0)) + (best.score_time || 0) + (best.score_pleasure || 0)) / 4
                            return optScore > bestScore ? opt : best
                          })
                          
                          for (const opt of options) {
                            const newStatus = opt.id === balanced.id ? 'selected' : 'pending'
                            await axios.patch(`${API_URL}/api/decision-nodes/${opt.id}/`, { status: newStatus })
                          }
                        }
                      }
                      
                      fetchTree()
                      setScenarioMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left text-slate-700 hover:bg-blue-50 transition-all flex items-center gap-3 border-b border-slate-100"
                  >
                    <Target className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-semibold text-sm">{t.tree.balancedMode}</div>
                      <div className="text-xs text-slate-500">{t.tree.balancedModeTooltip}</div>
                    </div>
                  </button>

                  <button
                    onClick={async () => {
                      const milestones = Array.from(nodeDataMap.values()).filter(n => n.node_type === 'milestone')
                      
                      for (const milestone of milestones) {
                        const options = Array.from(nodeDataMap.values()).filter(n => n.parent === milestone.id)
                        
                        if (options.length > 0) {
                          const vip = options.reduce((max, opt) => 
                            (opt.score_pleasure || 0) > (max.score_pleasure || 0) ? opt : max
                          )
                          
                          for (const opt of options) {
                            const newStatus = opt.id === vip.id ? 'selected' : 'pending'
                            await axios.patch(`${API_URL}/api/decision-nodes/${opt.id}/`, { status: newStatus })
                          }
                        }
                      }
                      
                      fetchTree()
                      setScenarioMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left text-slate-700 hover:bg-amber-50 transition-all flex items-center gap-3"
                  >
                    <Heart className="w-5 h-5 text-amber-600" />
                    <div>
                      <div className="font-semibold text-sm">{t.tree.vipMode}</div>
                      <div className="text-xs text-slate-500">{t.tree.vipModeTooltip}</div>
                    </div>
                  </button>
                </motion.div>
              )}
            </div>

            <button
              onClick={onToggleExpandAll}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={allExpanded ? t.tree.collapseAllMilestones : t.tree.expandAllMilestones}
            >
              {allExpanded ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
              {allExpanded ? t.tree.collapseAll : t.tree.expandAll}
            </button>
          </div>

          <div className="absolute top-32 right-4 flex flex-col gap-2 z-[15]">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                
                const selectedOptions = Array.from(nodeDataMap.values())
                  .filter(node => node.status === 'selected' && node.node_type !== 'milestone')
                  .map(node => ({
                    id: node.id,
                    title: node.title,
                    description: node.description,
                    cost: parseFloat(node.estimated_cost),
                    section: node.section,
                    order: node.order,
                    scores: {
                      comfort: node.score_comfort,
                      risk: node.score_risk,
                      time: node.score_time,
                      pleasure: node.score_pleasure
                    }
                  }))
                
                const totalCost = selectedOptions.reduce((sum, opt) => sum + opt.cost, 0)
                const avgJoy = selectedOptions.length > 0
                  ? selectedOptions.reduce((sum, opt) => sum + (opt.scores.pleasure || 0), 0) / selectedOptions.length
                  : 0
                
                const actionPlan = {
                  projectId,
                  projectTitle: project?.title,
                  budget: project ? parseFloat(project.budget_total) : 0,
                  selectedOptions,
                  summary: {
                    totalCost,
                    avgJoy: avgJoy.toFixed(1),
                    optionsCount: selectedOptions.length,
                    budgetUsage: project ? ((totalCost / parseFloat(project.budget_total)) * 100).toFixed(1) : 0
                  },
                  generatedAt: new Date().toISOString()
                }

                const blob = new Blob([JSON.stringify(actionPlan, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `action_plan_project_${projectId}.json`
                a.click()
                URL.revokeObjectURL(url)
                
                const message = t.tree.actionPlanGenerated
                  .replace('{count}', String(actionPlan.summary.optionsCount))
                  .replace('{cost}', formatCurrency(totalCost)) +
                  (language === 'pl'
                    ? `😊 Średnia radość: ${actionPlan.summary.avgJoy}/100\n📈 Wykorzystanie budżetu: ${actionPlan.summary.budgetUsage}%\n\nPlan został zapisany jako JSON`
                    : `😊 Average joy: ${actionPlan.summary.avgJoy}/100\n📈 Budget usage: ${actionPlan.summary.budgetUsage}%\n\nPlan saved as JSON`)
                
                alert(message)
              }}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-3 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-semibold text-sm border border-indigo-400/30"
              title="Generate action plan from selected options"
            >
              <FileDown className="w-4 h-4" />
              {language === 'pl' ? 'Generuj Plan' : 'Action Plan'}
            </motion.button>
            
            <motion.button
              data-testid="auto-layout-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                
                const manualFlagKey = `project-${projectId}-manual-layout`
                const storageKey = `project-${projectId}-positions`
                const collapsedKey = `project-${projectId}-collapsed`
                
                localStorage.removeItem(manualFlagKey)
                localStorage.removeItem(storageKey)
                localStorage.removeItem(collapsedKey)
                setDisableAutoLayout(false)

                const allNodes = Array.from(nodeDataMap.values())
                const rootNodesWithChildren = new Set<number>()
                
                allNodes.forEach(node => {
                  if (!node.parent) {
                    const children = allNodes.filter(n => n.parent === node.id)
                    if (children.length > 0) {
                      rootNodesWithChildren.add(node.id)
                    }
                  }
                })

                setCollapsedNodes(rootNodesWithChildren)
                collapsedNodesRef.current = rootNodesWithChildren
                
                setTimeout(() => {
                  onLayout()
                  
                  forceCenterView()
                }, 50)
              }}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Reset layout to default positions"
            >
              <Sparkles className="w-4 h-4" />
              Auto-layout
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSavePositions}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Save current positions"
            >
              <Save className="w-4 h-4" />
              {language === 'pl' ? 'Zapisz' : 'Save'}
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onUndoPositions}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Restore last saved positions"
            >
              <Undo className="w-4 h-4" />
              {language === 'pl' ? 'Cofnij' : 'Undo'}
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCenterView}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title={t.common.centerView}
            >
              <Target className="w-4 h-4" />
              Center
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onExportPDF}
              disabled={exportingPDF}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export to PDF"
            >
              <FileDown className="w-4 h-4" />
              {exportingPDF ? t.tree.exporting : t.tree.exportPDF}
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onShareProject}
              className="bg-gradient-to-r from-indigo-600/80 to-purple-600/80 backdrop-blur-md border border-indigo-400/30 text-white hover:from-indigo-500/90 hover:to-purple-500/90 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Share project"
            >
              <Link className="w-4 h-4" />
              Share
            </motion.button>
          </div>
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
        {false && chronologicalMode && sectionHeaders.map(header => (
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
          style={{
            height: 120,
            width: 180,
          }}
        />
      </ReactFlow>
      
      <FloatingDashboard
        selectedNodes={Array.from(nodeDataMap.values())
          .filter(node => node.status === 'selected' && node.node_type !== 'milestone')
          .map(node => ({
            nodeId: node.id,
            title: node.title,
            cost: node.actual_cost ? parseFloat(node.actual_cost) : parseFloat(node.estimated_cost) || 0,
            joy: node.score_pleasure || 0,
            risk: node.score_risk || 0,
            section: node.section || 'general'
          }))}
        totalBudget={project ? parseFloat(project.budget_total) : 0}
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
          onProjectUpdated={async () => {
            setIsUpdatingProjectMeta(true)
            
            try {
              const response = await axios.get(`${API_URL}/api/projects/${projectId}/`)
              setProject(response.data)
              
              setTimeout(() => {
                setIsUpdatingProjectMeta(false)
              }, 100)
            } catch (error) {
              console.error('Error refreshing project:', error)
              setIsUpdatingProjectMeta(false)
            }
          }}
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
      
      {shareToastVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-8 right-8 z-50 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400/30"
        >
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">{language === 'pl' ? 'Link skopiowany!' : 'Link copied!'}</p>
            <p className="text-sm text-emerald-100">{language === 'pl' ? 'Możesz go wysłać znajomym' : 'Share it with your team'}</p>
          </div>
        </motion.div>
      )}
      
      <AIChat projectId={projectId} />
    </div>
  )
}

export default TreeVisualizer
