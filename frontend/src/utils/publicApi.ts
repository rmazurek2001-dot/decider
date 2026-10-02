/**
 * Public API - endpointy bez autoryzacji dla udostępnionych projektów
 */
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Osobna instancja axios BEZ tokena autoryzacji
const publicAxios = axios.create({
  baseURL: API_URL,
})

export interface PublicProject {
  id: number
  title: string
  description: string
  budget_total: string
  decision_nodes: PublicDecisionNode[]
  ui_state: {
    collapsedNodes?: number[]
    viewport?: {
      x: number
      y: number
      zoom: number
    }
  }
  created_at: string
  updated_at: string
}

export interface PublicDecisionNode {
  id: number
  title: string
  description: string
  estimated_cost: string
  actual_cost: string | null
  parent: number | null
  project: number
  children: PublicDecisionNode[]
  vote_count: number
  path_cost: number
  score_comfort: number
  score_risk: number
  score_time: number
  score_pleasure: number
  status: 'pending' | 'selected' | 'rejected'
  section: string
  order: number
  node_type: 'decision' | 'milestone'
  tasks: PublicTask[]
  comments: PublicComment[]
  comment_count: number
  position_x: number
  position_y: number
  created_at: string
  updated_at: string
}

export interface PublicTask {
  id: number
  node: number
  node_id: number
  node_title: string
  node_section: string
  title: string
  is_completed: boolean
  due_date: string | null
  created_at: string
}

export interface PublicComment {
  id: number
  node: number
  author_name: string
  content: string
  created_at: string
}

export interface PublicTasksResponse {
  tasks: PublicTask[]
  stats: {
    total: number
    completed: number
    pending: number
    completion_percentage: number
  }
}

/**
 * Pobiera dane projektu (bez autoryzacji)
 */
export const fetchPublicProject = async (token: string): Promise<PublicProject> => {
  const response = await publicAxios.get(`/api/public/projects/${token}/`)
  return response.data
}

/**
 * Pobiera drzewo decyzyjne projektu (bez autoryzacji)
 */
export const fetchPublicTree = async (token: string): Promise<PublicDecisionNode[]> => {
  const response = await publicAxios.get(`/api/public/projects/${token}/tree/`)
  return response.data
}

/**
 * Pobiera zadania projektu (bez autoryzacji)
 */
export const fetchPublicTasks = async (token: string): Promise<PublicTasksResponse> => {
  const response = await publicAxios.get(`/api/public/projects/${token}/tasks/`)
  return response.data
}
