// Demo 演示数据的装配与灌入
//
// 混合 seed：
//   - dashboard 是内存 store（DashboardDataSourceService.configure），每次 boot 必重灌；
//   - approval / audit 已是 Prisma 真实表（Stage 3），幂等落库（先删 demo 前缀再插）。
//
// 由 DEMO_SEED env flag 控制：只在 dev（DEMO_SEED=1）灌，test/prod 置空以免污染。

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardDataSourceService } from '../dashboard/dashboard-datasource.service';
import type { ApprovalStatsRecord } from '../dashboard/dashboard.types';
import {
  SeededRng,
  generateTasks,
  generateApprovals,
  generateAuditLogs,
  generateModelCalls,
  type OrgContext,
  type DeptUnit,
} from './demo-data';

@Injectable()
export class DemoSeedService implements OnModuleInit {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardDataSourceService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DEMO_SEED !== '1') {
      return; // 默认不灌，避免污染 test/prod。
    }
    try {
      await this.seed();
    } catch (e) {
      // demo 数据是旁路，失败不应拖垮 app 启动。
      this.logger.error(`Demo seed failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async seed(): Promise<void> {
    const ctx = await this.resolveOrgContext();
    if (!ctx) {
      this.logger.warn('Demo seed skipped: 组织架构未就绪（先跑 prisma seed.ts）');
      return;
    }

    // 固定种子 + 固定"现在"→ 每次生成一致（幂等）。用 seed 时刻附近的整点作为基准，
    // created_at 分布仍散在过去 30 天，Dashboard 的"今日/7d/30d"窗口有数据。
    const rng = new SeededRng(42);
    const now = new Date();

    const tasks = generateTasks(rng, now, ctx, 250);
    const approvals = generateApprovals(rng, tasks, ctx);
    const auditLogs = generateAuditLogs(rng, tasks, approvals, ctx);
    const modelCalls = generateModelCalls(rng, tasks, 1200);

    // ── 1. dashboard 内存 store（tasks + approvals stats + model calls）──
    const approvalStats: ApprovalStatsRecord[] = approvals.map((a) => ({
      org_id: a.organization_id,
      status: a.status.toLowerCase(),
      requested_at: a.requested_at,
      decided_at: a.decided_at ?? undefined,
    }));
    this.dashboard.configure({ tasks, approvals: approvalStats, modelCalls });

    // ── 2. approval / audit 落库（幂等：先删 demo 前缀再插）──
    await this.persistApprovals(approvals);
    await this.persistAuditLogs(auditLogs);

    const pending = approvals.filter((a) => a.status === 'PENDING').length;
    this.logger.log(
      `Demo seed 完成：tasks=${tasks.length} approvals=${approvals.length}(pending=${pending}) ` +
        `auditLogs=${auditLogs.length} modelCalls=${modelCalls.length}`,
    );
  }

  /// 从库查现有组织架构，组装成生成器要的真实 id 上下文。
  private async resolveOrgContext(): Promise<OrgContext | null> {
    const org = await this.prisma.organization.findUnique({ where: { code: 'DEMO_BANK' } });
    if (!org) return null;

    const depts = await this.prisma.department.findMany({ where: { organizationId: org.id } });
    const lines = await this.prisma.businessLine.findMany({ where: { organizationId: org.id } });
    const deptByCode = new Map(depts.map((d) => [d.code, d]));
    const lineByCode = new Map(lines.map((l) => [l.code, l]));

    const corpLoan = lineByCode.get('CORP_LOAN');
    const intlSettle = lineByCode.get('INTL_SETTLE');
    const corpCredit = deptByCode.get('CORP_CREDIT');
    const intlBiz = deptByCode.get('INTL_BIZ');
    const compliance = deptByCode.get('COMPLIANCE');
    if (!corpLoan || !intlSettle || !corpCredit || !compliance) return null;

    // 用真实 user.id 作为 createdBy / approverUserId（按 username 查）。
    const users = await this.prisma.user.findMany({ where: { organizationId: org.id } });
    const userByName = new Map(users.map((u) => [u.username, u]));
    const operatorId = userByName.get('operator')?.id ?? users[0]?.id ?? 'unknown';
    const approverId = userByName.get('approver')?.id ?? null;
    const complianceApproverId = userByName.get('compliance')?.id ?? approverId ?? operatorId;

    // 可派任务的运营单元 + 权重（对齐源 0.40/0.25/0.20/0.15；目标现有部门较少，取两条主线）。
    const operationalUnits: DeptUnit[] = [
      {
        departmentId: corpCredit.id,
        businessLineIds: [corpLoan.id],
        operatorUserIds: [operatorId],
        approverUserId: approverId,
      },
    ];
    const unitWeights: number[] = [0.6];
    // 国际业务部（若存在）派国际结算业务线的任务。
    if (intlBiz) {
      operationalUnits.push({
        departmentId: intlBiz.id,
        businessLineIds: [intlSettle.id],
        operatorUserIds: [operatorId],
        approverUserId: approverId,
      });
      unitWeights.push(0.4);
    }

    return {
      orgId: org.id,
      operationalUnits,
      unitWeights,
      complianceDeptId: compliance.id,
      complianceApproverUserId: complianceApproverId,
      intlSettleBusinessLineId: intlSettle.id,
    };
  }

  private async persistApprovals(
    approvals: Awaited<ReturnType<typeof generateApprovals>>,
  ): Promise<void> {
    // 幂等：清掉上次 demo 灌的（id 前缀 apr_demo_）。
    await this.prisma.approvalRecord.deleteMany({ where: { id: { startsWith: 'apr_demo_' } } });
    if (approvals.length === 0) return;

    await this.prisma.approvalRecord.createMany({
      data: approvals.map((a) => ({
        id: a.approval_id,
        taskId: a.task_id,
        organizationId: a.organization_id,
        departmentId: a.department_id,
        businessLineId: a.business_line_id,
        riskLevel: a.risk_level,
        riskReason: a.risk_reason,
        operationDescription: a.operation_description,
        approverDepartmentId: a.approver_department_id,
        status: a.status as ApprovalStatus,
        requestedAt: new Date(a.requested_at),
        timeoutSeconds: a.timeout_seconds,
        approverUserId: a.approver_user_id,
        decidedAt: a.decided_at ? new Date(a.decided_at) : null,
        decisionNote: a.decision_note,
        notifyDepartmentIds: [] as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  private async persistAuditLogs(
    logs: Awaited<ReturnType<typeof generateAuditLogs>>,
  ): Promise<void> {
    await this.prisma.auditLog.deleteMany({ where: { id: { startsWith: 'aud_demo_' } } });
    if (logs.length === 0) return;

    await this.prisma.auditLog.createMany({
      data: logs.map((l) => ({
        id: l.audit_log_id,
        taskId: l.task_id,
        organizationId: l.organization_id,
        departmentId: l.department_id,
        businessLineId: l.business_line_id,
        actionIndex: l.action_index,
        actionType: l.action_type,
        targetElement: l.target_element,
        inputValue: l.input_value,
        pageUrl: l.page_url,
        durationMs: l.duration_ms,
        executor: l.executor,
        executionResult: l.execution_result,
        errorMessage: l.error_message,
        hasApproval: l.has_approval,
        approvalId: l.approval_id,
        approverUserId: l.approver_user_id,
        createdAt: new Date(l.created_at),
      })),
    });
  }
}
