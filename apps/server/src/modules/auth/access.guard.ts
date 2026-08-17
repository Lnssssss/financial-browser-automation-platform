import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  applyDecorators,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { UserContext } from './permission.types';
import {
  assertAdmin,
  assertAnyOperator,
  assertApprover,
  assertCrossOrgViewer,
} from './user-context.util';

//   装饰器 @RequireAccess('operator') 用 SetMetadata 标注路由需要的访问级别，
//   AccessGuard 用 Reflector 读出来，取 request.user 做对应断言，不满足抛 403。

export type AccessRequirement = 'admin' | 'operator' | 'approver' | 'crossOrgViewer';

export const ACCESS_KEY = 'access:requirement';

// 语义化访问要求
const ASSERTIONS: Record<AccessRequirement, (u: UserContext) => UserContext> = {
  admin: assertAdmin,
  operator: assertAnyOperator,
  approver: assertApprover,
  crossOrgViewer: assertCrossOrgViewer,
};

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<AccessRequirement | undefined>(
      ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    // 没标注访问要求 = 只需登录（JwtAuthGuard 已保证），放行
    if (!requirement) return true;

    const req = context.switchToHttp().getRequest<{ user?: UserContext }>();
    const user = req.user;
    if (!user) throw new UnauthorizedException('未认证');

    ASSERTIONS[requirement](user); // 不满足会抛 403
    return true;
  }
}

/// 组合装饰器：一步声明「先认证(JWT) + 再按访问要求鉴权」。
/// 用法：@RequireAccess('operator')
export function RequireAccess(requirement: AccessRequirement) {
  return applyDecorators(
    SetMetadata(ACCESS_KEY, requirement),
    UseGuards(AuthGuard('jwt'), AccessGuard),
  );
}
