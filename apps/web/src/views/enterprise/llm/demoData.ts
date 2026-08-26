// LLM Monitor 页演示数据（源端 demoCost/demoCacheStats/demoStuckTasks 等价迁移）。
import type { CostData, CacheStats } from '@/api/enterprise';

export type { CostData, CacheStats, CostBreakdown } from '@/api/enterprise';

export interface StuckTask {
  task_id: string;
  department_name: string;
  stuck_action_type: string;
  stuck_since: string;
  llm_errors: string[];
  page_url: string;
}

export function demoCost(): CostData {
  return {
    total_cost_usd: 42.86,
    total_saved_usd: 18.72,
    breakdown: [
      {
        model_tier: 'LIGHT',
        total_calls: 856,
        cached_calls: 312,
        cache_hit_rate: 36.4,
        total_tokens: 128400,
        estimated_cost_usd: 6.42,
        estimated_saved_usd: 2.34,
      },
      {
        model_tier: 'STANDARD',
        total_calls: 423,
        cached_calls: 89,
        cache_hit_rate: 21.0,
        total_tokens: 254600,
        estimated_cost_usd: 22.91,
        estimated_saved_usd: 8.01,
      },
      {
        model_tier: 'HEAVY',
        total_calls: 67,
        cached_calls: 12,
        cache_hit_rate: 17.9,
        total_tokens: 89200,
        estimated_cost_usd: 13.53,
        estimated_saved_usd: 8.37,
      },
    ],
  };
}

export function demoCacheStats(): CacheStats {
  return {
    total_entries: 413,
    hits: 413,
    misses: 933,
    hit_rate: 30.7,
    sets: 933,
  };
}

export function demoStuckTasks(): StuckTask[] {
  return [
    {
      task_id: 'tsk_demo_002',
      department_name: '对公信贷部',
      stuck_action_type: 'extract_data',
      stuck_since: '2026-03-08T09:23:00',
      llm_errors: [
        'JSONDecodeError: Expecting value at line 1',
        "ValidationError: 'account_number' field required",
        'JSONDecodeError: Extra data at line 5',
      ],
      page_url: 'https://bank.example.com/loan/detail/2024031',
    },
    {
      task_id: 'tsk_demo_005',
      department_name: '个人金融部',
      stuck_action_type: 'input_text',
      stuck_since: '2026-03-08T10:45:00',
      llm_errors: [
        "ValidationError: 'amount' must be positive number",
        'JSONDecodeError: Unterminated string',
        'ConnectionError: LLM API timeout after 30s',
      ],
      page_url: 'https://bank.example.com/retail/transfer',
    },
  ];
}

// ── 档位展示辅助 ──

export const tierLabels: Record<string, string> = {
  light: 'Haiku / 4o-mini',
  standard: 'Sonnet / GPT-4o',
  heavy: 'Opus / GPT-4',
  LIGHT: 'Haiku / 4o-mini',
  STANDARD: 'Sonnet / GPT-4o',
  HEAVY: 'Opus / GPT-4',
};

export const tierColors: Record<string, string> = {
  light: '#10B981',
  standard: '#3B82F6',
  heavy: '#8B5CF6',
  LIGHT: '#10B981',
  STANDARD: '#3B82F6',
  HEAVY: '#8B5CF6',
};
