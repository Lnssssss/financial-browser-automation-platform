import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRoleService } from './user-role.service';

// 集成测试：验证 operator/approver 互斥的【应用层事务闸】（ADR-002 主校验）。
// 对齐源码 tests/unit/test_auth_models.py::TestValidateRoleExclusion 的 5 个语义分支，
// 但用真实 MySQL + 真实事务（源码用 mock session）。
// 需要 docker mysql 在线：pnpm test:int

const prisma = new PrismaClient();
const svc = new UserRoleService(prisma as unknown as PrismaService);

// 临时测试数据前缀，跑完清理
const ORG_CODE = '__int_excl_org';
let orgId = '';
let deptId = '';
let userId = '';

beforeAll(async () => {
  const org = await prisma.organization.upsert({
    where: { code: ORG_CODE },
    update: {},
    create: { name: 'int-test-org', code: ORG_CODE },
  });
  orgId = org.id;
  const dept = await prisma.department.upsert({
    where: { uq_org_dept_code: { organizationId: orgId, code: 'D1' } },
    update: {},
    create: { organizationId: orgId, code: 'D1', name: 'int-dept' },
  });
  deptId = dept.id;
  const user = await prisma.user.upsert({
    where: { uq_org_username: { organizationId: orgId, username: 'int_excl_user' } },
    update: {},
    create: { organizationId: orgId, username: 'int_excl_user', passwordHash: 'x', displayName: 'int' },
  });
  userId = user.id;
});

beforeEach(async () => {
  // 每个用例前清空该用户的角色，保证独立
  await prisma.userDepartmentRole.deleteMany({ where: { userId } });
});

afterAll(async () => {
  await prisma.userDepartmentRole.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.department.deleteMany({ where: { id: deptId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe('UserRoleService.assignRole 互斥（应用层事务闸）', () => {
  it('非冲突角色（viewer）直接放行', async () => {
    await expect(svc.assignRole(userId, deptId, Role.VIEWER)).resolves.toBeUndefined();
    const row = await prisma.userDepartmentRole.findUnique({
      where: { userId_departmentId: { userId, departmentId: deptId } },
    });
    expect(row?.role).toBe(Role.VIEWER);
  });

  it('无冲突时可分配 operator', async () => {
    await expect(svc.assignRole(userId, deptId, Role.OPERATOR)).resolves.toBeUndefined();
  });

  it('无冲突时可分配 approver', async () => {
    await expect(svc.assignRole(userId, deptId, Role.APPROVER)).resolves.toBeUndefined();
  });

  it('已是 approver 时再设 operator → 拒绝', async () => {
    await svc.assignRole(userId, deptId, Role.APPROVER);
    await expect(svc.assignRole(userId, deptId, Role.OPERATOR)).rejects.toThrow(/职责分离冲突/);
  });

  it('已是 operator 时再设 approver → 拒绝', async () => {
    await svc.assignRole(userId, deptId, Role.OPERATOR);
    await expect(svc.assignRole(userId, deptId, Role.APPROVER)).rejects.toThrow(/职责分离冲突/);
  });
});
