import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// operator/approver 互斥（职责分离）。见 ADR-002：应用层事务为主 + 触发器兜底。
// 对齐源码 enterprise/auth/constraints.py 的 validate_role_exclusion。

const CONFLICT: Partial<Record<Role, Role>> = {
  [Role.OPERATOR]: Role.APPROVER,
  [Role.APPROVER]: Role.OPERATOR,
};

@Injectable()
export class UserRoleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 给用户在某部门分配角色，事务内保证 operator/approver 不共存。
   * - 只有分配 operator/approver 时才需要跨行检查（其余角色直接放行）。
   * - SELECT ... FOR UPDATE 锁住该 (user, dept) 的角色行，堵住并发“检查-写入”时间差。
   * - upsert 对齐复合主键 (userId, departmentId)：一人一部门一行。
   */
  async assignRole(userId: string, departmentId: string, role: Role): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const conflicting = CONFLICT[role];
      if (conflicting) {
        // 行锁查冲突角色。Prisma 无原生 FOR UPDATE，用 $queryRaw。
        const rows = await tx.$queryRaw<{ role: string }[]>(Prisma.sql`
          SELECT role FROM user_department_roles
          WHERE userId = ${userId} AND departmentId = ${departmentId}
          FOR UPDATE
        `);
        const existing = rows[0]?.role;
        if (existing === conflicting) {
          throw new ConflictException(
            `职责分离冲突：用户在同一部门不能同时是操作员和审批员（已是 ${existing}）`,
          );
        }
      }

      await tx.userDepartmentRole.upsert({
        where: { userId_departmentId: { userId, departmentId } },
        update: { role },
        create: { userId, departmentId, role },
      });
    });
  }
}
