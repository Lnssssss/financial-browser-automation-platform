import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

// Dashboard 统计的缓存层。key 按租户隔离：dashboard:{orgId}:{metric}:{paramsHash}。
// 同 audit-storage 的「接口先行、后端后接」：RedisLikeClient 只声明真正用到的 get/set，
// 构造时可为 null（Stage 4 接入 ioredis/Upstash）。读写全程 try/catch 优雅降级——
// 缓存不可用绝不能让统计接口整体失败，最坏就是每次都实时算。

export const DEFAULT_TTL_SECONDS = 60;
export const CACHE_PREFIX = 'dashboard';

/// 缓存后端最小契约。ttl 单位秒；get 未命中返回 null。
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/// 构造租户隔离的缓存 key。params 存在时按 key 排序后 md5 取前 8 位，保证同参数命中同 key。
export function buildCacheKey(
  orgId: string,
  metric: string,
  params?: Record<string, unknown>,
): string {
  const parts = [CACHE_PREFIX, orgId, metric];
  if (params && Object.keys(params).length > 0) {
    const sorted = Object.keys(params)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = params[k];
        return acc;
      }, {});
    const hash = createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 8);
    parts.push(hash);
  }
  return parts.join(':');
}

@Injectable()
export class DashboardCacheService {
  constructor(private readonly client: RedisLikeClient | null = null) {}

  /// 是否接了后端。未接线时上层直接跳过缓存、走实时计算。
  get enabled(): boolean {
    return this.client !== null;
  }

  /// 读缓存。未接线/未命中/读失败一律返回 null（让上层实时算）。
  async getCached<T>(orgId: string, metric: string, params?: Record<string, unknown>): Promise<T | null> {
    if (!this.client) return null;
    const key = buildCacheKey(orgId, metric, params);
    try {
      const data = await this.client.get(key);
      return data !== null ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  }

  /// 写缓存。未接线/写失败静默跳过——缓存写失败不影响本次已算出的结果返回。
  async setCached(
    orgId: string,
    metric: string,
    data: unknown,
    params?: Record<string, unknown>,
    ttl: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    if (!this.client) return;
    const key = buildCacheKey(orgId, metric, params);
    try {
      await this.client.set(key, JSON.stringify(data), ttl);
    } catch {
      // 优雅降级：写失败不抛。
    }
  }
}
