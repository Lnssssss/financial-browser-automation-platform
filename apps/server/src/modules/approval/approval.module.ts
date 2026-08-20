// 高危操作分级审批模块。装配风险识别 / 路由 / 审批服务 / API。
// 两个等待机制注入点（APPROVAL_TIMEOUT_SCHEDULER / APPROVAL_RESUME_HANDLER）现未接线，
// Stage 4 接 BullMQ 时在此 provide 实现。见 ADR-004。
// PrismaService 由 @Global 的 PrismaModule 提供，无需在此 import。

import { Module } from '@nestjs/common';
import { RiskDetectorService } from './risk-detector.service';
import { ApprovalRoutingService } from './approval-routing.service';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';

@Module({
  controllers: [ApprovalController],
  providers: [RiskDetectorService, ApprovalRoutingService, ApprovalService],
  exports: [RiskDetectorService, ApprovalRoutingService, ApprovalService],
})
export class ApprovalModule {}
