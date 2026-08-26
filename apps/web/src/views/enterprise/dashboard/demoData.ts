// Dashboard 演示数据生成器：API 不可用时的兜底展示（对齐源码同款降级策略）。

export interface OverviewData {
  total_tasks: number;
  success_rate_today: number;
  success_rate_7d: number;
  avg_duration_ms: number;
  pending_approvals: number;
  needs_human_count: number;
  delta_tasks?: number;
  delta_success?: number;
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

export interface LLMCostRow {
  tier: string;
  calls: number;
  cache_hits: number;
  cost_usd: number;
}

export interface RecentTask {
  id: string;
  name: string;
  status: string;
  department: string;
  duration_s: number;
  time: string;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function demoOverview(): OverviewData {
  return {
    total_tasks: 3_842,
    success_rate_today: 96.3,
    success_rate_7d: 94.1,
    avg_duration_ms: 4_280,
    pending_approvals: 7,
    needs_human_count: 3,
    delta_tasks: 12.5,
    delta_success: 1.8,
  };
}

export function demoTrend(): TrendItem[] {
  const rng = seededRandom(42);
  const items: TrendItem[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const base = isWeekend ? 60 : 120;
    const success = Math.round(base + rng() * 40);
    const failed = Math.round(2 + rng() * (isWeekend ? 3 : 8));
    items.push({ date: d.toISOString().slice(0, 10), success, failed, total: success + failed });
  }
  return items;
}

export function demoErrors(): ErrorDistribution {
  return {
    LLM_FAILURE: 47,
    TIMEOUT: 31,
    PAGE_ERROR: 23,
    APPROVAL_REJECTED: 15,
    ELEMENT_NOT_FOUND: 12,
    SESSION_EXPIRED: 8,
  };
}

export function demoBL(): BLComparison[] {
  return [
    { business_line_id: 'Corporate Lending', total_tasks: 842, success_rate: 97.1 },
    { business_line_id: 'Retail Credit', total_tasks: 716, success_rate: 94.8 },
    { business_line_id: 'Wealth Management', total_tasks: 623, success_rate: 92.3 },
    { business_line_id: 'Intl Settlement', total_tasks: 534, success_rate: 98.2 },
    { business_line_id: 'Trade Finance', total_tasks: 487, success_rate: 95.6 },
    { business_line_id: 'Risk & Compliance', total_tasks: 640, success_rate: 99.1 },
  ];
}

export function demoApprovalHours(): ApprovalHour[] {
  const rng = seededRandom(99);
  return Array.from({ length: 24 }, (_, h) => {
    const isWork = h >= 9 && h <= 18;
    const isPeak = h >= 9 && h <= 11;
    return {
      hour: h,
      avg_minutes: isWork ? (isPeak ? Math.round(3 + rng() * 4) : Math.round(8 + rng() * 15)) : Math.round(25 + rng() * 30),
      count: isWork ? Math.round(5 + rng() * 12) : Math.round(rng() * 3),
    };
  });
}

export function demoLLMCost(): LLMCostRow[] {
  return [
    { tier: 'Light', calls: 12_480, cache_hits: 8_736, cost_usd: 18.72 },
    { tier: 'Standard', calls: 6_230, cache_hits: 3_115, cost_usd: 62.3 },
    { tier: 'Heavy', calls: 1_890, cache_hits: 567, cost_usd: 94.5 },
  ];
}

export function demoRecentTasks(): RecentTask[] {
  const now = new Date();
  const tasks: { name: string; status: string; dept: string; dur: number; minAgo: number }[] = [
    { name: 'Bank Statement Collection — ICBC', status: 'completed', dept: 'Corporate Lending', dur: 38, minAgo: 3 },
    { name: 'Loan Repayment Reminder — Batch #127', status: 'completed', dept: 'Retail Credit', dur: 125, minAgo: 8 },
    { name: 'Cross-border Wire — HK$2.4M', status: 'pending_approval', dept: 'Intl Settlement', dur: 0, minAgo: 12 },
    { name: 'Claim Status Query — Case #A20260308', status: 'running', dept: 'Risk & Compliance', dur: 15, minAgo: 15 },
    { name: 'Fund NAV Data Scrape — 6 Funds', status: 'completed', dept: 'Wealth Management', dur: 87, minAgo: 22 },
    { name: 'Policy Renewal Check — Batch #89', status: 'failed', dept: 'Retail Credit', dur: 42, minAgo: 35 },
    { name: 'Trade Finance LC Verification', status: 'needs_human', dept: 'Trade Finance', dur: 63, minAgo: 41 },
    { name: 'Daily Reconciliation — Branch #032', status: 'completed', dept: 'Corporate Lending', dur: 156, minAgo: 55 },
    { name: 'KYC Document Auto-fill — 15 clients', status: 'completed', dept: 'Risk & Compliance', dur: 210, minAgo: 68 },
    { name: 'Research Report Archive — Q1 2026', status: 'completed', dept: 'Wealth Management', dur: 94, minAgo: 82 },
  ];
  return tasks.map((t, i) => {
    const time = new Date(now);
    time.setMinutes(time.getMinutes() - t.minAgo);
    return {
      id: `task_demo_${i}`,
      name: t.name,
      status: t.status,
      department: t.dept,
      duration_s: t.dur,
      time: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`,
    };
  });
}
