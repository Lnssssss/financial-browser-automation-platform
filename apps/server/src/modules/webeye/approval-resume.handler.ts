// APPROVAL_RESUME_HANDLER 的真实实现（B 段·破例补全，见 ADR-005）。
//
// 这里为 demo 完整性主动补全为"事件恢复"模型：
// 审批通过 → 读回审批记录 → 把对应任务重新投入 executor-queue → worker 消费重新编排执行。
//
// 对齐 ADR-004 的"存状态 + 事件恢复"：审批期间不占执行线程，决策到达时用一次入队事件推进。

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApprovalResumeHandler } from '../approval/approval.ports';
import { ExecutorQueueService } from './executor-queue';

@Injectable()
export class ApprovalResumeHandlerService implements ApprovalResumeHandler {
  private readonly logger = new Logger(ApprovalResumeHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executorQueue: ExecutorQueueService,
  ) {}

  /// 决策到达时恢复被挂起的任务。
  /// approved → 重新入 executor-queue（恢复执行）；rejected/timeout → 不恢复，仅记日志。
  async resume(
    approvalId: string,
    decision: 'approved' | 'rejected' | 'timeout',
  ): Promise<void> {
    if (decision !== 'approved') {
      // 拒绝/超时不恢复执行——任务保持在被拦截的终态，由上层按业务处理。
      this.logger.log(`Approval ${approvalId} ${decision}, task not resumed`);
      return;
    }

    const record = await this.prisma.approvalRecord.findUnique({
      where: { id: approvalId },
    });
    if (!record) {
      this.logger.warn(`Approval ${approvalId} not found, cannot resume`);
      return;
    }

    // 用审批记录里的操作描述作为恢复执行的导航目标（operationDescription 优先，回退 riskReason）。
    const navigationGoal = record.operationDescription ?? record.riskReason;

    await this.executorQueue.enqueue({
      taskId: record.taskId,
      orgId: record.organizationId,
      navigationGoal,
      // 断点续跑信息本应由任务快照提供；当前无任务快照表，从头执行（诚实边界，见 ADR-005）。
      resumeFrom: null,
    });
    this.logger.log(
      `Approval ${approvalId} approved → task ${record.taskId} re-enqueued to executor-queue`,
    );
  }
}
