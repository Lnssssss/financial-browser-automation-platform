import { describe, it, expect } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { UserContext } from './permission.types';
import {
  assertAdmin,
  assertAnyOperator,
  assertApprover,
  assertCrossOrgViewer,
  requireDepartmentOperator,
} from './user-context.util';

// 逐条翻译自源项目 tests/unit/test_auth_dependencies.py（去掉 HTTP header 解析部分，
// 那部分在 NestJS 里由 passport-jwt 负责）。只测 require_* 的鉴权语义。

function ctx(
  deptRoles: [string, string, string][] = [['dept_1', 'Dept 1', 'operator']],
  crossRead = false,
  crossApprove = false,
): UserContext {
  return {
    userId: 'eu_test',
    orgId: 'org_1',
    departmentRoles: deptRoles.map(([departmentId, departmentName, role]) => ({
      departmentId,
      departmentName,
      role,
    })),
    businessLineIds: [],
    hasCrossOrgRead: crossRead,
    hasCrossOrgApprove: crossApprove,
  };
}

describe('assertAnyOperator', () => {
  it('operator 通过', () => {
    expect(assertAnyOperator(ctx([['d1', 'D1', 'operator']])).userId).toBe('eu_test');
  });
  it('super_admin 通过', () => {
    expect(assertAnyOperator(ctx([['d1', 'D1', 'super_admin']])).userId).toBe('eu_test');
  });
  it('viewer 被拒 403', () => {
    expect(() => assertAnyOperator(ctx([['d1', 'D1', 'viewer']]))).toThrow(ForbiddenException);
  });
  it('approver 不是 operator，被拒', () => {
    expect(() => assertAnyOperator(ctx([['d1', 'D1', 'approver']]))).toThrow(ForbiddenException);
  });
});

describe('assertApprover', () => {
  it('approver 通过', () => {
    expect(assertApprover(ctx([['d1', 'D1', 'approver']])).userId).toBe('eu_test');
  });
  it('org_admin 通过', () => {
    expect(assertApprover(ctx([['d1', 'D1', 'org_admin']])).userId).toBe('eu_test');
  });
  it('operator 被拒', () => {
    expect(() => assertApprover(ctx([['d1', 'D1', 'operator']]))).toThrow(ForbiddenException);
  });
});

describe('assertCrossOrgViewer', () => {
  it('有 cross_read 通过', () => {
    expect(assertCrossOrgViewer(ctx([['d1', 'D1', 'viewer']], true)).userId).toBe('eu_test');
  });
  it('org_admin 通过', () => {
    expect(assertCrossOrgViewer(ctx([['d1', 'D1', 'org_admin']])).userId).toBe('eu_test');
  });
  it('无 cross_read 被拒', () => {
    expect(() => assertCrossOrgViewer(ctx([['d1', 'D1', 'viewer']]))).toThrow(ForbiddenException);
  });
});

describe('assertAdmin', () => {
  it('super_admin 通过', () => {
    expect(assertAdmin(ctx([['d1', 'D1', 'super_admin']])).userId).toBe('eu_test');
  });
  it('org_admin 通过', () => {
    expect(assertAdmin(ctx([['d1', 'D1', 'org_admin']])).userId).toBe('eu_test');
  });
  it('operator 被拒', () => {
    expect(() => assertAdmin(ctx([['d1', 'D1', 'operator']]))).toThrow(ForbiddenException);
  });
});

describe('requireDepartmentOperator', () => {
  it('正确部门的 operator 通过', () => {
    const check = requireDepartmentOperator('dept_1');
    expect(check(ctx([['dept_1', 'Dept 1', 'operator']])).userId).toBe('eu_test');
  });
  it('错误部门的 operator 被拒', () => {
    const check = requireDepartmentOperator('dept_2');
    expect(() => check(ctx([['dept_1', 'Dept 1', 'operator']]))).toThrow(ForbiddenException);
  });
  it('正确部门的 viewer 被拒', () => {
    const check = requireDepartmentOperator('dept_1');
    expect(() => check(ctx([['dept_1', 'Dept 1', 'viewer']]))).toThrow(ForbiddenException);
  });
  it('任意部门的 admin 通过', () => {
    const check = requireDepartmentOperator('dept_1');
    expect(check(ctx([['dept_1', 'Dept 1', 'super_admin']])).userId).toBe('eu_test');
  });
});
