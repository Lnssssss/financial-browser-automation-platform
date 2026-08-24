// Dashboard 统计计算。六个纯函数，输入事件数组 + orgId，输出结构化指标。
// 无 DI、无 IO：全部按 org 过滤后聚合，可独立测。
// 时间一律走 UTC（toISOString），与上报的 ISO 字符串同基准，避免服务器时区漂移。

import {
  TaskRecord,
  ApprovalStatsRecord,
  ModelCallRecord,
  OverviewStats,
  TrendItem,
  BLComparisonItem,
  ApprovalTimeItem,
  CostEstimation,
  CostBreakdownItem,
} from './dashboard.types';

// ── 时间辅助（UTC） ──────────────────────────────────────
const DAY_MS = 86_400_000;
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}
/// "YYYY-MM-DDTHH:MM:SS"（无毫秒无时区），对齐 Python datetime.isoformat()。
function isoSeconds(d: Date): string {
  return d.toISOString().slice(0, 19);
}
/// "YYYY-MM-DD"。
function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/// 保留 1 位小数（百分比/分钟用）。
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
/// 保留 4 位小数（金额用）。
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
/// 解析 ISO 字符串为 UTC。无时区后缀的串（如 "2026-03-07T10:00:00"）JS 默认按本地时区解析，
/// 会让 getUTCHours() 偏移；补 "Z" 强制 UTC，对齐 Python fromisoformat 的 naive-literal 语义。
function parseUtc(iso: string): Date {
  const hasTz = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : `${iso}Z`);
}

// ── 概览 ─────────────────────────────────────────────────
export function computeOverview(
  tasks: TaskRecord[],
  approvals: ApprovalStatsRecord[],
  orgId: string,
  now: Date = new Date(),
): OverviewStats {
  const orgTasks = tasks.filter((t) => t.org_id === orgId);

  const successRate = (list: TaskRecord[]): number => {
    if (list.length === 0) return 0.0;
    const completed = list.filter((t) => t.status === 'completed').length;
    return round1((completed / list.length) * 100);
  };

  const tasksInRange = (days: number): TaskRecord[] => {
    const cutoff = isoSeconds(addDays(now, -days));
    return orgTasks.filter((t) => (t.created_at ?? '') >= cutoff);
  };

  const durations = orgTasks.filter((t) => t.duration_ms).map((t) => t.duration_ms as number);
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  const statusCounts: Record<string, number> = {};
  for (const t of orgTasks) {
    const s = t.status ?? 'unknown';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  const orgApprovals = approvals.filter((a) => a.org_id === orgId);
  const pendingApprovals = orgApprovals.filter((a) => a.status === 'pending').length;

  return {
    success_rate_today: successRate(tasksInRange(1)),
    success_rate_7d: successRate(tasksInRange(7)),
    success_rate_30d: successRate(tasksInRange(30)),
    avg_duration_ms: avgDuration,
    pending_approvals: pendingApprovals,
    needs_human_count: statusCounts['needs_human'] ?? 0,
    status_distribution: statusCounts,
    total_tasks: orgTasks.length,
  };
}

// ── 每日趋势 ─────────────────────────────────────────────
export function computeTrend(
  tasks: TaskRecord[],
  orgId: string,
  days = 7,
  now: Date = new Date(),
): TrendItem[] {
  const orgTasks = tasks.filter((t) => t.org_id === orgId);
  const result: TrendItem[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const ds = dayStr(addDays(now, -offset));
    const dayTasks = orgTasks.filter((t) => (t.created_at ?? '').slice(0, 10) === ds);
    result.push({
      date: ds,
      success: dayTasks.filter((t) => t.status === 'completed').length,
      failed: dayTasks.filter((t) => t.status === 'failed').length,
      total: dayTasks.length,
    });
  }
  return result;
}

// ── 错误类型分布 ─────────────────────────────────────────
export function computeErrorDistribution(
  tasks: TaskRecord[],
  orgId: string,
): Record<string, number> {
  const failed = tasks.filter((t) => t.org_id === orgId && t.status === 'failed');
  const counts: Record<string, number> = {};
  for (const t of failed) {
    const key = t.error_type ?? 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// ── 业务线对比 ───────────────────────────────────────────
export function computeBusinessLineComparison(
  tasks: TaskRecord[],
  orgId: string,
): BLComparisonItem[] {
  const orgTasks = tasks.filter((t) => t.org_id === orgId);
  const groups = new Map<string, TaskRecord[]>();
  for (const t of orgTasks) {
    const bl = t.business_line_id ?? 'unassigned';
    (groups.get(bl) ?? groups.set(bl, []).get(bl)!).push(t);
  }
  return [...groups.keys()]
    .sort()
    .map((blId) => {
      const list = groups.get(blId)!;
      const total = list.length;
      const completed = list.filter((t) => t.status === 'completed').length;
      return {
        business_line_id: blId,
        total_tasks: total,
        completed,
        success_rate: total > 0 ? round1((completed / total) * 100) : 0.0,
      };
    });
}

// ── 审批响应耗时（按小时分布） ───────────────────────────
export function computeApprovalResponseTime(
  approvals: ApprovalStatsRecord[],
  orgId: string,
): ApprovalTimeItem[] {
  const orgApprovals = approvals.filter((a) => a.org_id === orgId && a.decided_at);
  const hourly = new Map<number, number[]>();
  for (const a of orgApprovals) {
    const requestedAt = a.requested_at;
    const decidedAt = a.decided_at;
    if (!requestedAt || !decidedAt) continue;
    const requested = parseUtc(requestedAt);
    const decided = parseUtc(decidedAt);
    if (isNaN(requested.getTime()) || isNaN(decided.getTime())) continue;
    const durationMin = (decided.getTime() - requested.getTime()) / 1000 / 60;
    const hour = requested.getUTCHours();
    (hourly.get(hour) ?? hourly.set(hour, []).get(hour)!).push(durationMin);
  }
  const result: ApprovalTimeItem[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const times = hourly.get(hour) ?? [];
    result.push({
      hour,
      avg_minutes: times.length ? round1(times.reduce((a, b) => a + b, 0) / times.length) : 0,
      count: times.length,
    });
  }
  return result;
}

// ── LLM 成本估算 ─────────────────────────────────────────
const PRICE_PER_1K: Record<string, number> = { light: 0.001, standard: 0.01, heavy: 0.05 };

export function computeCostEstimation(
  modelCalls: ModelCallRecord[],
  orgId: string,
): CostEstimation {
  const orgCalls = modelCalls.filter((c) => c.org_id === orgId);
  const tierStats = new Map<string, { calls: number; cached: number; tokens: number }>();
  for (const call of orgCalls) {
    const tier = call.model_tier ?? 'standard';
    const s = tierStats.get(tier) ?? { calls: 0, cached: 0, tokens: 0 };
    s.calls += 1;
    s.tokens += call.tokens ?? 0;
    if (call.cache_hit) s.cached += 1;
    tierStats.set(tier, s);
  }

  let totalCost = 0;
  let savedCost = 0;
  const breakdown: CostBreakdownItem[] = [];
  for (const tier of [...tierStats.keys()].sort()) {
    const s = tierStats.get(tier)!;
    const price = PRICE_PER_1K[tier] ?? 0.01;
    const cost = (s.tokens / 1000) * price;
    const cacheRate = s.calls ? round1((s.cached / s.calls) * 100) : 0;
    const saved = ((s.cached * (s.tokens / Math.max(s.calls, 1))) / 1000) * price;
    totalCost += cost;
    savedCost += saved;
    breakdown.push({
      model_tier: tier,
      total_calls: s.calls,
      cached_calls: s.cached,
      cache_hit_rate: cacheRate,
      total_tokens: s.tokens,
      estimated_cost_usd: round4(cost),
      estimated_saved_usd: round4(saved),
    });
  }

  return {
    total_cost_usd: round4(totalCost),
    total_saved_usd: round4(savedCost),
    breakdown,
  };
}
