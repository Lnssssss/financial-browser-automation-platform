import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Redis from 'ioredis';
import { SkyvernTaskClient } from './skyvern-task.client';
import { createSkyvernActionHandler } from './skyvern-action.handler';
import { ExecutorQueueService, EXECUTOR_QUEUE } from './executor-queue';
import { ApprovalResumeHandlerService } from './approval-resume.handler';
import type { PrismaService } from '../../prisma/prisma.service';

// 集成测试：webeye 桥接。
//   A 段：action_handler → mock Skyvern HTTP，验证状态映射与轮询到终态。
//   B 段：executor-queue（连真实 Redis）enqueue → 能读回 job；resume handler 的入队分支。
// 需要 docker redis 在线：pnpm test:int

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
// BullMQ 连接必须 maxRetriesPerRequest:null。
const bullConn = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

beforeAll(() => {
  process.env.SKYVERN_BASE_URL = 'http://skyvern.test/api/v1';
  process.env.SKYVERN_API_KEY = 'test-key';
});

afterAll(async () => {
  await bullConn.quit();
  vi.restoreAllMocks();
});

// --- A 段：action_handler 映射 ---

describe('action_handler × mock Skyvern（A 段）', () => {
  it('completed → success=true，带 extracted_information 与 page_url', async () => {
    const client = new SkyvernTaskClient();
    // createTask → 返回 task_id；getTask → 立即 completed。
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ task_id: 'tsk_1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          task_id: 'tsk_1',
          status: 'completed',
          extracted_information: { balance: 100 },
          request: { url: 'https://bank.test/acct' },
        }),
      );

    const handler = createSkyvernActionHandler(client, { pollIntervalMs: 1 });
    const result = await handler('查询余额', {});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ balance: 100 });
    expect(result.page_url).toBe('https://bank.test/acct');
    fetchMock.mockRestore();
  });

  it('running→running→completed：轮询到终态才返回', async () => {
    const client = new SkyvernTaskClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ task_id: 'tsk_2' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'tsk_2', status: 'running' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'tsk_2', status: 'running' }))
      .mockResolvedValueOnce(jsonResponse({ task_id: 'tsk_2', status: 'completed' }));

    const handler = createSkyvernActionHandler(client, { pollIntervalMs: 1 });
    const result = await handler('多步任务', {});

    expect(result.success).toBe(true);
    // 1 次 create + 3 次 get = 4 次 fetch。
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockRestore();
  });

  it('failed → success=false，带 failure_reason', async () => {
    const client = new SkyvernTaskClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ task_id: 'tsk_3' }))
      .mockResolvedValueOnce(
        jsonResponse({ task_id: 'tsk_3', status: 'failed', failure_reason: '登录失败' }),
      );

    const handler = createSkyvernActionHandler(client, { pollIntervalMs: 1 });
    const result = await handler('会失败的任务', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('登录失败');
    fetchMock.mockRestore();
  });

  it('createTask HTTP 非 2xx → success=false（交给 Executor 重试）', async () => {
    const client = new SkyvernTaskClient();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }));

    const handler = createSkyvernActionHandler(client, { pollIntervalMs: 1 });
    const result = await handler('被限流', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('createTask failed');
    fetchMock.mockRestore();
  });
});

// --- B 段：executor-queue enqueue（真实 Redis）---

describe('ExecutorQueueService × 真实 Redis（B 段）', () => {
  it('enqueue → 队列里能读回 job（jobId=taskId 幂等）', async () => {
    const svc = new ExecutorQueueService(bullConn);
    const taskId = `int_exec_${Date.now()}`;
    await svc.enqueue({ taskId, orgId: 'org1', navigationGoal: '恢复执行' });

    // 直接查 BullMQ 的 job（jobId=taskId）。
    const { Queue } = await import('bullmq');
    const q = new Queue(EXECUTOR_QUEUE, { connection: bullConn });
    const job = await q.getJob(taskId);
    expect(job).toBeTruthy();
    expect(job?.data.navigationGoal).toBe('恢复执行');
    expect(job?.data.taskId).toBe(taskId);

    await job?.remove();
    await q.close();
    await svc.close();
  });
});

// --- B 段：resume handler 分支 ---

describe('ApprovalResumeHandlerService（B 段闭环）', () => {
  it('approved → 读回记录并入 executor-queue', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      approvalRecord: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'apr_1',
          taskId: 'task_1',
          organizationId: 'org1',
          operationDescription: '转账 5 万',
          riskReason: 'high amount',
        }),
      },
    } as unknown as PrismaService;
    const queue = { enqueue } as unknown as ExecutorQueueService;

    const handler = new ApprovalResumeHandlerService(prisma, queue);
    await handler.resume('apr_1', 'approved');

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task_1',
        orgId: 'org1',
        navigationGoal: '转账 5 万', // operationDescription 优先
      }),
    );
  });

  it('rejected → 不入队', async () => {
    const enqueue = vi.fn();
    const prisma = { approvalRecord: { findUnique: vi.fn() } } as unknown as PrismaService;
    const queue = { enqueue } as unknown as ExecutorQueueService;

    const handler = new ApprovalResumeHandlerService(prisma, queue);
    await handler.resume('apr_2', 'rejected');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('timeout → 不入队', async () => {
    const enqueue = vi.fn();
    const prisma = { approvalRecord: { findUnique: vi.fn() } } as unknown as PrismaService;
    const queue = { enqueue } as unknown as ExecutorQueueService;

    const handler = new ApprovalResumeHandlerService(prisma, queue);
    await handler.resume('apr_3', 'timeout');

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('approved 但记录不存在 → 不入队（不崩）', async () => {
    const enqueue = vi.fn();
    const prisma = {
      approvalRecord: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const queue = { enqueue } as unknown as ExecutorQueueService;

    const handler = new ApprovalResumeHandlerService(prisma, queue);
    await handler.resume('apr_missing', 'approved');

    expect(enqueue).not.toHaveBeenCalled();
  });
});

/// 构造一个 application/json 的 fetch Response。
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
