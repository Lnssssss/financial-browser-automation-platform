// 权限相关的纯类型定义。对照源码 enterprise/auth/{schemas,permission}.py。
// 这些类型不依赖任何框架，供 PermissionService 与 Guard 共用。

/// 有效权限等级。源码 permission.py PermissionLevel。
/// 顺序即高低：NONE < READ < OPERATE < APPROVE。
export enum PermissionLevel {
  NONE = 'none',
  READ = 'read',
  OPERATE = 'operate',
  APPROVE = 'approve',
}

/// 用户在某个部门持有的角色。源码 schemas.py DepartmentRole。
export interface DepartmentRole {
  departmentId: string;
  departmentName: string;
  role: string; // 对应 Prisma Role enum 的字符串值，如 'operator'
}

/// 从 JWT 解出的用户上下文，贯穿整个请求生命周期。
/// 源码 schemas.py UserContext —— 注意它的数据全部来自 token，不查库，
/// 这正是 resolvePermission 能做成纯函数的前提。
export interface UserContext {
  userId: string;
  orgId: string;
  departmentRoles: DepartmentRole[];
  businessLineIds: string[];
  hasCrossOrgRead: boolean;
  hasCrossOrgApprove: boolean;
}
