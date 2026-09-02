// WebeyeModule（B 段·破例补全，见 ADR-005）：装配任务执行闭环。
//
// 依赖链（无环）：WebeyeBridgeModule(A) → AgentModule → WebeyeModule(B) → ApprovalModule
//   - 导入 AgentModule 拿 CoordinatorService（ExecutorWorker 消费 job 时编排执行）
//   - 导出 APPROVAL_RESUME_HANDLER 供 ApprovalModule 注入（审批通过 → 重新入 executor-queue）
//
// PrismaService/Redis 由 @Global 的 PrismaModule/RedisModule 提供，无需在此 import。

import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { APPROVAL_RESUME_HANDLER } from '../approval/approval.ports';
import { ExecutorQueueService } from './executor-queue';
import { ExecutorWorker } from './executor.worker';
import { ApprovalResumeHandlerService } from './approval-resume.handler';

@Module({
  imports: [AgentModule],
  providers: [
    ExecutorQueueService,
    ExecutorWorker,
    ApprovalResumeHandlerService,
    {
      // resume 注入点的真实实现绑到 token，供 ApprovalService 的 @Optional @Inject 取用。
      provide: APPROVAL_RESUME_HANDLER,
      useExisting: ApprovalResumeHandlerService,
    },
  ],
  exports: [APPROVAL_RESUME_HANDLER, ExecutorQueueService],
})
export class WebeyeModule {}
