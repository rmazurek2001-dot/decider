export type NodeStatus = 'pending' | 'selected' | 'rejected'
export type NodeType = 'decision' | 'milestone' | 'option'
export type Criterion = 'comfort' | 'risk' | 'time' | 'pleasure'
export type CriteriaWeights = Record<Criterion, number>

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

export interface ScoreFields {
  score_comfort?: number
  score_risk?: number
  score_time?: number
  score_pleasure?: number
}

export interface DecisionNode extends ScoreFields {
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
  status?: NodeStatus
  section?: string
  order?: number
  node_type?: NodeType
  tasks?: Task[]
  comments?: Comment[]
  comment_count?: number
  position_x?: number
  position_y?: number
}

export interface Project {
  id: number
  title: string
  description: string
  budget_total: string
  ui_state?: Record<string, unknown> | null
  share_token?: string
  criteria_weights?: Partial<CriteriaWeights> | null
}

export interface XYPosition {
  x: number
  y: number
}

export type PositionMap = Record<string, XYPosition>

export interface SectionHeaderInfo {
  section: string
  y: number
  nodeCount: number
}

export interface NodeActions {
  onToggleCollapse: (nodeId: number) => void
  onToggleSelection: (nodeId: number) => void
  onAddChild: (nodeId: number) => void
  onDeleteNode: (nodeId: number) => void
  onEditNode: (nodeId: number) => void
}

export interface TreeNodeData extends ScoreFields, Partial<NodeActions> {
  nodeId: number
  title: string
  description: string
  estimated_cost: string
  actual_cost?: string | null
  vote_count?: number
  pathCost: number
  exceedsBudget: boolean
  status?: NodeStatus
  section?: string
  order?: number
  node_type?: NodeType
  parent?: number | null
  hasChildren?: boolean
  isCollapsed?: boolean
  isOnWinningPath?: boolean
  aggregatedCost?: number
  childrenCount?: number
  selectedChildrenCount?: number
  tasks?: Array<Pick<Task, 'id' | 'title' | 'is_completed'>>
  comments?: Comment[]
  comment_count?: number
  isReadOnly?: boolean
  weights?: CriteriaWeights
}

export type ViewMode = 'tree' | 'timeline' | 'analytics'
export type ScenarioMode = 'budget' | 'balanced' | 'vip'
