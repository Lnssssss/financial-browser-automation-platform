import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserService } from '../user/user.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /// 登录：解析组织 → 校验用户名密码 → 把三维权限上下文签进 JWT。
  async login(username: string, password: string, orgCode: string) {
    const org = await this.prisma.organization.findUnique({ where: { code: orgCode } });
    if (!org) {
      throw new UnauthorizedException('用户名或密码错误'); // 不泄露“组织不存在”
    }

    const user = await this.users.findForLogin(org.id, username);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const payload = this.users.buildTokenPayload(user);
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        orgId: user.organizationId,
        departmentRoles: payload.departmentRoles,
      },
    };
  }
}
