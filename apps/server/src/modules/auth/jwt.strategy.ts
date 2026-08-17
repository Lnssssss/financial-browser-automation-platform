import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnterpriseTokenPayload, payloadToUserContext } from './token.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  // passport 校验签名+过期后调用；返回值挂到 request.user。
  // 我们直接把 token 还原成 UserContext，供 PermissionGuard 使用（无需查库）。
  validate(payload: EnterpriseTokenPayload) {
    return payloadToUserContext(payload);
  }
}
