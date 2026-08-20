import { describe, it, expect, vi } from 'vitest';
import { ApprovalStatus } from '@prisma/client';
import {
  ApprovalService,
  ApprovalConflictError,
  ApprovalNotFoundError,
  DEFAULT_TIMEOUTS,
} from './approval.service';
import { ApprovalRoute } from './approval-routing.service';

// ApprovalService 单测：用 mock PrismaService + spy 注入点，不起真实 DB。
// 验证：建记录落库 + 超时调度触发；决策写状态 + 恢复触发；冲突/未找到抛领域异常；超时幂等。

/// 造一个最小 mock prisma，approvalRecord 的方法可被 override / spy。
function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    approvalRecord: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'apr_1', ...data })),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        ...data,
      })),
      findMany: vi.fn(async () => []),
      ...overrides,
    },
  };
}

const HIGH_ROUTE: ApprovalRoute = {
  requires_approval: true,
  approver_department_id: 'dept_a',
  approver_role: 'approver',
  notify_department_ids: [],
  notify_roles: [],
  description: 'high',
};

function baseInput() {
  return {
    taskId: 'task_1',
    orgId: 'org_1',
    departmentId: 'dept_a',
    riskLevel: 'high',
    riskReason: 'keyword: 转账',
    route: HIGH_ROUTE,
  };
}

describe('ApprovalService.createApproval', () => {
  it('persists record as PENDING with risk-based timeout', async () => {
    const prisma = mockPrisma();
    const svc = new ApprovalService(prisma as never);
    const rec = await svc.createApproval(baseInput());
    expect(prisma.approvalRecord.create).toHaveBeenCalledOnce();
    const arg = prisma.approvalRecord.create.mock.calls[0][0].data;
    expect(arg.status).toBe(ApprovalStatus.PENDING);
    expect(arg.timeoutSeconds).toBe(DEFAULT_TIMEOUTS.high); // 3600
    expect(rec.id).toBe('apr_1');
  });

  it('critical gets shorter timeout', async () => {
    const prisma = mockPrisma();
    const svc = new ApprovalService(prisma as never);
    await svc.createApproval({ ...baseInput(), riskLevel: 'critical' });
    const arg = prisma.approvalRecord.create.mock.calls[0][0].data;
    expect(arg.timeoutSeconds).toBe(DEFAULT_TIMEOUTS.critical); // 1800 < 3600
  });

  it('timeoutOverride wins', async () => {
    const prisma = mockPrisma();
    const svc = new ApprovalService(prisma as never);
    await svc.createApproval({ ...baseInput(), timeoutOverride: 60 });
    expect(prisma.approvalRecord.create.mock.calls[0][0].data.timeoutSeconds).toBe(60);
  });

  it('falls back approver dept to source dept when route has none', async () => {
    const prisma = mockPrisma();
    const svc = new ApprovalService(prisma as never);
    await svc.createApproval({
      ...baseInput(),
      route: { ...HIGH_ROUTE, approver_department_id: null },
    });
    expect(prisma.approvalRecord.create.mock.calls[0][0].data.approverDepartmentId).toBe('dept_a');
  });

  it('calls timeout scheduler injection point', async () => {
    const prisma = mockPrisma();
    const scheduler = { schedule: vi.fn(async () => {}) };
    const svc = new ApprovalService(prisma as never, scheduler);
    await svc.createApproval(baseInput());
    expect(scheduler.schedule).toHaveBeenCalledWith('apr_1', 3600);
  });

  it('works without scheduler (unwired injection point)', async () => {
    const prisma = mockPrisma();
    const svc = new ApprovalService(prisma as never);
    await expect(svc.createApproval(baseInput())).resolves.toBeDefined();
  });
});

describe('ApprovalService.decide', () => {
  it('approves a pending record and triggers resume', async () => {
    const prisma = mockPrisma({
      findUnique: vi.fn(async () => ({ id: 'apr_1', status: ApprovalStatus.PENDING })),
    });
    const resume = { resume: vi.fn(async () => {}) };
    const svc = new ApprovalService(prisma as never, null, resume);
    const updated = await svc.decide('apr_1', 'approved', 'user_1', 'ok');
    expect(prisma.approvalRecord.update).toHaveBeenCalledOnce();
    expect(updated.status).toBe(ApprovalStatus.APPROVED);
    expect(resume.resume).toHaveBeenCalledWith('apr_1', 'approved');
  });

  it('reject maps to REJECTED', async () => {
    const prisma = mockPrisma({
      findUnique: vi.fn(async () => ({ id: 'apr_1', status: ApprovalStatus.PENDING })),
    });
    const svc = new ApprovalService(prisma as never);
    const updated = await svc.decide('apr_1', 'rejected', 'user_1');
    expect(updated.status).toBe(ApprovalStatus.REJECTED);
  });

  it('throws NotFound for missing record', async () => {
    const prisma = mockPrisma({ findUnique: vi.fn(async () => null) });
    const svc = new ApprovalService(prisma as never);
    await expect(svc.decide('nope', 'approved', 'user_1')).rejects.toBeInstanceOf(ApprovalNotFoundError);
  });

  it('throws Conflict for already-decided record', async () => {
    const prisma = mockPrisma({
      findUnique: vi.fn(async () => ({ id: 'apr_1', status: ApprovalStatus.APPROVED })),
    });
    const svc = new ApprovalService(prisma as never);
    await expect(svc.decide('apr_1', 'approved', 'user_1')).rejects.toBeInstanceOf(ApprovalConflictError);
  });
});

describe('ApprovalService.markTimeout', () => {
  it('times out a pending record', async () => {
    const prisma = mockPrisma({
      findUnique: vi.fn(async () => ({ id: 'apr_1', status: ApprovalStatus.PENDING })),
    });
    const svc = new ApprovalService(prisma as never);
    const updated = await svc.markTimeout('apr_1');
    expect(updated?.status).toBe(ApprovalStatus.TIMEOUT);
  });

  it('is idempotent: does not touch already-decided record', async () => {
    const prisma = mockPrisma({
      findUnique: vi.fn(async () => ({ id: 'apr_1', status: ApprovalStatus.APPROVED })),
    });
    const svc = new ApprovalService(prisma as never);
    const updated = await svc.markTimeout('apr_1');
    expect(updated).toBeNull();
    expect(prisma.approvalRecord.update).not.toHaveBeenCalled();
  });
});

describe('ApprovalService.listPendingByOrg', () => {
  it('queries by org + PENDING status', async () => {
    const prisma = mockPrisma({
      findMany: vi.fn(async () => [{ id: 'apr_1' }]),
    });
    const svc = new ApprovalService(prisma as never);
    const list = await svc.listPendingByOrg('org_1');
    const calls = prisma.approvalRecord.findMany.mock.calls as unknown as Array<[{ where: unknown }]>;
    expect(calls[0][0].where).toEqual({
      organizationId: 'org_1',
      status: ApprovalStatus.PENDING,
    });
    expect(list.length).toBe(1);
  });
});
