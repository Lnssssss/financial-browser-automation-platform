import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { IOREDIS } from '../../redis/redis.module';
import type { RedisLikeClient } from './dashboard-cache.service';

// 把 ioredis 客户端适配成 DashboardCacheService 需要的最小契约 RedisLikeClient。
// dashboard-cache 只用 get/set(ttl)，这里做窄适配：set 用 EX 传 TTL（秒）。
@Injectable()
export class DashboardRedisCache implements RedisLikeClient {
  constructor(@Inject(IOREDIS) private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
}
