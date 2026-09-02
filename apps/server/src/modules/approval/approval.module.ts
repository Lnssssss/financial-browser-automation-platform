// 高危操作分级审批模块。装配风险识别 / 路由 / 审批服务 / API。
// 超时等待机制注入点（APPROVAL_TIMEOUT_SCHEDULER）Stage 4 已接 BullMQ 延迟队列（见 ADR-004）：
//   - ApprovalTimeoutSchedulerService 实现该 port，投递 delay=timeoutSeconds 的延迟 job；
//   - ApprovalTimeoutWorker 消费到期 job → markTimeout。
// 恢复注入点（APPROVAL_RESUME_HANDLER）Stage 4 已接：导入 WebeyeModule，其提供的
// ApprovalResumeHandlerService 会在审批通过时把任务重新入 executor-queue（破例补全，见 ADR-005）。
// PrismaService/Redis 连接由 @Global 的 PrismaModule/RedisModule 提供，无需在此 import。

import { Module } from '@nestjs/common';
import { RiskDetectorService } from './risk-detector.service';
import { ApprovalRoutingService } from './approval-routing.service';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { ApprovalTimeoutSchedulerService } from './approval-timeout.scheduler';
import { ApprovalTimeoutWorker } from './approval-timeout.worker';
import { APPROVAL_TIMEOUT_SCHEDULER } from './approval.ports';
import { WebeyeModule } from '../webeye/webeye.module';

@Module({
  imports: [WebeyeModule],
  controllers: [ApprovalController],
  providers: [
    RiskDetectorService,
    ApprovalRoutingService,
    ApprovalService,
    // 超时调度器：实现 ApprovalTimeoutScheduler port，注入到 ApprovalService。
    ApprovalTimeoutSchedulerService,
    {
      provide: APPROVAL_TIMEOUT_SCHEDULER,
      useExisting: ApprovalTimeoutSchedulerService,
    },
    // 消费端 worker：模块启动时起、关闭时停。
    ApprovalTimeoutWorker,
  ],
  exports: [RiskDetectorService, ApprovalRoutingService, ApprovalService],
})
export class ApprovalModule {}
