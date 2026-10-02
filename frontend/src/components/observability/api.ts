import axios from 'axios'
import type { DailyMetrics, LLMCall, LLMMetrics, LLMTotals, ModelMetrics, OperationMetrics } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const num = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toTotals = (raw: any = {}): LLMTotals => ({
  calls: num(raw.calls),
  success_rate: num(raw.success_rate),
  avg_attempts: num(raw.avg_attempts),
  input_tokens: num(raw.input_tokens),
  output_tokens: num(raw.output_tokens),
  cost_usd: num(raw.cost_usd),
  p50_latency_ms: num(raw.p50_latency_ms),
  p95_latency_ms: num(raw.p95_latency_ms),
})

const toOperation = (raw: any): OperationMetrics => ({
  operation: String(raw.operation ?? ''),
  calls: num(raw.calls),
  success_rate: num(raw.success_rate),
  avg_attempts: num(raw.avg_attempts),
  p50_latency_ms: num(raw.p50_latency_ms),
  p95_latency_ms: num(raw.p95_latency_ms),
  input_tokens: num(raw.input_tokens),
  output_tokens: num(raw.output_tokens),
  cost_usd: num(raw.cost_usd),
})

const toModel = (raw: any): ModelMetrics => ({
  model: String(raw.model ?? ''),
  calls: num(raw.calls),
  cost_usd: num(raw.cost_usd),
  p50_latency_ms: num(raw.p50_latency_ms),
})

const toDaily = (raw: any): DailyMetrics => ({
  date: String(raw.date ?? '').slice(0, 10),
  calls: num(raw.calls),
  cost_usd: num(raw.cost_usd),
  failures: num(raw.failures),
})

const toCall = (raw: any): LLMCall => ({
  id: num(raw.id),
  created_at: String(raw.created_at ?? ''),
  operation: String(raw.operation ?? ''),
  model: String(raw.model ?? ''),
  latency_ms: num(raw.latency_ms),
  input_tokens: num(raw.input_tokens),
  output_tokens: num(raw.output_tokens),
  cost_usd: num(raw.cost_usd),
  attempts: num(raw.attempts),
  success: Boolean(raw.success),
  error: raw.error ? String(raw.error) : null,
  project: raw.project === null || raw.project === undefined ? null : num(raw.project),
})

const asList = (data: any): any[] => {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

export const fetchLLMMetrics = async (days: number, signal?: AbortSignal): Promise<LLMMetrics> => {
  const response = await axios.get(`${API_URL}/api/llm/metrics/`, { params: { days }, signal })
  const data = response.data ?? {}
  return {
    window_days: num(data.window_days) || days,
    totals: toTotals(data.totals),
    by_operation: asList(data.by_operation).map(toOperation),
    by_model: asList(data.by_model).map(toModel),
    daily: asList(data.daily).map(toDaily),
  }
}

export const fetchLLMCalls = async (limit: number, signal?: AbortSignal): Promise<LLMCall[]> => {
  const response = await axios.get(`${API_URL}/api/llm/calls/`, { params: { limit }, signal })
  return asList(response.data).map(toCall)
}
