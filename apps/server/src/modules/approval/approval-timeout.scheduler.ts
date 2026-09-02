import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { IOREDIS_BULLMQ } from '../../redis/redis.module';
import { ApprovalTimeoutScheduler } from './approval.ports';

// 审批超时的 BullMQ 延迟队列调度器（ApprovalTimeoutScheduler 的真实实现，见 ADR-004）。
//
// 建 PENDING 记录后立即释放，投一个 delay=timeoutSeconds 的独立延迟 job。到点由 worker 跑 markTimeout 检查是否仍 PENDING。

/// 队列名。scheduler 投递、worker 消费都用它。
export const APPROVAL_TIMEOUT_QUEUE = 'approval-timeout';

/// 延迟 job 的 payload。
export interface ApprovalTimeoutJob {
  approvalId: string;
}

@Injectable()
export class ApprovalTimeoutSchedulerService implements ApprovalTimeoutScheduler {
  private readonly logger = new Logger(ApprovalTimeoutSchedulerService.name);
  private readonly queue: Queue<ApprovalTimeoutJob>;

  constructor(@Inject(IOREDIS_BULLMQ) connection: Redis) {
    this.queue = new Queue<ApprovalTimeoutJob>(APPROVAL_TIMEOUT_QUEUE, { connection });
  }

  /// 投递延迟超时检查 job。
  /// jobId = approvalId 做幂等去重：同一审批只会有一个待触发的超时 job，重复调用不会叠加。
  async schedule(approvalId: string, timeoutSeconds: number): Promise<void> {
    await this.queue.add(
      'timeout',
      { approvalId },
      {
        delay: timeoutSeconds * 1000,
        jobId: approvalId,
        // 触发后自动清理，避免 Redis 里堆积已完成/失败的 job。
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    this.logger.log(
      `Scheduled timeout job for approval ${approvalId} in ${timeoutSeconds}s`,
    );
  }

  /// 供关闭时释放队列连接资源。
  async close(): Promise<void> {
    await this.queue.close();
  }
}
