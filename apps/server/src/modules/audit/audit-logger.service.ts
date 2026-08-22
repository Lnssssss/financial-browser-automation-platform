import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLog } from '@prisma/client';
import { generateAuditLogId } from './audit.types';
import { sanitizeInput, hashRawValue } from './sanitizer';

// 审计日志写入器，带优雅降级。把脱敏后的输入 + 截图引用落库；
// 写入失败被捕获、记为系统告警，绝不打断主任务执行流。
//
// 为什么失败不抛：审计是【旁路】——它记录发生了什么，但它自己坏了不该让
// 正在转账的任务崩掉。宁可漏一条审计（记 AUDIT_LOG_FAILURE 告警待排查），
// 也不能因为写审计失败而中断业务动作。

/// writeAuditLog 的入参（一个动作步骤的全部审计字段）。
export interface WriteAuditLogInput {
  taskId: string;
  orgId: string;
  departmentId: string;
  actionIndex: number;
  actionType: string;
  executor: string;
  businessLineId?: string | null;
  targetElement?: string | null;
  inputValue?: string | null;
  pageUrl?: string | null;
  screenshotBeforeKey?: string | null;
  screenshotAfterKey?: string | null;
  durationMs?: number | null;
  executionResult?: string;
  errorMessage?: string | null;
  hasApproval?: boolean;
  approvalId?: string | null;
  approverUserId?: string | null;
}

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// 写一条审计记录（输入自动脱敏 + 原值哈希）。
  /// 成功返回记录，失败返回 null（记告警但绝不抛，主流程不受影响）。
  async writeAuditLog(input: WriteAuditLogInput): Promise<AuditLog | null> {
    try {
      if (input.actionIndex < 0) {
        throw new Error(`action_index 不能为负：${input.actionIndex}`);
      }

      const sanitizedValue = sanitizeInput(input.inputValue ?? null);
      const rawHash = hashRawValue(input.inputValue ?? null);
      const entry = await this.prisma.auditLog.create({
        data: {
          id: generateAuditLogId(),
          taskId: input.taskId,
          organizationId: input.orgId,
          departmentId: input.departmentId,
          businessLineId: input.businessLineId ?? null,
          actionIndex: input.actionIndex,
          actionType: input.actionType,
          targetElement: input.targetElement ?? null,
          inputValue: sanitizedValue,
          inputValueRawHash: rawHash,
          pageUrl: input.pageUrl ?? null,
          screenshotBeforeKey: input.screenshotBeforeKey ?? null,
          screenshotAfterKey: input.screenshotAfterKey ?? null,
          durationMs: input.durationMs ?? null,
          executor: input.executor,
          executionResult: input.executionResult ?? 'success',
          errorMessage: input.errorMessage ?? null,
          hasApproval: input.hasApproval ?? false,
          approvalId: input.approvalId ?? null,
          approverUserId: input.approverUserId ?? null,
        },
      });

      this.logger.debug(
        `Audit log written: task=${input.taskId} action=${input.actionIndex} type=${input.actionType}`,
      );
      return entry;
    } catch (e) {
      this.logger.warn(
        `AUDIT_LOG_FAILURE: 写审计失败 task=${input.taskId} action=${input.actionIndex}: ${
          (e as Error).message
        }。不影响任务执行，但需排查。`,
      );
      return null;
    }
  }
}
