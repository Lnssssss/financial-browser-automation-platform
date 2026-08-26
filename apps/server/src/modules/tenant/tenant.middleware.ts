// 多维租户上下文注入中间件。每个请求：
// 1. 白名单路由（登录/健康检查/文档）直接放行，不注入
// 2. 取 Authorization: Bearer <token>，缺失/格式错则放行（交下游 401）
// 3. 解码企业 JWT 得用户上下文
// 4. 构造 TenantContext（含可见范围）
// 5. 在 ALS 作用域内跑完后续处理链，供查询过滤层读取
//
// 等价说明：源是 FastAPI BaseHTTPMiddleware.dispatch（set → try/call_next → finally reset）。
// Nest 里做成 NestMiddleware，用 runWithTenantContext(ctx, () => next()) 包裹 next——
// ALS 作用域自动在请求处理链结束后还原，无需手动 reset。

import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response, NextFunction } from 'express';
import { EnterpriseTokenPayload, payloadToUserContext } from '../auth/token.types';
import { isOrgAdmin } from '../auth/user-context.util';
import { TenantContext, runWithTenantContext } from './tenant-context';

// 跳过租户上下文注入的路由前缀。注意：这里的 path 已含全局前缀 /api。
export const WHITELIST_PREFIXES = [
  '/api/auth/login',
  '/api/health',
  '/docs',
  '/openapi.json',
  '/redoc',
];

export function isWhitelisted(path: string): boolean {
  return WHITELIST_PREFIXES.some((prefix) => path.startsWith(prefix));
}

@Injectable()
export class TenantIsolationMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (isWhitelisted(req.path)) {
      return next();
    }

    const authorization = req.headers['authorization'];
    if (!authorization) {
      // 无 auth 头——交下游守卫抛 401
      return next();
    }

    const parts = authorization.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return next();
    }

    let payload: EnterpriseTokenPayload;
    try {
      payload = this.jwt.verify<EnterpriseTokenPayload>(parts[1]);
    } catch {
      // token 无效——交下游处理（放行，不在中间件里 401）
      return next();
    }

    const userCtx = payloadToUserContext(payload);

    // 判定全组织可见：管理员 或 持跨组织只读特权
    const hasFullVisibility = isOrgAdmin(userCtx) || userCtx.hasCrossOrgRead;

    const tenant = new TenantContext({
      orgId: userCtx.orgId,
      userId: userCtx.userId,
      visibleDepartmentIds: userCtx.departmentRoles.map((dr) => dr.departmentId),
      visibleBusinessLineIds: userCtx.businessLineIds,
      hasFullOrgVisibility: hasFullVisibility,
    });

    // 在租户上下文作用域内跑完后续链——作用域结束自动还原
    runWithTenantContext(tenant, () => next());
  }
}
