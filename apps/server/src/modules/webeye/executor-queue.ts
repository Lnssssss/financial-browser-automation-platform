// executor-queue：任务执行的 BullMQ 队列（B 段·破例补全）。
//
// 这里为 demo 完整性主动补全：
// 用一个 BullMQ 队列承载"待执行/待恢复的任务"，worker 消费后交给 CoordinatorService 编排。
//
// 对齐 approval-timeout.scheduler 的模板：@Inject(IOREDIS_BULLMQ) 建 Queue，jobId 幂等去重。

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { IOREDIS_BULLMQ } from '../../redis/redis.module';

/// 队列名。enqueue 投递、worker 消费都用它。
export const EXECUTOR_QUEUE = 'executor-queue';

/// 执行任务的 job payload。resumeFrom 为断点续跑用的已完成子任务 ID（对齐 Coordinator.run 的入参）。
export interface ExecutorJob {
  taskId: string;
  orgId: string;
  navigationGoal: string;
  context?: Record<string, unknown> | null;
  resumeFrom?: string[] | null;
}

@Injectable()
export class ExecutorQueueService {
  private readonly logger = new Logger(ExecutorQueueService.name);
  private readonly queue: Queue<ExecutorJob>;

  constructor(@Inject(IOREDIS_BULLMQ) connection: Redis) {
    this.queue = new Queue<ExecutorJob>(EXECUTOR_QUEUE, { connection });
  }

  /// 把一个任务投入执行队列。
  /// jobId = taskId 幂等：同一任务重复入队（如重复点批准）不会叠加成多次执行。
  async enqueue(job: ExecutorJob): Promise<void> {
    await this.queue.add('execute', job, {
      jobId: job.taskId,
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.logger.log(`Enqueued task ${job.taskId} to executor-queue`);
  }

  /// 关闭时释放队列连接资源。
  async close(): Promise<void> {
    await this.queue.close();
  }
}
