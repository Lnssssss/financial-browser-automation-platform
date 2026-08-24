// Dashboard 统计的输入/输出形状。纯类型，无副作用、无 DI。
// 输入记录（TaskRecord/ApprovalStatsRecord/ModelCallRecord）是执行层上报的事件形状，
// 不是 Prisma 实体——保留 snake_case 对齐上报 JSON 的字段名，同 workflow 的 task_id、
// approval 的 risk_level 一致处理。

/// 一条任务事件（供统计聚合，非任务表本身）。
export interface TaskRecord {
  org_id: string;
  status: string;
  created_at: string; // ISO 8601（无时区后缀，UTC 语义）
  duration_ms?: number;
  business_line_id?: string;
  error_type?: string;
}

/// 一条审批事件（供响应耗时统计，字段集比 Prisma ApprovalRecord 窄）。
export interface ApprovalStatsRecord {
  org_id: string;
  status: string;
  requested_at?: string;
  decided_at?: string;
}

/// 一条 LLM 调用事件（供成本估算）。
export interface ModelCallRecord {
  org_id: string;
  model_tier?: string;
  tokens?: number;
  cache_hit?: boolean;
}

export interface OverviewStats {
  success_rate_today: number;
  success_rate_7d: number;
  success_rate_30d: number;
  avg_duration_ms: number;
  pending_approvals: number;
  needs_human_count: number;
  status_distribution: Record<string, number>;
  total_tasks: number;
}

export interface TrendItem {
  date: string;
  success: number;
  failed: number;
  total: number;
}

export interface BLComparisonItem {
  business_line_id: string;
  total_tasks: number;
  completed: number;
  success_rate: number;
}

export interface ApprovalTimeItem {
  hour: number;
  avg_minutes: number;
  count: number;
}

export interface CostBreakdownItem {
  model_tier: string;
  total_calls: number;
  cached_calls: number;
  cache_hit_rate: number;
  total_tokens: number;
  estimated_cost_usd: number;
  estimated_saved_usd: number;
}

export interface CostEstimation {
  total_cost_usd: number;
  total_saved_usd: number;
  breakdown: CostBreakdownItem[];
}
