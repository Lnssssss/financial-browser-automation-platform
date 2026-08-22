import { Controller, Get, Query, Request } from '@nestjs/common';
import { RequireAccess } from '../auth/access.guard';
import { UserContext } from '../auth/permission.types';
import { AuditQueryService } from './audit-query.service';
import { AuditStorageService } from './audit-storage.service';
import { AuditLog } from '@prisma/client';

// 审计日志查询 API（需 crossOrgViewer 权限）。
// 多维过滤 + 分页；截图字段返回 1 小时有效的 presigned URL。
// org 隔离强制生效：filter 的 organizationId 恒取自 req.user.orgId，前端无法越权查他机构。

@RequireAccess('crossOrgViewer')
@Controller('enterprise/audit')
export class AuditController {
  constructor(
    private readonly query: AuditQueryService,
    private readonly storage: AuditStorageService,
  ) {}

  /// 查审计日志。crossOrgViewer 或 admin 可访问；截图字段返回 presigned URL（1h）。
  @Get('logs')
  async queryLogs(
    @Request() req: { user: UserContext },
    @Query('task_id') taskId?: string,
    @Query('action_type') actionType?: string,
    @Query('executor') executor?: string,
    @Query('start_time') startTime?: string,
    @Query('end_time') endTime?: string,
    @Query('page') page = '1',
    @Query('page_size') pageSize = '20',
  ) {
    // Query 参数是字符串，收口成数字并夹取合法区间。
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));

    const result = await this.query.query({
      organizationId: req.user.orgId,
      taskId,
      actionType,
      executor,
      startTime,
      endTime,
      page: pageNum,
      pageSize: size,
    });

    const items = await Promise.all(result.items.map((log) => this.toView(log)));
    return {
      items,
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
    };
  }

  /// 单条审计记录的对外视图：截图 key → presigned URL，created_at → ISO 字符串，
  private async toView(log: AuditLog) {
    return {
      audit_log_id: log.id,
      task_id: log.taskId,
      organization_id: log.organizationId,
      department_id: log.departmentId,
      business_line_id: log.businessLineId,
      action_index: log.actionIndex,
      action_type: log.actionType,
      target_element: log.targetElement,
      input_value: log.inputValue,
      page_url: log.pageUrl,
      screenshot_before_url: await this.presign(log.screenshotBeforeKey),
      screenshot_after_url: await this.presign(log.screenshotAfterKey),
      duration_ms: log.durationMs,
      executor: log.executor,
      execution_result: log.executionResult,
      error_message: log.errorMessage,
      has_approval: log.hasApproval,
      approval_id: log.approvalId,
      approver_user_id: log.approverUserId,
      created_at: log.createdAt.toISOString(),
    };
  }

  /// 截图 key 换 presigned URL。无 key 或对象存储未接线（Stage 3）时优雅回落 null——
  /// 审计查询不该因为截图后端没接而整条失败。
  private async presign(key: string | null): Promise<string | null> {
    if (!key) return null;
    try {
      return await this.storage.getPresignedUrl(this.storage.getBucketName(), key);
    } catch {
      return null;
    }
  }
}
