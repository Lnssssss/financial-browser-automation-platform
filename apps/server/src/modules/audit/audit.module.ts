// 审计模块。装配日志写入 / 查询 / 截图存储三块能力。
// AuditLoggerService 也导出，供将来执行层记录每步动作时复用（同 ParamCryptoService 导出模式）。

import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditLoggerService } from './audit-logger.service';
import { AuditQueryService } from './audit-query.service';
import { AuditStorageService } from './audit-storage.service';

@Module({
  controllers: [AuditController],
  providers: [AuditLoggerService, AuditQueryService, AuditStorageService],
  exports: [AuditLoggerService, AuditQueryService, AuditStorageService],
})
export class AuditModule {}
