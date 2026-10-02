import { useCallback, useEffect, useState, useMemo } from 'react'
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
} from 'reactflow'
import 'reactflow/dist/style.css'
import axios from 'axios'
import PublicNodeSidebar from './PublicNodeSidebar'
import { useLanguage } from '../contexts/LanguageContext'
import DecisionNodeComponent from './DecisionNodeComponent'

const nodeTypes = {
  decisionNode: DecisionNodeComponent,
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface DecisionNode {
  id: number
  title: string
  description: string
  estimated_cost: string
  parent: number | null
  project: number
  children: DecisionNode[]
  vote_count: number
  path_cost?: number  // P1 FIX: Backend teraz zwraca path_cost
}

interface Project {
  id: number
  title: string
  description: string
  budget_total: string
}

interface PublicProjectViewProps {
  token: string
}

const PublicProjectView = ({ token }: PublicProjectViewProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<DecisionNode | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [nodeDataMap, setNodeDataMap] = useState<Map<number, DecisionNode>>(new Map())
  const [project, setProject] = useState<Project | null>(null)
  const { formatCurrency, t } = useLanguage()
  const [sessionId] = useState(() => {
    let id = localStorage.getItem('session_id')
    if (!id) {
      id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('session_id', id)
    }
    return id
  })

  const buildTree = useCallback(
    (
      nodesData: DecisionNode[],
      projectBudget: number
    ): { nodes: Node[]; edges: Edge[]; nodeMap: Map<number, DecisionNode> } => {
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      const nodeMap = new Map<number, Node>()
      const dataMap = new Map<number, DecisionNode>()

      const createNode = (nodeData: DecisionNode, level: number, index: number): Node => {
        dataMap.set(nodeData.id, nodeData)
        const x = level * 320 + 100
        const y = index * 180 + 100

        // P1 FIX: Używamy path_cost z backendu zamiast lokalnej kalkulacji
        const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
        const exceedsBudget = pathCost > projectBudget

        const flowNode: Node = {
          id: `node-${nodeData.id}`,
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
          },
        }

        return flowNode
      }

      const processNode = (nodeData: DecisionNode, level: number, index: number) => {
        const flowNode = createNode(nodeData, level, index)
        flowNodes.push(flowNode)
        nodeMap.set(nodeData.id, flowNode)

        if (nodeData.parent) {
          const parentNode = nodeMap.get(nodeData.parent)
          if (parentNode) {
            const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
            const exceedsBudget = pathCost > projectBudget

            flowEdges.push({
              id: `edge-${nodeData.parent}-${nodeData.id}`,
              source: parentNode.id,
              target: flowNode.id,
              type: 'smoothstep',
              animated: !exceedsBudget,
              style: {
                stroke: exceedsBudget ? '#ef4444' : '#6366f1',
                strokeWidth: exceedsBudget ? 3 : 2,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: exceedsBudget ? '#ef4444' : '#6366f1',
              },
            })
          }
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

      return { nodes: flowNodes, edges: flowEdges, nodeMap: dataMap }
    },
    []
  )

  const fetchProject = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/public/projects/${token}/`)
      setProject(response.data)
    } catch (err: any) {
      console.error('Error fetching project:', err)
      setError(err.response?.data?.error || 'Failed to load project')
    }
  }, [token])

  const fetchTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_URL}/api/public/projects/${token}/tree/`)
      const treeData = response.data

      if (Array.isArray(treeData) && treeData.length > 0) {
        const projectBudget = project ? parseFloat(project.budget_total) : 0
        const { nodes: flowNodes, edges: flowEdges, nodeMap } = buildTree(
          treeData,
          projectBudget
        )
        setNodes(flowNodes)
        setEdges(flowEdges)
        setNodeDataMap(nodeMap)
      } else {
        setNodes([])
        setEdges([])
        setNodeDataMap(new Map())
      }
    } catch (err: any) {
      console.error('Error fetching tree:', err)
      setError(err.response?.data?.error || 'Failed to load decision tree')
    } finally {
      setLoading(false)
    }
  }, [token, project, buildTree, setNodes, setEdges])

  useEffect(() => {
    if (token) {
      fetchProject()
    }
  }, [token, fetchProject])

  useEffect(() => {
    if (token && project) {
      fetchTree()
    }
  }, [token, project, fetchTree])

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

  const handleVoteSubmitted = useCallback(() => {
    fetchTree()
    if (selectedNode) {
      const updatedNode = nodeDataMap.get(selectedNode.id)
      if (updatedNode) {
        setSelectedNode(updatedNode)
      }
    }
  }, [fetchTree, selectedNode, nodeDataMap])

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#6366f1', strokeWidth: 2 },
    }),
    []
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xl">{t.public.loadingProject}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-2">{error}</div>
          <div className="text-gray-600">{t.public.projectNotExist}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-slate-50">
      {project && (
        <>
          <div className="absolute top-4 left-4 bg-white shadow-lg rounded-xl p-4 z-10 border border-indigo-200">
            <div className="text-sm font-semibold text-slate-900">{project.title}</div>
            <div className="text-xs text-slate-600 mt-1">
              {t.public.viewOnly} • {t.tree.budget}: {formatCurrency(project.budget_total)}
            </div>
          </div>
          
          {/* P3 FIX: Banner informujący o trybie read-only */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-300 rounded-lg px-4 py-2 z-10 shadow-md">
            <p className="text-sm text-amber-900 font-medium flex items-center gap-2">
              <span>👁️</span>
              <span>View-only mode • Click nodes to vote</span>
            </p>
          </div>
        </>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        className="bg-slate-50"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#cbd5e1"
          className="opacity-40"
        />
        <Controls
          className="bg-white border border-slate-200 rounded-lg shadow-md"
          showInteractive={false}
        />
        <MiniMap
          className="bg-white border border-slate-200 rounded-lg shadow-md"
          nodeColor="#6366f1"
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{
            height: 120,
            width: 180,
          }}
        />
      </ReactFlow>
      <PublicNodeSidebar
        node={selectedNode}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        onVoteSubmitted={handleVoteSubmitted}
        sessionId={sessionId}
      />
    </div>
  )
}

export default PublicProjectView

