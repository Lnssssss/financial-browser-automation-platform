// 审批服务：建审批记录、决策（approve/reject）、查 pending。"建记录置 PENDING → 调超时调度注入点 → 释放"；
// 决策由 API 触发，写状态后调恢复注入点。两个注入点现在未接线（no-op）。

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalRoute } from './approval-routing.service';
import { RiskLevel } from './risk-keywords';
import {
  APPROVAL_RESUME_HANDLER,
  APPROVAL_TIMEOUT_SCHEDULER,
  ApprovalResumeHandler,
  ApprovalTimeoutScheduler,
} from './approval.ports';

/// 各风险等级的默认超时秒数。
/// critical 比 high 更短——越紧急给的决策时间越少。
export const DEFAULT_TIMEOUTS: Record<string, number> = {
  high: 3600, // 1 小时
  critical: 1800, // 30 分钟
};

/// 建审批记录的入参。
export interface BuildApprovalInput {
  taskId: string;
  orgId: string;
  departmentId: string;
  riskLevel: RiskLevel | string;
  riskReason: string;
  route: ApprovalRoute;
  businessLineId?: string | null;
  operationDescription?: string | null;
  screenshotKey?: string | null;
  timeoutOverride?: number | null;
}

/// 决策结果（决策方通过 API 提交）。
export type DecisionOutcome = 'approved' | 'rejected';

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(APPROVAL_TIMEOUT_SCHEDULER)
    private readonly timeoutScheduler?: ApprovalTimeoutScheduler | null,
    @Optional() @Inject(APPROVAL_RESUME_HANDLER)
    private readonly resumeHandler?: ApprovalResumeHandler | null,
  ) {}

  /// 建审批记录并落库（状态 PENDING），然后安排超时检查。
  async createApproval(input: BuildApprovalInput) {
    const timeout =
      input.timeoutOverride ?? DEFAULT_TIMEOUTS[input.riskLevel] ?? 3600;

    const record = await this.prisma.approvalRecord.create({
      data: {
        taskId: input.taskId,
        organizationId: input.orgId,
        departmentId: input.departmentId,
        businessLineId: input.businessLineId ?? null,
        riskLevel: input.riskLevel,
        riskReason: input.riskReason,
        operationDescription: input.operationDescription ?? null,
        screenshotKey: input.screenshotKey ?? null,
        // route 没给审批部门就落回来源部门
        approverDepartmentId: input.route.approver_department_id ?? input.departmentId,
        approverRole: input.route.approver_role,
        notifyDepartmentIds: input.route.notify_department_ids as Prisma.InputJsonValue,
        status: ApprovalStatus.PENDING,
        timeoutSeconds: timeout,
      },
    });

    this.logger.log(
      `Created approval ${record.id} for task ${input.taskId} (risk=${input.riskLevel}, timeout=${timeout}s)`,
    );

    // 安排超时检查（注入点：真实实现 = BullMQ 延迟任务；未接线则 no-op）
    if (this.timeoutScheduler) {
      await this.timeoutScheduler.schedule(record.id, timeout);
    }

    return record;
  }

  /// 提交决策（approve / reject）。写状态 + 决策人 + 时间，然后触发任务恢复。
  /// 仅 PENDING 记录可决策；已决策/超时的抛冲突（由调用方转 409）。
  async decide(
    approvalId: string,
    outcome: DecisionOutcome,
    approverUserId: string,
    note = '',
  ) {
    const record = await this.prisma.approvalRecord.findUnique({ where: { id: approvalId } });
    if (!record) {
      throw new ApprovalNotFoundError(approvalId);
    }
    if (record.status !== ApprovalStatus.PENDING) {
      throw new ApprovalConflictError(approvalId, record.status);
    }

    const updated = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: {
        status: outcome === 'approved' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
        approverUserId,
        decisionNote: note,
        decidedAt: new Date(),
      },
    });

    this.logger.log(`Approval ${approvalId} ${outcome} by ${approverUserId}`);

    // 恢复被挂起的任务（注入点：真实实现 = 重新入 executor-queue；未接线则 no-op）
    if (this.resumeHandler) {
      await this.resumeHandler.resume(approvalId, outcome);
    }

    return updated;
  }

  /// 超时置状态。由超时调度注入点到期时回调（未接线时不会自动触发）。
  async markTimeout(approvalId: string) {
    const record = await this.prisma.approvalRecord.findUnique({ where: { id: approvalId } });
    if (!record || record.status !== ApprovalStatus.PENDING) {
      return null; // 已决策的不再改（幂等）
    }
    const updated = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: { status: ApprovalStatus.TIMEOUT, decidedAt: new Date() },
    });
    if (this.resumeHandler) {
      await this.resumeHandler.resume(approvalId, 'timeout');
    }
    return updated;
  }

  /// 查某记录。
  async findById(approvalId: string) {
    return this.prisma.approvalRecord.findUnique({ where: { id: approvalId } });
  }

  /// 查某机构下的 pending 记录（命中 idx_apr_org_status 复合索引）。
  /// 部门级过滤在 controller 层按用户权限做（哪些部门该用户能审）。
  async listPendingByOrg(orgId: string) {
    return this.prisma.approvalRecord.findMany({
      where: { organizationId: orgId, status: ApprovalStatus.PENDING },
      orderBy: { requestedAt: 'desc' },
    });
  }
}

/// 记录不存在。调用方转 404。
export class ApprovalNotFoundError extends Error {
  constructor(public readonly approvalId: string) {
    super(`Approval request ${approvalId} not found`);
    this.name = 'ApprovalNotFoundError';
  }
}

/// 记录已非 PENDING，不可再决策。调用方转 409。
export class ApprovalConflictError extends Error {
  constructor(
    public readonly approvalId: string,
    public readonly currentStatus: string,
  ) {
    super(`Approval is already ${currentStatus}, cannot decide`);
    this.name = 'ApprovalConflictError';
  }
}
