// 通知投递编排器：解析目标用户 → 逐个尝试发送（主渠道企业微信，失败回退钉钉）→
// 全部失败则入 Redis 重试队列 → 汇总所有尝试记录供审计。
//
// 重试队列抽象成 RetryQueueClient 接口（interface-first + 优雅降级）：默认不接线（null），
// 此时失败不入队，只在结果里如实计 0——与 dashboard cache 同一套「后端未接线也不 500」哲学。

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationChannelsService } from './notification-channels.service';
import {
  renderWecomPayload,
  renderDingtalkPayload,
} from './notification-templates';
import { CHANNEL_WECOM, CHANNEL_DINGTALK } from './notification.types';
import { NOTIFICATION_RETRY_QUEUE } from './notification-retry-queue';
import type {
  ApprovalNotificationContext,
  WebhookConfig,
  NotificationAttempt,
} from './notification.types';

/// 重试队列的 Redis key。
export const RETRY_QUEUE_KEY = 'notification:retry_queue';

/// 重试队列的最小抽象——只需要 rpush（右侧入队）。默认不接线时传 null。
export interface RetryQueueClient {
  rpush(key: string, value: string): Promise<unknown>;
}

/// 构造一条投递审计记录，自动补当前 UTC 时间戳。
/// 抽成工厂是为了对齐源 dataclass 的 __post_init__（timestamp 缺省即自动填）。
function makeAttempt(
  approvalId: string,
  targetUserId: string,
  channel: string,
  success: boolean,
  error?: string | null,
): NotificationAttempt {
  return {
    approvalId,
    targetUserId,
    channel,
    success,
    error: error ?? null,
    timestamp: new Date().toISOString(),
  };
}

/// 一次审批的聚合投递结果。totalSuccess/totalFailed 用 getter 从 attempts 实时派生，
/// 避免与 attempts 数组不一致（对齐源 dataclass 的 @property 语义）。
export class DispatchResult {
  readonly approvalId: string;
  readonly attempts: NotificationAttempt[];
  queuedForRetry: number;

  constructor(approvalId: string, attempts: NotificationAttempt[] = [], queuedForRetry = 0) {
    this.approvalId = approvalId;
    this.attempts = attempts;
    this.queuedForRetry = queuedForRetry;
  }

  get totalSuccess(): number {
    return this.attempts.filter((a) => a.success).length;
  }

  get totalFailed(): number {
    return this.attempts.filter((a) => !a.success).length;
  }
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly channels: NotificationChannelsService,
    // Stage 4：注入真实 Redis 重试队列（未接线时为 null，行为退化为「失败不入队、只如实计数」）。
    @Optional()
    @Inject(NOTIFICATION_RETRY_QUEUE)
    private readonly retryQueue: RetryQueueClient | null = null,
  ) {}

  /// 先试企业微信，失败再回退钉钉。返回 1~2 条尝试记录：
  /// - 主渠道成功即返回（不再试回退）；
  /// - 主渠道失败、有回退地址才试钉钉；
  /// - 两个地址都没配，记一条 channel='none' 的失败（供审计留痕）。
  async sendWithFallback(
    ctx: ApprovalNotificationContext,
    config: WebhookConfig,
  ): Promise<NotificationAttempt[]> {
    const attempts: NotificationAttempt[] = [];

    if (config.wecomUrl) {
      const payload = renderWecomPayload(ctx);
      const result = await this.channels.sendWecom(config.wecomUrl, payload);
      attempts.push(makeAttempt(ctx.approvalId, config.userId, CHANNEL_WECOM, result.success, result.error));
      if (result.success) {
        return attempts;
      }
    }

    if (config.dingtalkUrl) {
      const payload = renderDingtalkPayload(ctx);
      const result = await this.channels.sendDingtalk(config.dingtalkUrl, payload);
      attempts.push(makeAttempt(ctx.approvalId, config.userId, CHANNEL_DINGTALK, result.success, result.error));
      if (result.success) {
        return attempts;
      }
    }

    if (!config.wecomUrl && !config.dingtalkUrl) {
      attempts.push(
        makeAttempt(ctx.approvalId, config.userId, 'none', false, 'No webhook configured for user'),
      );
    }

    return attempts;
  }

  /// 把失败的通知推进 Redis 重试队列。
  private async enqueueRetry(
    redisClient: RetryQueueClient,
    ctx: ApprovalNotificationContext,
    config: WebhookConfig,
  ): Promise<void> {
    const entry = {
      approval_id: ctx.approvalId,
      task_id: ctx.taskId,
      risk_level: ctx.riskLevel,
      target_user_id: config.userId,
      wecom_url: config.wecomUrl ?? null,
      dingtalk_url: config.dingtalkUrl ?? null,
      enqueued_at: new Date().toISOString(),
    };
    await redisClient.rpush(RETRY_QUEUE_KEY, JSON.stringify(entry));
    this.logger.log(`Enqueued notification retry for approval=${ctx.approvalId} user=${config.userId}`);
  }

  /// 向所有目标用户投递审批通知。每个用户走一次带回退的发送；
  /// 该用户全部渠道都失败、且接了 Redis，才入重试队列并计数。
  /// redisClient 参数优先级高于注入的 retryQueue：显式传入（含显式 null）时用参数——
  /// 保留测试注入假 Redis 的路径；不传（undefined）时回退到构造注入的生产队列。
  async dispatchNotifications(
    ctx: ApprovalNotificationContext,
    webhookConfigs: WebhookConfig[],
    redisClient?: RetryQueueClient | null,
  ): Promise<DispatchResult> {
    const queue = redisClient !== undefined ? redisClient : this.retryQueue;
    const result = new DispatchResult(ctx.approvalId);

    for (const config of webhookConfigs) {
      const attempts = await this.sendWithFallback(ctx, config);
      result.attempts.push(...attempts);

      // 该用户所有渠道都失败 → 入重试队列
      if (!attempts.some((a) => a.success)) {
        if (queue !== null && queue !== undefined) {
          await this.enqueueRetry(queue, ctx, config);
          result.queuedForRetry += 1;
        }
      }
    }

    this.logger.log(
      `Dispatch complete for approval=${ctx.approvalId}: ` +
        `${result.totalSuccess} success, ${result.totalFailed} failed, ${result.queuedForRetry} queued`,
    );

    return result;
  }
}

/// 为目标用户解析 webhook 配置。缺配置的用户补一个占位（仅 userId），
/// 保证目标数与返回数一致——占位在投递时会落一条「未配置」失败记录，留全审计。
export function resolveWebhookConfigs(
  userConfigs: Record<string, WebhookConfig>,
  targetUserIds: string[],
): WebhookConfig[] {
  const configs: WebhookConfig[] = [];
  for (const uid of targetUserIds) {
    if (Object.prototype.hasOwnProperty.call(userConfigs, uid)) {
      configs.push(userConfigs[uid]);
    } else {
      configs.push({ userId: uid });
    }
  }
  return configs;
}
