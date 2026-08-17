import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SpecialPermissionType } from '@prisma/client';
import { EnterpriseTokenPayload } from '../auth/token.types';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /// 按组织 + 用户名查用户，连带查出登录时构建 token 所需的三维关联。
  /// 用户名现在只在组织内唯一（uq_org_username），所以必须带 organizationId。
  findForLogin(organizationId: string, username: string) {
    return this.prisma.user.findUnique({
      where: { uq_org_username: { organizationId, username } },
      include: {
        departmentRoles: { include: { department: true } },
        businessLines: true,
        specialPermissions: true,
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /// 把 DB 查出的用户（含关联）拍平成 JWT 载荷。
  buildTokenPayload(
    user: NonNullable<Awaited<ReturnType<UserService['findForLogin']>>>,
  ): EnterpriseTokenPayload {
    return {
      sub: user.id,
      orgId: user.organizationId,
      departmentRoles: user.departmentRoles.map((dr) => ({
        departmentId: dr.departmentId,
        departmentName: dr.department.name,
        role: dr.role.toLowerCase(), // Prisma enum 是大写；权限逻辑用小写字符串
      })),
      businessLineIds: user.businessLines.map((bl) => bl.businessLineId),
      hasCrossOrgRead: user.specialPermissions.some(
        (sp) => sp.permissionType === SpecialPermissionType.CROSS_ORG_READ,
      ),
      hasCrossOrgApprove: user.specialPermissions.some(
        (sp) => sp.permissionType === SpecialPermissionType.CROSS_ORG_APPROVE,
      ),
    };
  }
}
