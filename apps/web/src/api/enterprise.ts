// Enterprise 页面用到的后端接口封装。
import { http } from './client';

export interface OverviewData {
  total_tasks: number;
  success_rate_today: number;
  success_rate_7d: number;
  avg_duration_ms: number;
  pending_approvals: number;
  needs_human_count: number;
}

export interface TrendItem {
  date: string;
  success: number;
  failed: number;
  total: number;
}

export type ErrorDistribution = Record<string, number>;

export interface BLComparison {
  business_line_id: string;
  total_tasks: number;
  success_rate: number;
}

export interface ApprovalHour {
  hour: number;
  avg_minutes: number;
  count: number;
}

export interface CostBreakdown {
  model_tier: string;
  total_calls: number;
  cached_calls: number;
  cache_hit_rate: number;
  total_tokens: number;
  estimated_cost_usd: number;
  estimated_saved_usd: number;
}

export interface CostData {
  total_cost_usd: number;
  total_saved_usd: number;
  breakdown: CostBreakdown[];
}

export function getOverview() {
  return http.get<OverviewData>('/enterprise/dashboard/overview').then((r) => r.data);
}
export function getTrend(days = 30) {
  return http.get<TrendItem[]>('/enterprise/dashboard/trend', { params: { days } }).then((r) => r.data);
}
export function getErrors() {
  return http.get<ErrorDistribution>('/enterprise/dashboard/errors').then((r) => r.data);
}
export function getBusinessLines() {
  return http.get<BLComparison[]>('/enterprise/dashboard/business-lines').then((r) => r.data);
}
export function getApprovalTime() {
  return http.get<ApprovalHour[]>('/enterprise/dashboard/approval-time').then((r) => r.data);
}
export function getCost() {
  return http.get<CostData>('/enterprise/dashboard/cost').then((r) => r.data);
}

// ── 审批中心 ──

export interface ApprovalRequest {
  id: string;
  taskId: string;
  riskLevel: string;
  riskReason: string;
  operationDescription: string | null;
  departmentId: string;
  businessLineId: string | null;
  requestedAt: string;
  status: string;
}

export function listPendingApprovals() {
  return http.get<ApprovalRequest[]>('/enterprise/approvals/pending').then((r) => r.data);
}
export function approveRequest(id: string, note = '') {
  return http.post(`/enterprise/approvals/${id}/approve`, { note }).then((r) => r.data);
}
export function rejectRequest(id: string, note = '') {
  return http.post(`/enterprise/approvals/${id}/reject`, { note }).then((r) => r.data);
}

// ── 审计日志 ──

export interface AuditLogEntry {
  audit_log_id: string;
  task_id: string;
  action_index: number;
  action_type: string;
  target_element: string | null;
  input_value: string | null;
  page_url: string | null;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
  duration_ms: number | null;
  executor: string;
  execution_result: string;
  error_message: string | null;
  has_approval: boolean;
  created_at: string;
}

export function queryAuditLogs(params?: { page?: number; page_size?: number }) {
  return http
    .get<{ items: AuditLogEntry[]; total: number }>('/enterprise/audit/logs', { params })
    .then((r) => r.data);
}

// ── LLM 缓存统计 ──

export interface CacheStats {
  total_entries: number;
  hits: number;
  misses: number;
  hit_rate: number;
  sets: number;
}

export function getCacheStats() {
  return http.get<CacheStats>('/enterprise/cache/stats').then((r) => r.data);
}
