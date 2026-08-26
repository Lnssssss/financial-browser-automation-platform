import { describe, it, expect, vi } from 'vitest';
import {
  TenantContext,
  runWithTenantContext,
  getTenantContext,
  requireTenantContext,
} from './tenant-context';
import { buildTenantWhere, NO_ACCESS_ORG_ID } from './tenant-query-filter';
import { isWhitelisted } from './tenant.middleware';
import { TenantService } from './tenant.service';

// ============================================================
// 上下文生命周期（对齐 test_tenant_context.py）
// ============================================================

describe('TenantContext lifecycle', () => {
  it('default is null outside any scope', () => {
    expect(getTenantContext()).toBeNull();
  });

  it('set (run scope) and get', () => {
    const ctx = new TenantContext({
      orgId: 'org_1',
      userId: 'u_1',
      visibleDepartmentIds: ['d1', 'd2'],
      visibleBusinessLineIds: ['bl1'],
    });
    runWithTenantContext(ctx, () => {
      expect(getTenantContext()).toBe(ctx);
      expect(getTenantContext()!.orgId).toBe('org_1');
      expect(getTenantContext()!.visibleDepartmentIds).toEqual(['d1', 'd2']);
    });
  });

  it('scope exit restores null', () => {
    const ctx = new TenantContext({ orgId: 'org_1', userId: 'u_1' });
    runWithTenantContext(ctx, () => {
      expect(getTenantContext()).toBe(ctx);
    });
    expect(getTenantContext()).toBeNull();
  });

  it('require raises when not set', () => {
    expect(() => requireTenantContext()).toThrow('Tenant context not available');
  });

  it('require returns context when set', () => {
    const ctx = new TenantContext({ orgId: 'org_1', userId: 'u_1' });
    runWithTenantContext(ctx, () => {
      expect(requireTenantContext()).toBe(ctx);
    });
  });

  it('is_restricted when no full visibility', () => {
    const ctx = new TenantContext({ orgId: 'org_1', userId: 'u_1', hasFullOrgVisibility: false });
    expect(ctx.isRestricted).toBe(true);
  });

  it('not restricted when full visibility', () => {
    const ctx = new TenantContext({ orgId: 'org_1', userId: 'u_1', hasFullOrgVisibility: true });
    expect(ctx.isRestricted).toBe(false);
  });

  it('frozen immutability', () => {
    const ctx = new TenantContext({ orgId: 'org_1', userId: 'u_1' });
    expect(() => {
      // @ts-expect-error 测试运行时不可变
      ctx.orgId = 'changed';
    }).toThrow();
  });

  it('nested set and restore', () => {
    const outer = new TenantContext({ orgId: 'org_outer', userId: 'u_outer' });
    const inner = new TenantContext({ orgId: 'org_inner', userId: 'u_inner' });
    runWithTenantContext(outer, () => {
      expect(getTenantContext()!.orgId).toBe('org_outer');
      runWithTenantContext(inner, () => {
        expect(getTenantContext()!.orgId).toBe('org_inner');
      });
      expect(getTenantContext()!.orgId).toBe('org_outer');
    });
    expect(getTenantContext()).toBeNull();
  });
});

// ============================================================
// 查询过滤 where 构造（对齐 test_tenant_query_filter.py）
// ============================================================

describe('buildTenantWhere', () => {
  it('no context → empty where (pass through)', () => {
    expect(buildTenantWhere(null)).toEqual({});
  });

  it('full visibility → org only', () => {
    const ctx = new TenantContext({ orgId: 'org_1', userId: 'u_admin', hasFullOrgVisibility: true });
    const where = buildTenantWhere(ctx);
    expect(where).toEqual({ organizationId: 'org_1' });
    // 不含 dept / bl 过滤
    expect(where.OR).toBeUndefined();
  });

  it('restricted → org AND (dept OR bl)', () => {
    const ctx = new TenantContext({
      orgId: 'org_1',
      userId: 'u_op',
      visibleDepartmentIds: ['dept_cc'],
      visibleBusinessLineIds: ['bl_corp_loan'],
      hasFullOrgVisibility: false,
    });
    const where = buildTenantWhere(ctx);
    expect(where.organizationId).toBe('org_1');
    expect(where.OR).toEqual([
      { departmentId: { in: ['dept_cc'] } },
      { businessLineId: { in: ['bl_corp_loan'] } },
    ]);
  });

  it('cross-bl includes both lines', () => {
    const ctx = new TenantContext({
      orgId: 'org_1',
      userId: 'u_cross',
      visibleDepartmentIds: ['dept_cc'],
      visibleBusinessLineIds: ['bl_corp_loan', 'bl_intl_settle'],
      hasFullOrgVisibility: false,
    });
    const where = buildTenantWhere(ctx);
    const blCond = where.OR!.find((c) => 'businessLineId' in c) as {
      businessLineId: { in: string[] };
    };
    expect(blCond.businessLineId.in).toEqual(['bl_corp_loan', 'bl_intl_settle']);
  });

  it('no dept no bl → no-access sentinel', () => {
    const ctx = new TenantContext({
      orgId: 'org_1',
      userId: 'u_empty',
      visibleDepartmentIds: [],
      visibleBusinessLineIds: [],
      hasFullOrgVisibility: false,
    });
    expect(buildTenantWhere(ctx)).toEqual({ organizationId: NO_ACCESS_ORG_ID });
  });

  it('dept only, no bl', () => {
    const ctx = new TenantContext({
      orgId: 'org_1',
      userId: 'u_dept_only',
      visibleDepartmentIds: ['dept_risk'],
      visibleBusinessLineIds: [],
      hasFullOrgVisibility: false,
    });
    const where = buildTenantWhere(ctx);
    expect(where.OR).toEqual([{ departmentId: { in: ['dept_risk'] } }]);
  });
});

// ============================================================
// 中间件白名单（对齐 test_tenant_middleware.py）
// ============================================================

describe('isWhitelisted', () => {
  it('login route whitelisted', () => {
    expect(isWhitelisted('/api/auth/login')).toBe(true);
  });
  it('health route whitelisted', () => {
    expect(isWhitelisted('/api/health')).toBe(true);
  });
  it('docs route whitelisted', () => {
    expect(isWhitelisted('/docs')).toBe(true);
  });
  it('openapi route whitelisted', () => {
    expect(isWhitelisted('/openapi.json')).toBe(true);
  });
  it('task route not whitelisted', () => {
    expect(isWhitelisted('/api/enterprise/tasks')).toBe(false);
  });
  it('random route not whitelisted', () => {
    expect(isWhitelisted('/api/run/tasks')).toBe(false);
  });
});

// ============================================================
// TenantContext 全可见判定（对齐 test_tenant_middleware 的 context building）
// ============================================================

/// 复刻中间件里的判定：hasFullOrgVisibility = 管理员 || 跨组织只读
function buildCtxLikeMiddleware(params: {
  orgId: string;
  userId: string;
  deptIds: string[];
  blIds: string[];
  isAdmin: boolean;
  crossRead: boolean;
}): TenantContext {
  return new TenantContext({
    orgId: params.orgId,
    userId: params.userId,
    visibleDepartmentIds: params.deptIds,
    visibleBusinessLineIds: params.blIds,
    hasFullOrgVisibility: params.isAdmin || params.crossRead,
  });
}

describe('middleware context building', () => {
  it('normal operator → restricted', () => {
    const ctx = buildCtxLikeMiddleware({
      orgId: 'org_1',
      userId: 'eu_test',
      deptIds: ['dept_cc'],
      blIds: ['bl_corp_loan'],
      isAdmin: false,
      crossRead: false,
    });
    expect(ctx.orgId).toBe('org_1');
    expect(ctx.visibleDepartmentIds).toEqual(['dept_cc']);
    expect(ctx.visibleBusinessLineIds).toEqual(['bl_corp_loan']);
    expect(ctx.hasFullOrgVisibility).toBe(false);
    expect(ctx.isRestricted).toBe(true);
  });

  it('admin → full visibility', () => {
    const ctx = buildCtxLikeMiddleware({
      orgId: 'org_1',
      userId: 'eu_admin',
      deptIds: ['dept_it'],
      blIds: [],
      isAdmin: true,
      crossRead: false,
    });
    expect(ctx.hasFullOrgVisibility).toBe(true);
    expect(ctx.isRestricted).toBe(false);
  });

  it('risk viewer with cross_org_read → full visibility', () => {
    const ctx = buildCtxLikeMiddleware({
      orgId: 'org_1',
      userId: 'eu_risk',
      deptIds: ['dept_risk'],
      blIds: [],
      isAdmin: false,
      crossRead: true,
    });
    expect(ctx.hasFullOrgVisibility).toBe(true);
  });

  it('cross-bl operator → multiple business lines, restricted', () => {
    const ctx = buildCtxLikeMiddleware({
      orgId: 'org_1',
      userId: 'eu_cross',
      deptIds: ['dept_cc'],
      blIds: ['bl_corp_loan', 'bl_intl_settle'],
      isAdmin: false,
      crossRead: false,
    });
    expect(ctx.visibleBusinessLineIds).toEqual(['bl_corp_loan', 'bl_intl_settle']);
    expect(ctx.isRestricted).toBe(true);
  });
});

// ============================================================
// TenantService（Prisma mock）
// ============================================================

describe('TenantService.listVisibleTasks', () => {
  it('passes tenant where to prisma and maps rows', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'ext_1',
        taskId: 'task_1',
        organizationId: 'org_1',
        departmentId: 'dept_cc',
        businessLineId: 'bl_corp_loan',
        riskLevel: 'high',
        createdBy: 'eu_1',
      },
    ]);
    const prisma = { taskExtension: { findMany } } as never;
    const svc = new TenantService(prisma);

    const ctx = new TenantContext({
      orgId: 'org_1',
      userId: 'u_op',
      visibleDepartmentIds: ['dept_cc'],
      visibleBusinessLineIds: ['bl_corp_loan'],
      hasFullOrgVisibility: false,
    });
    const result = await svc.listVisibleTasks(ctx);

    // where 由 buildTenantWhere 构造并传入
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        OR: [
          { departmentId: { in: ['dept_cc'] } },
          { businessLineId: { in: ['bl_corp_loan'] } },
        ],
      },
    });
    expect(result.total).toBe(1);
    expect(result.tasks[0].extensionId).toBe('ext_1');
    expect(result.tenantContext.orgId).toBe('org_1');
  });

  it('full visibility → org-only where', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { taskExtension: { findMany } } as never;
    const svc = new TenantService(prisma);
    const ctx = new TenantContext({ orgId: 'org_1', userId: 'u_admin', hasFullOrgVisibility: true });

    const result = await svc.listVisibleTasks(ctx);
    expect(findMany).toHaveBeenCalledWith({ where: { organizationId: 'org_1' } });
    expect(result.total).toBe(0);
  });
});

describe('TenantService.diagnoseVisibility', () => {
  it('throws NotFound for unknown user', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } } as never;
    const svc = new TenantService(prisma);
    await expect(svc.diagnoseVisibility('nope')).rejects.toThrow('User nope not found');
  });

  it('restricted user → summary lists own dept/bl only', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'u_op',
      displayName: 'Operator One',
      organizationId: 'org_1',
      isActive: true,
      departmentRoles: [
        { departmentId: 'dept_cc', role: 'OPERATOR', department: { name: 'Corp Credit' } },
      ],
      businessLines: [
        { businessLineId: 'bl_corp_loan', businessLine: { name: 'Corp Loan' } },
      ],
      specialPermissions: [],
    });
    const deptFindMany = vi.fn();
    const blFindMany = vi.fn();
    const prisma = {
      user: { findUnique },
      department: { findMany: deptFindMany },
      businessLine: { findMany: blFindMany },
    } as never;
    const svc = new TenantService(prisma);

    const res = await svc.diagnoseVisibility('u_op');
    expect(res.visibilitySummary.hasFullOrgVisibility).toBe(false);
    expect(res.visibilitySummary.visibleDepartments).toEqual({ dept_cc: 'Corp Credit' });
    expect(res.visibilitySummary.visibleBusinessLines).toEqual({ bl_corp_loan: 'Corp Loan' });
    // 受限用户不查全组织表
    expect(deptFindMany).not.toHaveBeenCalled();
    expect(blFindMany).not.toHaveBeenCalled();
  });

  it('admin user → summary lists all org dept/bl', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'u_admin',
      displayName: 'Admin',
      organizationId: 'org_1',
      isActive: true,
      departmentRoles: [
        { departmentId: 'dept_it', role: 'SUPER_ADMIN', department: { name: 'IT' } },
      ],
      businessLines: [],
      specialPermissions: [],
    });
    const prisma = {
      user: { findUnique },
      department: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'dept_it', name: 'IT' },
          { id: 'dept_cc', name: 'Corp Credit' },
        ]),
      },
      businessLine: {
        findMany: vi.fn().mockResolvedValue([{ id: 'bl_corp_loan', name: 'Corp Loan' }]),
      },
    } as never;
    const svc = new TenantService(prisma);

    const res = await svc.diagnoseVisibility('u_admin');
    expect(res.visibilitySummary.hasFullOrgVisibility).toBe(true);
    expect(res.visibilitySummary.isAdmin).toBe(true);
    expect(Object.keys(res.visibilitySummary.visibleDepartments)).toEqual(['dept_it', 'dept_cc']);
    expect(res.visibilitySummary.visibleBusinessLines).toEqual({ bl_corp_loan: 'Corp Loan' });
  });

  it('cross_org_read grant → full visibility even without admin role', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'u_viewer',
      displayName: 'Risk Viewer',
      organizationId: 'org_1',
      isActive: true,
      departmentRoles: [
        { departmentId: 'dept_risk', role: 'VIEWER', department: { name: 'Risk' } },
      ],
      businessLines: [],
      specialPermissions: [{ permissionType: 'CROSS_ORG_READ', grantedBy: 'admin' }],
    });
    const prisma = {
      user: { findUnique },
      department: { findMany: vi.fn().mockResolvedValue([]) },
      businessLine: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    const svc = new TenantService(prisma);

    const res = await svc.diagnoseVisibility('u_viewer');
    expect(res.visibilitySummary.hasFullOrgVisibility).toBe(true);
    expect(res.visibilitySummary.isAdmin).toBe(false);
    expect(res.visibilitySummary.hasCrossOrgRead).toBe(true);
  });
});
