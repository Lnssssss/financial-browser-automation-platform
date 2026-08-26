// 租户隔离的数据访问层：两个能力
// 1. listVisibleTasks —— 按当前请求的租户上下文过滤 TaskExtension
// 2. diagnoseVisibility —— 管理员诊断某用户的数据可见范围（排查权限问题用）
//
// 过滤条件由 tenant-query-filter 的纯函数构造，这里只负责喂给 Prisma + 组织返回形状。

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getTenantContext, TenantContext } from './tenant-context';
import { buildTenantWhere } from './tenant-query-filter';

/// /tasks 的返回形状。tenantContext 回显当前可见范围，便于前端/排障确认过滤依据。
export interface ListTasksResult {
  tasks: Array<{
    extensionId: string;
    taskId: string;
    organizationId: string;
    departmentId: string;
    businessLineId: string | null;
    riskLevel: string;
    createdBy: string;
  }>;
  total: number;
  tenantContext: {
    orgId: string;
    userId: string;
    hasFullOrgVisibility: boolean;
    visibleDepartmentIds: string[];
    visibleBusinessLineIds: string[];
  };
}

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  /// 列出当前用户可见的任务扩展。过滤 where 由租户上下文纯函数构造——
  /// 上下文缺失属异常（中间件应已注入），交由调用方（controller）先行校验。
  async listVisibleTasks(ctx: TenantContext): Promise<ListTasksResult> {
    const where = buildTenantWhere(ctx);
    const rows = await this.prisma.taskExtension.findMany({ where });

    return {
      tasks: rows.map((t) => ({
        extensionId: t.id,
        taskId: t.taskId,
        organizationId: t.organizationId,
        departmentId: t.departmentId,
        businessLineId: t.businessLineId,
        riskLevel: t.riskLevel,
        createdBy: t.createdBy,
      })),
      total: rows.length,
      tenantContext: this.formatContext(ctx),
    };
  }

  private formatContext(ctx: TenantContext) {
    return {
      orgId: ctx.orgId,
      userId: ctx.userId,
      hasFullOrgVisibility: ctx.hasFullOrgVisibility,
      visibleDepartmentIds: ctx.visibleDepartmentIds,
      visibleBusinessLineIds: ctx.visibleBusinessLineIds,
    };
  }

  /// 诊断目标用户的数据可见范围：部门角色、业务线、特殊权限，
  /// 以及据此推出的全组织可见判定。管理员排障用。
  async diagnoseVisibility(userId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        departmentRoles: { include: { department: true } },
        businessLines: { include: { businessLine: true } },
        specialPermissions: true,
      },
    });
    if (!targetUser) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const deptRoles = targetUser.departmentRoles;
    const blLinks = targetUser.businessLines;
    const specialPerms = targetUser.specialPermissions;

    const hasCrossOrgRead = specialPerms.some((sp) => sp.permissionType === 'CROSS_ORG_READ');
    const hasCrossOrgApprove = specialPerms.some(
      (sp) => sp.permissionType === 'CROSS_ORG_APPROVE',
    );

    // 管理员角色（对齐 schema Role enum 的大写值）
    const isAdminRole = deptRoles.some(
      (dr) => dr.role === 'SUPER_ADMIN' || dr.role === 'ORG_ADMIN',
    );
    const hasFullVisibility = isAdminRole || hasCrossOrgRead;

    // 全组织可见：列出该组织下所有部门/业务线；否则只列本人所属
    let visibleDepartments: Record<string, string>;
    let visibleBusinessLines: Record<string, string>;
    if (hasFullVisibility) {
      const allDepts = await this.prisma.department.findMany({
        where: { organizationId: targetUser.organizationId },
      });
      const allBls = await this.prisma.businessLine.findMany({
        where: { organizationId: targetUser.organizationId },
      });
      visibleDepartments = Object.fromEntries(allDepts.map((d) => [d.id, d.name]));
      visibleBusinessLines = Object.fromEntries(allBls.map((b) => [b.id, b.name]));
    } else {
      visibleDepartments = Object.fromEntries(
        deptRoles.map((dr) => [dr.departmentId, dr.department.name]),
      );
      visibleBusinessLines = Object.fromEntries(
        blLinks.map((bl) => [bl.businessLineId, bl.businessLine.name]),
      );
    }

    return {
      userId,
      displayName: targetUser.displayName,
      organizationId: targetUser.organizationId,
      isActive: targetUser.isActive,
      departmentRoles: deptRoles.map((dr) => ({
        departmentId: dr.departmentId,
        departmentName: dr.department.name,
        role: dr.role,
      })),
      businessLines: blLinks.map((bl) => ({
        businessLineId: bl.businessLineId,
        lineName: bl.businessLine.name,
      })),
      specialPermissions: specialPerms.map((sp) => ({
        permissionType: sp.permissionType,
        grantedBy: sp.grantedBy,
      })),
      visibilitySummary: {
        hasFullOrgVisibility: hasFullVisibility,
        isAdmin: isAdminRole,
        hasCrossOrgRead,
        hasCrossOrgApprove,
        visibleDepartments,
        visibleBusinessLines,
      },
    };
  }
}
