// executor-queue 的消费端（B 段·破例补全，见 ADR-005）。
//
// 到达的 job 交给 CoordinatorService.run 编排（Planner → Executor → 真实 action_handler → Skyvern）。
// 与 ExecutorQueueService 分离：投递/消费解耦，任意空闲 worker 都能消费（对齐 approval-timeout.worker）。

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type Redis from 'ioredis';
import { IOREDIS_BULLMQ } from '../../redis/redis.module';
import { CoordinatorService } from '../agent/coordinator.service';
import { EXECUTOR_QUEUE, type ExecutorJob } from './executor-queue';

@Injectable()
export class ExecutorWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutorWorker.name);
  private worker?: Worker<ExecutorJob>;

  constructor(
    @Inject(IOREDIS_BULLMQ) private readonly connection: Redis,
    private readonly coordinator: CoordinatorService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<ExecutorJob>(
      EXECUTOR_QUEUE,
      async (job) => {
        const { taskId, orgId, navigationGoal, context, resumeFrom } = job.data;
        this.logger.log(
          `Executing task ${taskId} (resume=${resumeFrom ? resumeFrom.length : 0} done)`,
        );
        const state = await this.coordinator.run(
          taskId,
          orgId,
          navigationGoal,
          context ?? null,
          resumeFrom ?? null,
        );
        this.logger.log(`Task ${taskId} finished with status=${state.status}`);
        // 返回最终状态供 BullMQ 记录（removeOnComplete 后仅存在于日志）。
        return { taskId, status: state.status };
      },
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Executor job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
