import axios from 'axios'
import type { Node } from 'reactflow'
import type { CriteriaWeights, DecisionNode, NodeStatus, Project, ScenarioMode } from '../types/tree'
import { pickScenarioOption } from './scenarios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const fetchProject = async (projectId: number): Promise<Project> => {
  const response = await axios.get<Project>(`${API_URL}/api/projects/${projectId}/`)
  return response.data
}

export const fetchProjectTree = async (projectId: number): Promise<DecisionNode[]> => {
  const response = await axios.get<unknown>(`${API_URL}/api/projects/${projectId}/tree/`)
  return Array.isArray(response.data) ? (response.data as DecisionNode[]) : []
}

export const patchProject = (projectId: number, payload: Partial<Project>) =>
  axios.patch(`${API_URL}/api/projects/${projectId}/`, payload)

export const saveCriteriaWeights = (projectId: number, weights: CriteriaWeights) =>
  patchProject(projectId, { criteria_weights: weights })

export const saveLayout = (projectId: number, nodes: Node[]) =>
  axios.post(`${API_URL}/api/projects/${projectId}/save_layout/`, {
    positions: nodes.map(node => ({
      id: node.data.nodeId,
      position_x: node.position.x,
      position_y: node.position.y,
    })),
  })

export const fetchNode = async (nodeId: number): Promise<DecisionNode> => {
  const response = await axios.get<DecisionNode>(`${API_URL}/api/decision-nodes/${nodeId}/`)
  return response.data
}

export const createNode = async (payload: Partial<DecisionNode>): Promise<DecisionNode> => {
  const response = await axios.post<DecisionNode>(`${API_URL}/api/decision-nodes/`, payload)
  return response.data
}

export const patchNode = (nodeId: number, payload: Partial<DecisionNode>) =>
  axios.patch(`${API_URL}/api/decision-nodes/${nodeId}/`, payload)

export const deleteNode = (nodeId: number) =>
  axios.delete(`${API_URL}/api/decision-nodes/${nodeId}/`)

export const applyScenario = async (nodes: DecisionNode[], mode: ScenarioMode, weights: CriteriaWeights) => {
  const milestones = nodes.filter(n => n.node_type === 'milestone')

  for (const milestone of milestones) {
    const options = nodes.filter(n => n.parent === milestone.id)
    const chosen = pickScenarioOption(options, mode, weights)
    if (!chosen) continue

    for (const option of options) {
      const status: NodeStatus = option.id === chosen.id ? 'selected' : 'pending'
      await patchNode(option.id, { status })
    }
  }
}
