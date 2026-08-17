import { UserContext } from './permission.types';

// JWT 载荷。
// 关键设计：登录时把用户的【全部权限维度】写进 token，所以后续请求解析权限
// 不必查库（见 permission.service 的纯函数）。代价：权限变更需重登/等 token 过期才生效。
export interface EnterpriseTokenPayload {
  sub: string; // userId
  orgId: string;
  departmentRoles: { departmentId: string; departmentName: string; role: string }[];
  businessLineIds: string[];
  hasCrossOrgRead: boolean;
  hasCrossOrgApprove: boolean;
  // exp 由 JwtService 自动填充
}

/// 从 JWT 载荷还原出请求生命周期使用的 UserContext。
export function payloadToUserContext(p: EnterpriseTokenPayload): UserContext {
  return {
    userId: p.sub,
    orgId: p.orgId,
    departmentRoles: p.departmentRoles,
    businessLineIds: p.businessLineIds,
    hasCrossOrgRead: p.hasCrossOrgRead,
    hasCrossOrgApprove: p.hasCrossOrgApprove,
  };
}
