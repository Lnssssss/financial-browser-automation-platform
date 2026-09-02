// 审计模块。装配日志写入 / 查询 / 截图存储三块能力。
// AuditLoggerService 也导出，供将来执行层记录每步动作时复用（同 ParamCryptoService 导出模式）。

import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditLoggerService } from './audit-logger.service';
import { AuditQueryService } from './audit-query.service';
import { AuditStorageService } from './audit-storage.service';

@Module({
  controllers: [AuditController],
  providers: [
    AuditLoggerService,
    AuditQueryService,
    // client 是 interface（DI 元数据擦除后成 Object，容器无法解析）→ 用工厂显式注入 null。
    // Stage 4 接 MinIO/S3 时把 null 换成真实 client。同 dashboard-cache 的处理方式。
    {
      provide: AuditStorageService,
      useFactory: () => new AuditStorageService(null),
    },
  ],
  exports: [AuditLoggerService, AuditQueryService, AuditStorageService],
})
export class AuditModule {}
