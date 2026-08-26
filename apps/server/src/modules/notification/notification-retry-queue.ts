import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { IOREDIS } from '../../redis/redis.module';
import type { RetryQueueClient } from './notification-dispatcher.service';

/// 注入 token：通知失败重试队列客户端。
export const NOTIFICATION_RETRY_QUEUE = Symbol('NOTIFICATION_RETRY_QUEUE');

// 把 ioredis 适配成 dispatcher 需要的 RetryQueueClient（只用 rpush 右侧入队）。
@Injectable()
export class NotificationRedisRetryQueue implements RetryQueueClient {
  constructor(@Inject(IOREDIS) private readonly redis: Redis) {}

  async rpush(key: string, value: string): Promise<number> {
    return this.redis.rpush(key, value);
  }
}
