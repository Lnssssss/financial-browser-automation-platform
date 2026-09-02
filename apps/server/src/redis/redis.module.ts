import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

// Redis 基础设施。全局单例连接，供 dashboard/notification 缓存与队列复用。
//
// 注意 BullMQ 的连接要求 maxRetriesPerRequest = null（否则阻塞命令会在重试上限后抛错，
// 破坏 Worker 的长轮询）。为避免两种用途互相掣肘，这里提供两个 token：
//   - IOREDIS         : 通用命令连接（get/set/rpush 等），dashboard·notification 用
//   - IOREDIS_BULLMQ  : 给 BullMQ Queue/Worker 用的连接（maxRetriesPerRequest:null）
// 两者都指向同一 REDIS_URL，只是连接选项不同。

export const IOREDIS = Symbol('IOREDIS');
export const IOREDIS_BULLMQ = Symbol('IOREDIS_BULLMQ');

export function redisUrl(): string {
  return process.env.REDIS_URL ?? 'redis://localhost:6379';
}

@Global()
@Module({
  providers: [
    {
      provide: IOREDIS,
      useFactory: () => new Redis(redisUrl()),
    },
    {
      provide: IOREDIS_BULLMQ,
      // BullMQ 强制要求 maxRetriesPerRequest:null（阻塞式命令不能被 ioredis 重试上限打断）。
      useFactory: () => new Redis(redisUrl(), { maxRetriesPerRequest: null }),
    },
  ],
  exports: [IOREDIS, IOREDIS_BULLMQ],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(IOREDIS) private readonly client: Redis,
    @Inject(IOREDIS_BULLMQ) private readonly bullClient: Redis,
  ) {}

  /// 应用关闭时优雅断开两条连接，避免测试/热重载残留句柄。
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    await this.bullClient.quit();
  }
}
