// Dashboard 模块。装配数据源 / 缓存 / 编排三块 + 控制器。
// DashboardCacheService 用工厂 provider 注入 null 客户端（Stage 4 接 Redis 时换成真实 client）——
// 同 audit-storage 的 ObjectStorageClient 处理方式。DataSource/Service 导出，供上报层灌数据/复用。

import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardDataSourceService } from './dashboard-datasource.service';
import { DashboardCacheService } from './dashboard-cache.service';

@Module({
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardDataSourceService,
    {
      provide: DashboardCacheService,
      useFactory: () => new DashboardCacheService(null),
    },
  ],
  exports: [DashboardService, DashboardDataSourceService],
})
export class DashboardModule {}
