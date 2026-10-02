export interface LLMTotals {
  calls: number
  success_rate: number
  avg_attempts: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  p50_latency_ms: number
  p95_latency_ms: number
}

export interface OperationMetrics {
  operation: string
  calls: number
  success_rate: number
  avg_attempts: number
  p50_latency_ms: number
  p95_latency_ms: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

export interface ModelMetrics {
  model: string
  calls: number
  cost_usd: number
  p50_latency_ms: number
}

export interface DailyMetrics {
  date: string
  calls: number
  cost_usd: number
  failures: number
}

export interface LLMMetrics {
  window_days: number
  totals: LLMTotals
  by_operation: OperationMetrics[]
  by_model: ModelMetrics[]
  daily: DailyMetrics[]
}

export interface LLMCall {
  id: number
  created_at: string
  operation: string
  model: string
  latency_ms: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  attempts: number
  success: boolean
  error: string | null
  project: number | null
}
