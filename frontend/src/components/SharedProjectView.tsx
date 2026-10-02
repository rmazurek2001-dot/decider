import { useCallback, useEffect, useState, useRef } from 'react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  NodeMouseHandler,
  MarkerType,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ExternalLink } from 'lucide-react'
import CustomNode from './CustomNode'
import NodeSidebar from './NodeSidebar'
import FloatingDashboard from './FloatingDashboard'
import {
  fetchPublicProject,
  fetchPublicTree,
  PublicProject,
  PublicDecisionNode,
} from '../utils/publicApi'
import { useLanguage } from '../contexts/LanguageContext'

const nodeTypes = {
  custom: CustomNode,
}

interface SharedProjectViewProps {
  token: string
}

const SharedProjectView = ({ token }: SharedProjectViewProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [project, setProject] = useState<PublicProject | null>(null)
  const [treeData, setTreeData] = useState<PublicDecisionNode[]>([])
  const [, setSelectedNodeId] = useState<number | null>(null)
  const [selectedNode, setSelectedNode] = useState<PublicDecisionNode | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const collapsedNodesRef = useRef<Set<number>>(new Set())
  const navigate = useNavigate()
  const { fitView, getNodes } = useReactFlow()
  const { t, formatCurrency } = useLanguage()

  const buildTree = useCallback(
    (nodesData: PublicDecisionNode[], projectBudget: number) => {
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      const reactFlowNodeMap = new Map<number, Node>()

      const createNode = (nodeData: PublicDecisionNode, level: number, index: number): Node => {
        const x = nodeData.position_x || level * 400
        const y = nodeData.position_y || index * 200

        const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
        const exceedsBudget = pathCost > projectBudget

        const flowNode: Node = {
          id: `node-${nodeData.id}`,
          type: 'custom',
          position: { x, y },
          data: {
            nodeId: nodeData.id,
            title: nodeData.title,
            description: nodeData.description,
            estimated_cost: nodeData.estimated_cost,
            actual_cost: nodeData.actual_cost,
            vote_count: nodeData.vote_count || 0,
            pathCost,
            exceedsBudget,
            status: nodeData.status,
            node_type: nodeData.node_type,
            score_comfort: nodeData.score_comfort,
            score_risk: nodeData.score_risk,
            score_time: nodeData.score_time,
            score_pleasure: nodeData.score_pleasure,
            section: nodeData.section,
            order: nodeData.order,
            tasks: nodeData.tasks || [],
            comments: nodeData.comments || [],
            comment_count: nodeData.comment_count || 0,
            parent: nodeData.parent,
            isReadOnly: true,
          },
        }

        return flowNode
      }

      const processNode = (nodeData: PublicDecisionNode, level: number, index: number) => {
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

          const isChildMilestone = nodeData.node_type === 'milestone'
          const isParentMilestone = parentNode.data.node_type === 'milestone'

          let sourceHandle = 'bottom'
          let targetHandle = 'top'

          if (!isChildMilestone && isParentMilestone) {
            const isChildOnRight = flowNode.position.x >= parentNode.position.x
            if (isChildOnRight) {
              sourceHandle = 'right'
              targetHandle = 'left'
            } else {
              sourceHandle = 'left-source'
              targetHandle = 'right-target'
            }
          }

          const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
          const exceedsBudget = pathCost > projectBudget

          let strokeColor = '#94a3b8'
          let strokeWidth = 6

          if (nodeData.status === 'selected') {
            strokeColor = '#10b981'
            strokeWidth = 10
          } else if (nodeData.status === 'rejected') {
            strokeColor = '#ef4444'
            strokeWidth = 6
          }

          if (isChildMilestone && isParentMilestone) {
            strokeColor = '#a78bfa'
            strokeWidth = 12
          }

          flowEdges.push({
            id: `edge-${nodeData.parent}-${nodeData.id}`,
            source: `node-${nodeData.parent}`,
            target: `node-${nodeData.id}`,
            sourceHandle,
            targetHandle,
            type: 'smoothstep',
            animated: !exceedsBudget,
            style: {
              stroke: strokeColor,
              strokeWidth,
              opacity: nodeData.status === 'rejected' ? 0.7 : nodeData.status === 'selected' ? 1 : 0.85,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: strokeColor,
              width: isChildMilestone && isParentMilestone ? 48 : 24,
              height: isChildMilestone && isParentMilestone ? 48 : 24,
            },
            zIndex: isChildMilestone && isParentMilestone ? 10 : 1,
          })
        }

        nodeData.children.forEach((child, childIndex) => {
          processNode(child, level + 1, childIndex)
        })
      }

      const isNodeHidden = (nodeData: PublicDecisionNode): boolean => {
        let current = nodeData.parent
        while (current !== null) {
          if (collapsedNodesRef.current.has(current)) {
            return true
          }
          const parentNode = findNodeById(nodesData, current)
          if (!parentNode) break
          current = parentNode.parent
        }
        return false
      }

      const findNodeById = (nodes: PublicDecisionNode[], id: number): PublicDecisionNode | null => {
        for (const node of nodes) {
          if (node.id === id) return node
          if (node.children && node.children.length > 0) {
            const found = findNodeById(node.children, id)
            if (found) return found
          }
        }
        return null
      }

      nodesData.forEach((node, index) => {
        if (!node.parent) {
          processNode(node, 0, index)
        }
      })

      return { nodes: flowNodes, edges: flowEdges }
    },
    []
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [projectData, treeDataResponse] = await Promise.all([
        fetchPublicProject(token),
        fetchPublicTree(token),
      ])

      setProject(projectData)
      setTreeData(treeDataResponse)

      const projectBudget = parseFloat(projectData.budget_total)
      const { nodes: flowNodes, edges: flowEdges } = buildTree(treeDataResponse, projectBudget)

      setNodes(flowNodes)
      setEdges(flowEdges)

      setTimeout(() => {
        const checkAndFit = () => {
          const currentNodes = getNodes()
          const allHaveDimensions = currentNodes.every((n) => n.width && n.width > 0)

          if (allHaveDimensions) {
            fitView({ padding: 0.2, duration: 800 })
            return true
          }
          return false
        }

        let attempts = 0
        const maxAttempts = 20
        const interval = setInterval(() => {
          attempts++
          if (checkAndFit() || attempts >= maxAttempts) {
            clearInterval(interval)
          }
        }, 100)
      }, 100)
    } catch (err: any) {
      console.error('Error fetching shared project:', err)
      setError(err.response?.data?.error || t.public.failedToLoadSharedProject)
    } finally {
      setLoading(false)
    }
  }, [token, buildTree, setNodes, setEdges, fitView, getNodes])

  useEffect(() => {
    if (token) {
      fetchData()
    }
  }, [token, fetchData])

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const nodeId = node.data.nodeId
      if (nodeId) {
        setSelectedNodeId(nodeId)
        const findNode = (nodes: PublicDecisionNode[], id: number): PublicDecisionNode | null => {
          for (const n of nodes) {
            if (n.id === id) return n
            if (n.children && n.children.length > 0) {
              const found = findNode(n.children, id)
              if (found) return found
            }
          }
          return null
        }
        const nodeData = findNode(treeData, nodeId)
        setSelectedNode(nodeData)
        setSidebarOpen(true)
      }
    },
    [treeData]
  )

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
    setSelectedNodeId(null)
    setSelectedNode(null)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-xl text-slate-700 font-medium">{t.public.loadingSharedProject}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{t.public.projectNotFound}</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            {t.public.goToDashboard}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-screen relative bg-gradient-to-br from-slate-50 to-slate-100">
      {project && (
        <div className="absolute top-4 md:top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col md:flex-row items-center gap-2 md:gap-4 w-full md:w-auto px-4 md:px-0">
          <div className="bg-white/95 backdrop-blur-sm shadow-xl rounded-2xl px-4 md:px-6 py-3 md:py-4 border border-indigo-100 w-full md:w-auto">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm md:text-lg font-bold text-slate-900 truncate">{project.title}</h1>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  👁️ {t.public.viewOnly} • {formatCurrency(project.budget_total)}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="group bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 md:px-6 py-3 md:py-4 rounded-2xl shadow-xl transition-all duration-300 hover:shadow-2xl hover:scale-105 flex items-center gap-2 md:gap-3 font-semibold text-sm md:text-base w-full md:w-auto justify-center"
          >
            <Sparkles className="w-4 h-4 md:w-5 md:h-5 group-hover:rotate-12 transition-transform" />
            <span className="hidden md:inline">{t.public.buildYourOwnPlan}</span>
            <span className="md:hidden">{t.public.buildYourPlan}</span>
            <ExternalLink className="w-3 h-3 md:w-4 md:h-4 opacity-75" />
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.5, minZoom: 0.1 }}
        minZoom={0.05}
        maxZoom={2}
        className="bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#cbd5e1"
          className="opacity-40"
        />
        <Controls
          className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg !bottom-4 md:!bottom-auto"
          showInteractive={false}
        />
        <MiniMap
          className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-lg hidden md:block"
          nodeColor="#6366f1"
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{
            height: 120,
            width: 180,
          }}
        />
      </ReactFlow>

      {project && (
        <FloatingDashboard
          selectedNodes={treeData
            .flatMap((node) => {
              const flatten = (n: PublicDecisionNode): PublicDecisionNode[] => {
                return [n, ...n.children.flatMap(flatten)]
              }
              return flatten(node)
            })
            .filter((node) => node.status === 'selected' && node.node_type !== 'milestone')
            .map((node) => ({
              nodeId: node.id,
              title: node.title,
              cost: node.actual_cost
                ? parseFloat(node.actual_cost)
                : parseFloat(node.estimated_cost) || 0,
              joy: node.score_pleasure || 0,
              risk: node.score_risk || 0,
              section: node.section || 'general',
            }))}
          totalBudget={parseFloat(project.budget_total)}
        />
      )}

      <NodeSidebar
        node={selectedNode}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        onNodesGenerated={() => {}}
        onNodeUpdated={() => {}}
        onNodeDeleted={() => {}}
        isReadOnly={true}
      />
    </div>
  )
}

export default SharedProjectView
