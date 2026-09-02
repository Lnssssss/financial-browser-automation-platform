import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, ApprovalStatus } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalService } from './approval.service';
import { ApprovalTimeoutSchedulerService } from './approval-timeout.scheduler';
import {
  APPROVAL_TIMEOUT_QUEUE,
  type ApprovalTimeoutJob,
} from './approval-timeout.scheduler';
import { Worker } from 'bullmq';

// 集成测试：审批超时的 BullMQ 延迟队列端到端（scheduler 投递 → worker 到期 → markTimeout）。
// 需要 docker mysql + redis 在线：pnpm test:int

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const prisma = new PrismaClient();
// BullMQ 要求 maxRetriesPerRequest:null。
const bullConn = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const scheduler = new ApprovalTimeoutSchedulerService(bullConn);
const approvalService = new ApprovalService(prisma as unknown as PrismaService, scheduler);

const ORG_CODE = '__int_bullmq_org';
let orgId = '';
let deptId = '';
let worker: Worker<ApprovalTimeoutJob>;

beforeAll(async () => {
  const org = await prisma.organization.upsert({
    where: { code: ORG_CODE },
    update: {},
    create: { name: 'int-bullmq-org', code: ORG_CODE },
  });
  orgId = org.id;
  const dept = await prisma.department.upsert({
    where: { uq_org_dept_code: { organizationId: orgId, code: 'D1' } },
    update: {},
    create: { organizationId: orgId, code: 'D1', name: 'int-dept' },
  });
  deptId = dept.id;

  // 起一个 worker 消费到期 job → markTimeout（复刻 ApprovalTimeoutWorker 的核心逻辑）。
  worker = new Worker<ApprovalTimeoutJob>(
    APPROVAL_TIMEOUT_QUEUE,
    async (job) => {
      await approvalService.markTimeout(job.data.approvalId);
    },
    { connection: bullConn },
  );
  await worker.waitUntilReady();
});

afterAll(async () => {
  await worker?.close();
  await scheduler.close();
  await prisma.approvalRecord.deleteMany({ where: { organizationId: orgId } });
  await prisma.department.deleteMany({ where: { id: deptId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
  await bullConn.quit();
});

/// 建一条 PENDING 审批并安排一个极短延迟的超时 job。
async function createWithTimeout(timeoutSeconds: number) {
  return approvalService.createApproval({
    taskId: `task_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    orgId,
    departmentId: deptId,
    riskLevel: 'high',
    riskReason: 'int test',
    route: { approver_department_id: deptId, approver_role: 'APPROVER', notify_department_ids: [] },
    timeoutOverride: timeoutSeconds,
  });
}

describe('审批超时 BullMQ 延迟队列（端到端）', () => {
  it('到期 worker 触发 markTimeout：PENDING → TIMEOUT', async () => {
    const rec = await createWithTimeout(1); // 1 秒后到期

    // 立即查应仍是 PENDING（延迟未到）
    const before = await prisma.approvalRecord.findUnique({ where: { id: rec.id } });
    expect(before?.status).toBe(ApprovalStatus.PENDING);

    // 等待延迟 job 触发（1s delay + worker 处理余量）
    await new Promise((r) => setTimeout(r, 3500));

    const after = await prisma.approvalRecord.findUnique({ where: { id: rec.id } });
    expect(after?.status).toBe(ApprovalStatus.TIMEOUT);
    expect(after?.decidedAt).not.toBeNull();
  }, 15000);

  it('已决策的审批：到期 job 幂等 no-op（不覆盖 APPROVED）', async () => {
    const rec = await createWithTimeout(1);

    // 到期前先人工 approve
    await approvalService.decide(rec.id, 'approved', 'int_user', 'ok');
    const decided = await prisma.approvalRecord.findUnique({ where: { id: rec.id } });
    expect(decided?.status).toBe(ApprovalStatus.APPROVED);

    // 等超时 job 触发——markTimeout 见非 PENDING 应直接返回，不改状态
    await new Promise((r) => setTimeout(r, 3500));

    const final = await prisma.approvalRecord.findUnique({ where: { id: rec.id } });
    expect(final?.status).toBe(ApprovalStatus.APPROVED);
  }, 15000);
});
