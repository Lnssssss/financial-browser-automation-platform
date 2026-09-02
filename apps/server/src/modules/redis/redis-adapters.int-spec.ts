import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { DashboardCacheService } from '../dashboard/dashboard-cache.service';
import { DashboardRedisCache } from '../dashboard/dashboard-redis-cache';
import { buildCacheKey } from '../dashboard/dashboard-cache.service';
import { NotificationRedisRetryQueue } from '../notification/notification-retry-queue';
import { RETRY_QUEUE_KEY } from '../notification/notification-dispatcher.service';

// 集成测试：dashboard 缓存 + notification 重试队列的 ioredis 适配器（连真实 Redis）。
// 需要 docker redis 在线：pnpm test:int

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const redis = new Redis(REDIS_URL);

const ORG = '__int_redis_org';

afterAll(async () => {
  // 清理本测试写入的 key
  const cacheKey = buildCacheKey(ORG, 'overview');
  await redis.del(cacheKey);
  await redis.del(RETRY_QUEUE_KEY);
  await redis.quit();
});

describe('DashboardCacheService × 真实 Redis', () => {
  const cache = new DashboardCacheService(new DashboardRedisCache(redis));

  it('enabled=true（已接后端）', () => {
    expect(cache.enabled).toBe(true);
  });

  it('set → get 往返，值一致', async () => {
    const payload = { total_tasks: 42, success_rate_today: 0.9 };
    await cache.setCached(ORG, 'overview', payload, undefined, 30);
    const hit = await cache.getCached<typeof payload>(ORG, 'overview');
    expect(hit).toEqual(payload);
  });

  it('TTL 生效：key 带过期时间', async () => {
    await cache.setCached(ORG, 'overview', { x: 1 }, undefined, 30);
    const ttl = await redis.ttl(buildCacheKey(ORG, 'overview'));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });
});

describe('NotificationRedisRetryQueue × 真实 Redis', () => {
  const queue = new NotificationRedisRetryQueue(redis);

  it('rpush 右侧入队，能读回', async () => {
    await redis.del(RETRY_QUEUE_KEY);
    const entry = JSON.stringify({ approval_id: 'apr_int', target_user_id: 'u1' });
    const len = await queue.rpush(RETRY_QUEUE_KEY, entry);
    expect(len).toBe(1);

    const popped = await redis.lpop(RETRY_QUEUE_KEY);
    expect(popped).toBe(entry);
  });
});
