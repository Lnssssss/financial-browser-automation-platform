import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLog, Prisma } from '@prisma/client';

// 审计日志查询。多维过滤 + 分页 + 按时间倒序，走 Prisma

/// 查询过滤条件。org 隔离由 controller 从 user.orgId 强制注入，不开放给调用方。
export interface AuditQueryFilter {
  organizationId: string;
  taskId?: string;
  actionType?: string;
  executor?: string;
  startTime?: string; // ISO 8601
  endTime?: string;
  page: number;
  pageSize: number;
}

export interface AuditQueryResult {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  /// 按条件查审计日志。org 隔离强制生效，时间段做闭区间过滤，created_at 倒序，分页。
  async query(filter: AuditQueryFilter): Promise<AuditQueryResult> {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: filter.organizationId,
    };
    if (filter.taskId) where.taskId = filter.taskId;
    if (filter.actionType) where.actionType = filter.actionType;
    if (filter.executor) where.executor = filter.executor;
    if (filter.startTime || filter.endTime) {
      where.createdAt = {};
      if (filter.startTime) where.createdAt.gte = new Date(filter.startTime);
      if (filter.endTime) where.createdAt.lte = new Date(filter.endTime);
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
    ]);

    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}
