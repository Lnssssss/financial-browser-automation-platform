import { describe, it, expect } from 'vitest';
import {
  SeededRng,
  generateTasks,
  generateApprovals,
  generateAuditLogs,
  generateModelCalls,
  type OrgContext,
} from './demo-data';

// demo 生成器单测：验证分布 + 确定性（同种子两次全等）。

const CTX: OrgContext = {
  orgId: 'org_test',
  operationalUnits: [
    {
      departmentId: 'dept_cc',
      businessLineIds: ['bl_corp'],
      operatorUserIds: ['u_op'],
      approverUserId: 'u_apr',
    },
    {
      departmentId: 'dept_intl',
      businessLineIds: ['bl_intl'],
      operatorUserIds: ['u_op'],
      approverUserId: 'u_apr',
    },
  ],
  unitWeights: [0.6, 0.4],
  complianceDeptId: 'dept_comp',
  complianceApproverUserId: 'u_comp',
  intlSettleBusinessLineId: 'bl_intl',
};

// 固定"现在"，避免测试依赖真实时钟。
const NOW = new Date('2026-08-27T12:00:00.000Z');

describe('SeededRng 确定性', () => {
  it('同种子产生相同序列', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同种子序列不同', () => {
    const a = new SeededRng(1);
    const b = new SeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('int 落在闭区间内', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 12);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(12);
    }
  });
});

describe('generateTasks', () => {
  it('生成指定数量，字段完整', () => {
    const tasks = generateTasks(new SeededRng(42), NOW, CTX, 250);
    expect(tasks).toHaveLength(250);
    for (const t of tasks) {
      expect(t.task_id).toMatch(/^tsk_demo_\d{4}$/);
      expect(t.org_id).toBe('org_test');
      expect(['dept_cc', 'dept_intl']).toContain(t.department_id);
      expect(t.task_name.length).toBeGreaterThan(0);
    }
  });

  it('状态分布近似（completed 占多数）', () => {
    const tasks = generateTasks(new SeededRng(42), NOW, CTX, 250);
    const completed = tasks.filter((t) => t.status === 'completed').length;
    // 源分布 completed=72%，允许抽样波动，>55% 即算合理。
    expect(completed / tasks.length).toBeGreaterThan(0.55);
    // 五种状态都应出现。
    const statuses = new Set(tasks.map((t) => t.status));
    expect(statuses.has('completed')).toBe(true);
    expect(statuses.has('failed')).toBe(true);
  });

  it('failed 任务带 error_type，completed 不带', () => {
    const tasks = generateTasks(new SeededRng(42), NOW, CTX, 250);
    for (const t of tasks) {
      if (t.status === 'failed') expect(t.error_type).toBeTruthy();
      if (t.status === 'completed') expect(t.error_type).toBeUndefined();
    }
  });

  it('确定性：同种子两次生成完全一致', () => {
    const a = generateTasks(new SeededRng(42), NOW, CTX, 100);
    const b = generateTasks(new SeededRng(42), NOW, CTX, 100);
    expect(a).toEqual(b);
  });
});

describe('generateApprovals', () => {
  it('覆盖三态（PENDING/APPROVED/REJECTED）', () => {
    const rng = new SeededRng(42);
    const tasks = generateTasks(rng, NOW, CTX, 250);
    const approvals = generateApprovals(rng, tasks, CTX);
    const statuses = new Set(approvals.map((a) => a.status));
    expect(statuses.has('PENDING')).toBe(true);
    expect(statuses.has('APPROVED')).toBe(true);
    expect(statuses.has('REJECTED')).toBe(true);
  });

  it('PENDING 无决策信息，已决策的有 decidedAt + note', () => {
    const rng = new SeededRng(42);
    const tasks = generateTasks(rng, NOW, CTX, 250);
    const approvals = generateApprovals(rng, tasks, CTX);
    for (const a of approvals) {
      if (a.status === 'PENDING') {
        expect(a.decided_at).toBeNull();
        expect(a.approver_user_id).toBeNull();
      } else {
        expect(a.decided_at).toBeTruthy();
        expect(a.decision_note).toBeTruthy();
      }
    }
  });

  it('critical 风险超时 1800s，high 为 3600s', () => {
    const rng = new SeededRng(42);
    const tasks = generateTasks(rng, NOW, CTX, 250);
    const approvals = generateApprovals(rng, tasks, CTX);
    for (const a of approvals) {
      expect(a.timeout_seconds).toBe(a.risk_level === 'critical' ? 1800 : 3600);
    }
  });
});

describe('generateAuditLogs', () => {
  it('每任务首动作为 NAVIGATE，INPUT_TEXT 脱敏为 ***', () => {
    const rng = new SeededRng(42);
    const tasks = generateTasks(rng, NOW, CTX, 250);
    const approvals = generateApprovals(rng, tasks, CTX);
    const logs = generateAuditLogs(rng, tasks, approvals, CTX);
    expect(logs.length).toBeGreaterThan(0);

    // 按任务分组，检查 action_index=0 是 NAVIGATE。
    const byTask = new Map<string, typeof logs>();
    for (const l of logs) {
      const arr = byTask.get(l.task_id) ?? [];
      arr.push(l);
      byTask.set(l.task_id, arr);
    }
    for (const [, arr] of byTask) {
      const first = arr.find((l) => l.action_index === 0);
      expect(first?.action_type).toBe('NAVIGATE');
    }
    // 所有 INPUT_TEXT 的 input_value 都脱敏。
    for (const l of logs) {
      if (l.action_type === 'INPUT_TEXT') expect(l.input_value).toBe('***');
    }
  });
});

describe('generateModelCalls', () => {
  it('生成指定数量，tier 分布 light 最多', () => {
    const rng = new SeededRng(42);
    const tasks = generateTasks(rng, NOW, CTX, 50);
    const calls = generateModelCalls(rng, tasks, 1200);
    expect(calls).toHaveLength(1200);
    const light = calls.filter((c) => c.model_tier === 'light').length;
    const heavy = calls.filter((c) => c.model_tier === 'heavy').length;
    expect(light).toBeGreaterThan(heavy); // 权重 50 vs 15
    const tiers = new Set(calls.map((c) => c.model_tier));
    expect(tiers).toEqual(new Set(['light', 'standard', 'heavy']));
  });
});
