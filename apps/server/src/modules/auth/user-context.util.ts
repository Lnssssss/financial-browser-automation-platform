import { ForbiddenException } from '@nestjs/common';
import { UserContext } from './permission.types';

// UserContext 上的谓词。
// UserContext 从 JWT 反序列化而来是纯数据，方法留不住，所以做成独立纯函数。

export function isSuperAdmin(u: UserContext): boolean {
  return u.departmentRoles.some((dr) => dr.role === 'super_admin');
}

/// 超管当然是管理员
export function isOrgAdmin(u: UserContext): boolean {
  return u.departmentRoles.some((dr) => dr.role === 'super_admin' || dr.role === 'org_admin');
}

export function isAnyOperator(u: UserContext): boolean {
  return u.departmentRoles.some((dr) =>
    ['super_admin', 'org_admin', 'operator'].includes(dr.role),
  );
}

export function isAnyApprover(u: UserContext): boolean {
  return u.departmentRoles.some((dr) =>
    ['super_admin', 'org_admin', 'approver'].includes(dr.role),
  );
}

export function getRoleInDepartment(u: UserContext, departmentId: string): string | null {
  return u.departmentRoles.find((dr) => dr.departmentId === departmentId)?.role ?? null;
}

export function hasBusinessLine(u: UserContext, businessLineId: string): boolean {
  return u.businessLineIds.includes(businessLineId);
}

// ── 守卫断言：不满足抛 403 ──

export function assertAnyOperator(u: UserContext): UserContext {
  if (!isAnyOperator(u)) throw new ForbiddenException('需要操作员及以上角色');
  return u;
}

export function assertApprover(u: UserContext): UserContext {
  if (!isAnyApprover(u)) throw new ForbiddenException('需要审批员及以上角色');
  return u;
}

export function assertCrossOrgViewer(u: UserContext): UserContext {
  if (!(u.hasCrossOrgRead || isOrgAdmin(u))) {
    throw new ForbiddenException('需要跨部门只读权限');
  }
  return u;
}

export function assertAdmin(u: UserContext): UserContext {
  if (!isOrgAdmin(u)) throw new ForbiddenException('需要管理员角色');
  return u;
}

/// 工厂：要求在指定部门是 operator 及以上。
export function requireDepartmentOperator(departmentId: string) {
  return (u: UserContext): UserContext => {
    const role = getRoleInDepartment(u, departmentId);
    if (role === null) {
      throw new ForbiddenException(`在部门 ${departmentId} 无任何角色`);
    }
    if (!['super_admin', 'org_admin', 'operator'].includes(role)) {
      throw new ForbiddenException(`在部门 ${departmentId} 需要操作员及以上角色`);
    }
    return u;
  };
}

const ROLE_ORDER: Record<string, number> = {
  viewer: 0,
  operator: 1,
  approver: 2,
  org_admin: 3,
  super_admin: 4,
};

/// 工厂：要求在指定部门至少 minRole。
export function requireDepartmentRole(departmentId: string, minRole = 'viewer') {
  return (u: UserContext): UserContext => {
    // 管理员绕过部门检查
    if (isOrgAdmin(u)) return u;

    const role = getRoleInDepartment(u, departmentId);
    if (role === null) {
      // 只读需求下，跨部门只读特权可放行
      if (minRole === 'viewer' && u.hasCrossOrgRead) return u;
      throw new ForbiddenException(`在部门 ${departmentId} 无任何角色`);
    }
    if ((ROLE_ORDER[role] ?? -1) < (ROLE_ORDER[minRole] ?? 0)) {
      throw new ForbiddenException(`在部门 ${departmentId} 需要 ${minRole} 及以上角色`);
    }
    return u;
  };
}
