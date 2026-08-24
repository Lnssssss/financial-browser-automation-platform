import { describe, it, expect } from 'vitest';
import {
  computeOverview,
  computeTrend,
  computeErrorDistribution,
  computeBusinessLineComparison,
  computeApprovalResponseTime,
  computeCostEstimation,
} from './dashboard-stats';
import { buildCacheKey, DashboardCacheService, RedisLikeClient } from './dashboard-cache.service';
import { DashboardDataSourceService } from './dashboard-datasource.service';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { TaskRecord, ApprovalStatsRecord, ModelCallRecord } from './dashboard.types';

// dashboard 模块行为测试，翻译自 tests/unit/test_dashboard.py。
// 覆盖：六个统计纯函数、缓存 key 隔离、缓存读写、编排层 cache-aside、控制器 org 隔离 + CSV 导出。
// 直接 new（项目约定，无 supertest）。

function makeTask(over: Partial<TaskRecord> = {}): TaskRecord {
  return {
    org_id: 'org_1',
    status: 'completed',
    created_at: new Date().toISOString().slice(0, 19),
    duration_ms: 1500,
    business_line_id: 'bl_1',
    ...over,
  };
}

function makeApproval(over: Partial<ApprovalStatsRecord> = {}): ApprovalStatsRecord {
  return {
    org_id: 'org_1',
    status: 'approved',
    requested_at: '2026-03-07T10:00:00',
    decided_at: '2026-03-07T10:15:00',
    ...over,
  };
}

// ============================================================
// 统计计算
// ============================================================

describe('computeOverview', () => {
  it('empty data', () => {
    const r = computeOverview([], [], 'org_1');
    expect(r.total_tasks).toBe(0);
    expect(r.success_rate_today).toBe(0.0);
    expect(r.pending_approvals).toBe(0);
  });

  it('success rate today', () => {
    const now = new Date('2026-03-07T12:00:00Z');
    const tasks = [
      makeTask({ status: 'completed', created_at: '2026-03-07T10:00:00' }),
      makeTask({ status: 'completed', created_at: '2026-03-07T11:00:00' }),
      makeTask({ status: 'failed', created_at: '2026-03-07T09:00:00' }),
    ];
    const r = computeOverview(tasks, [], 'org_1', now);
    expect(r.success_rate_today).toBe(66.7);
    expect(r.total_tasks).toBe(3);
  });

  it('avg duration', () => {
    const tasks = [
      makeTask({ duration_ms: 1000 }),
      makeTask({ duration_ms: 2000 }),
      makeTask({ duration_ms: 3000 }),
    ];
    expect(computeOverview(tasks, [], 'org_1').avg_duration_ms).toBe(2000);
  });

  it('pending approvals', () => {
    const approvals = [
      makeApproval({ status: 'pending' }),
      makeApproval({ status: 'pending' }),
      makeApproval({ status: 'approved' }),
    ];
    expect(computeOverview([], approvals, 'org_1').pending_approvals).toBe(2);
  });

  it('org isolation', () => {
    const tasks = [makeTask({ org_id: 'org_1' }), makeTask({ org_id: 'org_2' })];
    expect(computeOverview(tasks, [], 'org_1').total_tasks).toBe(1);
  });

  it('needs_human counted from status distribution', () => {
    const tasks = [makeTask({ status: 'needs_human' }), makeTask({ status: 'needs_human' })];
    const r = computeOverview(tasks, [], 'org_1');
    expect(r.needs_human_count).toBe(2);
    expect(r.status_distribution['needs_human']).toBe(2);
  });
});

describe('computeTrend', () => {
  it('seven days, ordered oldest→newest', () => {
    const now = new Date('2026-03-07T00:00:00Z');
    const r = computeTrend([], 'org_1', 7, now);
    expect(r.length).toBe(7);
    expect(r[0].date).toBe('2026-03-01');
    expect(r[r.length - 1].date).toBe('2026-03-07');
  });

  it('counts per day', () => {
    const now = new Date('2026-03-07T12:00:00Z');
    const tasks = [
      makeTask({ status: 'completed', created_at: '2026-03-07T10:00:00' }),
      makeTask({ status: 'failed', created_at: '2026-03-07T11:00:00' }),
      makeTask({ status: 'completed', created_at: '2026-03-06T10:00:00' }),
    ];
    const r = computeTrend(tasks, 'org_1', 7, now);
    expect(r[r.length - 1].success).toBe(1);
    expect(r[r.length - 1].failed).toBe(1);
    expect(r[r.length - 2].success).toBe(1);
  });
});

describe('computeErrorDistribution', () => {
  it('aggregates failed only', () => {
    const tasks = [
      makeTask({ status: 'failed', error_type: 'LLM_FAILURE' }),
      makeTask({ status: 'failed', error_type: 'LLM_FAILURE' }),
      makeTask({ status: 'failed', error_type: 'TIMEOUT' }),
      makeTask({ status: 'completed' }),
    ];
    const r = computeErrorDistribution(tasks, 'org_1');
    expect(r['LLM_FAILURE']).toBe(2);
    expect(r['TIMEOUT']).toBe(1);
  });
});

describe('computeBusinessLineComparison', () => {
  it('per business line rate', () => {
    const tasks = [
      makeTask({ business_line_id: 'bl_a', status: 'completed' }),
      makeTask({ business_line_id: 'bl_a', status: 'failed' }),
      makeTask({ business_line_id: 'bl_b', status: 'completed' }),
      makeTask({ business_line_id: 'bl_b', status: 'completed' }),
    ];
    const r = computeBusinessLineComparison(tasks, 'org_1');
    expect(r.length).toBe(2);
    expect(r.find((x) => x.business_line_id === 'bl_a')!.success_rate).toBe(50.0);
    expect(r.find((x) => x.business_line_id === 'bl_b')!.success_rate).toBe(100.0);
  });
});

describe('computeApprovalResponseTime', () => {
  it('hourly distribution', () => {
    const approvals = [
      makeApproval({ requested_at: '2026-03-07T10:00:00', decided_at: '2026-03-07T10:15:00' }),
      makeApproval({ requested_at: '2026-03-07T10:30:00', decided_at: '2026-03-07T10:45:00' }),
    ];
    const r = computeApprovalResponseTime(approvals, 'org_1');
    expect(r.length).toBe(24);
    expect(r[10].count).toBe(2);
    expect(r[10].avg_minutes).toBe(15.0);
  });

  it('skips records without decided_at', () => {
    const approvals = [
      makeApproval({ decided_at: undefined }),
      makeApproval({ requested_at: '2026-03-07T09:00:00', decided_at: '2026-03-07T09:10:00' }),
    ];
    const r = computeApprovalResponseTime(approvals, 'org_1');
    expect(r[9].count).toBe(1);
    expect(r[9].avg_minutes).toBe(10.0);
  });
});

describe('computeCostEstimation', () => {
  it('cost breakdown by tier', () => {
    const calls: ModelCallRecord[] = [
      { org_id: 'org_1', model_tier: 'light', tokens: 500, cache_hit: false },
      { org_id: 'org_1', model_tier: 'light', tokens: 500, cache_hit: true },
      { org_id: 'org_1', model_tier: 'heavy', tokens: 2000, cache_hit: false },
    ];
    const r = computeCostEstimation(calls, 'org_1');
    expect(r.total_cost_usd).toBeGreaterThan(0);
    expect(r.breakdown.length).toBe(2); // light + heavy
    const light = r.breakdown.find((b) => b.model_tier === 'light')!;
    expect(light.cache_hit_rate).toBe(50.0);
  });
});

// ============================================================
// 缓存 key + 读写
// ============================================================

describe('buildCacheKey', () => {
  it('format without params', () => {
    expect(buildCacheKey('org_1', 'overview')).toBe('dashboard:org_1:overview');
  });

  it('with params appends hash', () => {
    const k = buildCacheKey('org_1', 'trend', { days: 7 });
    expect(k.startsWith('dashboard:org_1:trend:')).toBe(true);
    expect(k.length).toBeGreaterThan('dashboard:org_1:trend:'.length);
  });

  it('different orgs → different keys', () => {
    expect(buildCacheKey('org_1', 'overview')).not.toBe(buildCacheKey('org_2', 'overview'));
  });

  it('same params → same key', () => {
    expect(buildCacheKey('org_1', 'trend', { days: 7 })).toBe(
      buildCacheKey('org_1', 'trend', { days: 7 }),
    );
  });

  it('different params → different key', () => {
    expect(buildCacheKey('org_1', 'trend', { days: 7 })).not.toBe(
      buildCacheKey('org_1', 'trend', { days: 30 }),
    );
  });
});

describe('DashboardCacheService', () => {
  it('null client → disabled, getCached returns null', async () => {
    const c = new DashboardCacheService(null);
    expect(c.enabled).toBe(false);
    expect(await c.getCached('org_1', 'overview')).toBeNull();
  });

  it('set then get round-trips through client', async () => {
    const store = new Map<string, string>();
    const client: RedisLikeClient = {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
    };
    const c = new DashboardCacheService(client);
    await c.setCached('org_1', 'overview', { total_tasks: 42 });
    const hit = await c.getCached<{ total_tasks: number }>('org_1', 'overview');
    expect(hit!.total_tasks).toBe(42);
  });

  it('client read error degrades to null (no throw)', async () => {
    const client: RedisLikeClient = {
      get: async () => {
        throw new Error('redis down');
      },
      set: async () => {},
    };
    const c = new DashboardCacheService(client);
    expect(await c.getCached('org_1', 'overview')).toBeNull();
  });
});

// ============================================================
// 编排层 cache-aside
// ============================================================

describe('DashboardService cache-aside', () => {
  function makeService(client: RedisLikeClient | null) {
    const source = new DashboardDataSourceService();
    source.configure({
      tasks: [makeTask({ status: 'completed' }), makeTask({ status: 'failed' })],
      approvals: [makeApproval({ status: 'pending' })],
      modelCalls: [{ org_id: 'org_1', model_tier: 'light', tokens: 500, cache_hit: false }],
    });
    return new DashboardService(source, new DashboardCacheService(client));
  }

  it('computes overview when cache disabled', async () => {
    const svc = makeService(null);
    const r = await svc.getOverview('org_1');
    expect(r.total_tasks).toBe(2);
    expect(r.pending_approvals).toBe(1);
  });

  it('cache hit skips recomputation', async () => {
    const store = new Map<string, string>();
    let getCalls = 0;
    const client: RedisLikeClient = {
      get: async (k) => {
        getCalls++;
        return store.get(k) ?? null;
      },
      set: async (k, v) => void store.set(k, v),
    };
    const svc = makeService(client);
    const first = await svc.getOverview('org_1'); // miss → compute → set
    const second = await svc.getOverview('org_1'); // hit
    expect(second).toEqual(first);
    expect(getCalls).toBe(2);
    expect(store.size).toBe(1); // 只写了一次
  });

  it('trend days participates in cache key', async () => {
    const store = new Map<string, string>();
    const client: RedisLikeClient = {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
    };
    const svc = makeService(client);
    await svc.getTrend('org_1', 7);
    await svc.getTrend('org_1', 30);
    expect(store.size).toBe(2); // 不同 days 各占一 key
  });
});

// ============================================================
// 控制器
// ============================================================

describe('DashboardController', () => {
  function makeController() {
    const source = new DashboardDataSourceService();
    source.configure({
      tasks: [
        makeTask({ status: 'completed', duration_ms: 1000 }),
        makeTask({ status: 'completed', duration_ms: 2000 }),
        makeTask({ status: 'failed', error_type: 'LLM_FAILURE' }),
      ],
      approvals: [makeApproval({ status: 'pending' })],
      modelCalls: [{ org_id: 'org_1', model_tier: 'light', tokens: 500, cache_hit: false }],
    });
    const svc = new DashboardService(source, new DashboardCacheService(null));
    return { ctl: new DashboardController(svc), source };
  }

  const req = { user: { orgId: 'org_1' } } as never;

  it('overview', async () => {
    const { ctl } = makeController();
    const r = await ctl.getOverview(req);
    expect(r.total_tasks).toBe(3);
    expect(r.pending_approvals).toBe(1);
  });

  it('trend clamps days into [1,90]', async () => {
    const { ctl } = makeController();
    expect((await ctl.getTrend(req, '7')).length).toBe(7);
    expect((await ctl.getTrend(req, '999')).length).toBe(90);
    expect((await ctl.getTrend(req, '0')).length).toBe(1);
    expect((await ctl.getTrend(req, 'abc')).length).toBe(7); // NaN → 默认 7
  });

  it('errors', async () => {
    const { ctl } = makeController();
    expect((await ctl.getErrors(req))['LLM_FAILURE']).toBe(1);
  });

  it('business-lines', async () => {
    const { ctl } = makeController();
    expect((await ctl.getBusinessLines(req)).length).toBeGreaterThanOrEqual(1);
  });

  it('approval-time returns 24 buckets', async () => {
    const { ctl } = makeController();
    expect((await ctl.getApprovalTime(req)).length).toBe(24);
  });

  it('cost', async () => {
    const { ctl } = makeController();
    const r = await ctl.getCost(req);
    expect(r).toHaveProperty('total_cost_usd');
    expect(r).toHaveProperty('breakdown');
  });

  it('org isolation: org_2 tasks excluded from org_1 overview', async () => {
    const { ctl, source } = makeController();
    source.configure({
      tasks: [
        makeTask({ status: 'completed' }),
        makeTask({ status: 'completed' }),
        makeTask({ status: 'failed' }),
        makeTask({ org_id: 'org_2', status: 'completed' }),
      ],
    });
    const r = await ctl.getOverview(req);
    expect(r.total_tasks).toBe(3); // 仅 org_1
  });

  it('export CSV sets headers and contains sections', async () => {
    const { ctl } = makeController();
    const headers: Record<string, string> = {};
    const res = { set: (h: Record<string, string>) => Object.assign(headers, h) } as never;
    const csv = await ctl.exportCsv(req, res);
    expect(headers['Content-Type']).toContain('text/csv');
    expect(headers['Content-Disposition']).toContain('attachment');
    expect(csv).toContain('Overview');
    expect(csv).toContain('Success Rate');
    expect(csv).toContain('Daily Trend');
  });
});
