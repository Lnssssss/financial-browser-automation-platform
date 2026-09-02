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
import { ApprovalService } from './approval.service';
import {
  APPROVAL_TIMEOUT_QUEUE,
  type ApprovalTimeoutJob,
} from './approval-timeout.scheduler';

// 审批超时延迟队列的消费端。到期 job 触发 markTimeout（已幂等：非 PENDING 返回 null）。
//
// 与 scheduler 分离：scheduler 只管投递，worker 只管消费——BullMQ 的生产/消费天然解耦，
// 任意空闲 worker 都能处理到期 job（区别于源码把闹钟绑在活着的协程上）。

@Injectable()
export class ApprovalTimeoutWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovalTimeoutWorker.name);
  private worker?: Worker<ApprovalTimeoutJob>;

  constructor(
    @Inject(IOREDIS_BULLMQ) private readonly connection: Redis,
    private readonly approvalService: ApprovalService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<ApprovalTimeoutJob>(
      APPROVAL_TIMEOUT_QUEUE,
      async (job) => {
        const { approvalId } = job.data;
        const result = await this.approvalService.markTimeout(approvalId);
        if (result) {
          this.logger.log(`Approval ${approvalId} marked TIMEOUT by worker`);
        } else {
          // 已被人工决策——超时 job 与决策撞车是正常竞态，markTimeout 幂等吞掉。
          this.logger.debug(
            `Approval ${approvalId} already decided, timeout job no-op`,
          );
        }
      },
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Timeout job ${job?.id} failed: ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
