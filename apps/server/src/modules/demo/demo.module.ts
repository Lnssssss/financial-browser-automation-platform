// Demo 演示数据模块。启动时（DEMO_SEED=1）灌 dashboard 内存 + approval/audit 落库。
// 导入 DashboardModule 拿 DashboardDataSourceService（已 exports）；PrismaService 由 @Global 提供。

import { Module } from '@nestjs/common';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DemoSeedService } from './demo-seed.service';

@Module({
  imports: [DashboardModule],
  providers: [DemoSeedService],
})
export class DemoModule {}
