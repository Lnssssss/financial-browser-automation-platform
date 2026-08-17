import { Injectable } from '@nestjs/common';
import { PermissionLevel, UserContext } from './permission.types';

// 多维 RBAC 的权限解析器。
// 核心是一个纯函数 resolve()：输入用户上下文 + 目标资源的三个坐标，
// 输出有效权限等级。不碰数据库、无副作用——因为上下文已从 JWT 解好。

/// 角色 → 基础权限映射
const ROLE_PERMISSION_MAP: Record<string, PermissionLevel> = {
  super_admin: PermissionLevel.APPROVE,
  org_admin: PermissionLevel.APPROVE,
  approver: PermissionLevel.APPROVE,
  operator: PermissionLevel.OPERATE,
  viewer: PermissionLevel.READ,
};

/// 权限从低到高排成一维，用于取最高
const PERMISSION_ORDER: PermissionLevel[] = [
  PermissionLevel.NONE,
  PermissionLevel.READ,
  PermissionLevel.OPERATE,
  PermissionLevel.APPROVE,
];

/// 取两个权限等级中更高的。多来源命中同一资源时保证不被压低。
function higherPermission(a: PermissionLevel, b: PermissionLevel): PermissionLevel {
  return PERMISSION_ORDER.indexOf(a) >= PERMISSION_ORDER.indexOf(b) ? a : b;
}

@Injectable()
export class PermissionService {
  /**
   * 解析用户对某个资源的有效权限
   *
   * 决策逻辑（按顺序求值，取最高权限）：
   *  0. 跨组织 → NONE。注意：cross-org 特权【不】跨越组织边界，只在同 org 内生效
   *  1. 任一部门是 super_admin / org_admin → 组织内全权 APPROVE（短路）。
   *  2. 资源在用户所属部门 → 用该部门角色的权限。
   *  3. 资源在用户参与的业务线 → 用角色权限（业务线实现跨部门访问）。
   *  4. cross_org_approve → APPROVE；cross_org_read → READ（循环外叠加）。
   *  5. 否则 NONE。
   */
  resolve(
    user: UserContext,
    resourceOrgId: string,
    resourceDepartmentId: string,
    resourceBusinessLineId: string | null = null,
  ): PermissionLevel {
    // 第 0 关：跨组织直接毙掉。
    if (user.orgId !== resourceOrgId) {
      return PermissionLevel.NONE;
    }

    let effective = PermissionLevel.NONE;

    // 主循环：遍历用户在各部门的角色。
    for (const dr of user.departmentRoles) {
      const rolePerm = ROLE_PERMISSION_MAP[dr.role] ?? PermissionLevel.NONE;

      // 第 1 关：管理员在组织内全权，短路返回。
      if (dr.role === 'super_admin' || dr.role === 'org_admin') {
        return PermissionLevel.APPROVE;
      }

      // 第 2 关：资源在用户所属部门。
      if (dr.departmentId === resourceDepartmentId) {
        effective = higherPermission(effective, rolePerm);
      }
      // 第 3 关：资源在用户参与的业务线（业务线跨部门访问的关键）。
      else if (
        resourceBusinessLineId &&
        user.businessLineIds.includes(resourceBusinessLineId)
      ) {
        effective = higherPermission(effective, rolePerm);
      }
    }

    // 第 4 关：跨部门特殊权限（风控只读 / 合规审批），循环外叠加。
    if (user.hasCrossOrgApprove) {
      effective = higherPermission(effective, PermissionLevel.APPROVE);
    } else if (user.hasCrossOrgRead) {
      effective = higherPermission(effective, PermissionLevel.READ);
    }

    return effective;
  }
}
