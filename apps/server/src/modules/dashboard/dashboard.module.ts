// Dashboard 模块。装配数据源 / 缓存 / 编排三块 + 控制器。
// Stage 4：DashboardCacheService 从「注入 null」改为注入真实 Redis 适配器（DashboardRedisCache）——
// 缓存正式生效；仍保留 getCached/setCached 内部 try/catch 优雅降级（Redis 挂了退化为每次实时算）。
// DataSource/Service 导出，供上报层灌数据/复用。

import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { IOREDIS } from '../../redis/redis.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardDataSourceService } from './dashboard-datasource.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { DashboardRedisCache } from './dashboard-redis-cache';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardDataSourceService,
    // 用工厂把 ioredis 适配器塞进 DashboardCacheService 构造（其 client 参数是 interface，DI 无法自动解析）。
    {
      provide: DashboardCacheService,
      useFactory: (redis: Redis) =>
        new DashboardCacheService(new DashboardRedisCache(redis)),
      inject: [IOREDIS],
    },
  ],
  exports: [DashboardService, DashboardDataSourceService],
})
export class DashboardModule {}
