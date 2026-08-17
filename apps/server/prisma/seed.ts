import { PrismaClient, Role, SpecialPermissionType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Stage 3 种子：一套银行场景数据，把「部门 × 业务线 × 角色」三维演活。
// 演示点：
//  - operator/approver 在同部门是【不同的人】→ 职责分离
//  - 张操作员参与「国际结算业务线」→ 可跨部门访问该业务线上的任务
//  - 风控（cross_org_read）跨部门只读、合规（cross_org_approve）跨部门审批

async function main() {
  // ── 组织（多租户根）──
  const org = await prisma.organization.upsert({
    where: { code: 'DEMO_BANK' },
    update: {},
    create: { name: '示范银行', code: 'DEMO_BANK' },
  });

  // ── 部门树（总行为根，其余挂在总行下）──
  const hq = await upsertDept(org.id, 'HQ', '总行', null);
  const corpCredit = await upsertDept(org.id, 'CORP_CREDIT', '对公信贷部', hq.id);
  const intlBiz = await upsertDept(org.id, 'INTL_BIZ', '国际业务部', hq.id);
  const risk = await upsertDept(org.id, 'RISK', '风险管理部', hq.id);
  const compliance = await upsertDept(org.id, 'COMPLIANCE', '合规部', hq.id);

  // ── 业务线（与部门正交）──
  const intlSettle = await upsertLine(org.id, 'INTL_SETTLE', '国际结算业务线');
  const corpLoan = await upsertLine(org.id, 'CORP_LOAN', '对公信贷业务线');

  // ── 用户 + 三维关联 ──
  // admin：总行超管（组织内全权）
  await upsertUser(org.id, 'admin', 'admin123', '系统管理员', [
    { departmentId: hq.id, role: Role.SUPER_ADMIN },
  ]);

  // 张操作员：对公信贷部 operator，参与国际结算业务线
  // → 能操作本部门任务；也能操作挂在国际结算业务线上的【国际业务部】任务（跨部门）
  await upsertUser(
    org.id,
    'operator',
    'operator123',
    '张操作员',
    [{ departmentId: corpCredit.id, role: Role.OPERATOR }],
    [intlSettle.id],
  );

  // 李审批：对公信贷部 approver（和张操作员【不是同一人】→ 职责分离）
  await upsertUser(org.id, 'approver', 'approver123', '李审批', [
    { departmentId: corpCredit.id, role: Role.APPROVER },
  ]);

  // 风控小王：风险管理部 viewer + 跨部门只读特权
  await upsertUser(
    org.id,
    'risk',
    'risk123',
    '风控小王',
    [{ departmentId: risk.id, role: Role.VIEWER }],
    [],
    [SpecialPermissionType.CROSS_ORG_READ],
  );

  // 合规老赵：合规部 approver + 跨部门审批特权
  await upsertUser(
    org.id,
    'compliance',
    'compliance123',
    '合规老赵',
    [{ departmentId: compliance.id, role: Role.APPROVER }],
    [],
    [SpecialPermissionType.CROSS_ORG_APPROVE],
  );

  // 抑制未使用变量告警（intlBiz/corpLoan 供人工造任务时参考）
  void intlBiz;
  void corpLoan;

  // eslint-disable-next-line no-console
  console.log('Seed 完成：admin/operator/approver/risk/compliance（密码 = 用户名+123）');
}

// ── helpers ──

function upsertDept(orgId: string, code: string, name: string, parentId: string | null) {
  return prisma.department.upsert({
    where: { uq_org_dept_code: { organizationId: orgId, code } },
    update: { name, parentId: parentId ?? undefined },
    create: { organizationId: orgId, code, name, parentId: parentId ?? undefined },
  });
}

function upsertLine(orgId: string, code: string, name: string) {
  return prisma.businessLine.upsert({
    where: { uq_org_line_code: { organizationId: orgId, code } },
    update: { name },
    create: { organizationId: orgId, code, name },
  });
}

async function upsertUser(
  orgId: string,
  username: string,
  password: string,
  displayName: string,
  roles: { departmentId: string; role: Role }[],
  businessLineIds: string[] = [],
  specialPerms: SpecialPermissionType[] = [],
) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { uq_org_username: { organizationId: orgId, username } },
    update: { displayName, passwordHash },
    create: { organizationId: orgId, username, passwordHash, displayName },
  });

  // 幂等：先清后建三维关联，保证多次 seed 结果一致
  await prisma.userDepartmentRole.deleteMany({ where: { userId: user.id } });
  await prisma.userBusinessLine.deleteMany({ where: { userId: user.id } });
  await prisma.specialPermission.deleteMany({ where: { userId: user.id } });

  for (const r of roles) {
    await prisma.userDepartmentRole.create({
      data: { userId: user.id, departmentId: r.departmentId, role: r.role },
    });
  }
  for (const blId of businessLineIds) {
    await prisma.userBusinessLine.create({
      data: { userId: user.id, businessLineId: blId },
    });
  }
  for (const pt of specialPerms) {
    await prisma.specialPermission.create({
      data: { userId: user.id, organizationId: orgId, permissionType: pt },
    });
  }
  return user;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
