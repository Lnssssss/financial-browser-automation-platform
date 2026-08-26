import { Controller, Get, Query, Request, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequireAccess } from '../auth/access.guard';
import { UserContext } from '../auth/permission.types';
import { DashboardService } from './dashboard.service';

// Dashboard 统计 API。类级 @RequireAccess('operator')：六个查询接口 operator 及以上可访问；
// /export 方法级覆盖为 'admin'（Reflector getAllAndOverride 方法级优先于类级）。
// org 隔离强制：所有统计的 orgId 恒取 req.user.orgId，前端无法越权查他机构。

@RequireAccess('operator')
@Controller('enterprise/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  async getOverview(@Request() req: { user: UserContext }) {
    return this.dashboard.getOverview(req.user.orgId);
  }

  @Get('trend')
  async getTrend(@Request() req: { user: UserContext }, @Query('days') days = '7') {
    // days 收口成 [1,90] 的整数。
    // 先判 NaN（非数字才回退默认 7），再 clamp——否则 '0' 会被 `|| 7` 误当缺省。
    const parsed = parseInt(days, 10);
    const d = Number.isNaN(parsed) ? 7 : Math.min(90, Math.max(1, parsed));
    return this.dashboard.getTrend(req.user.orgId, d);
  }

  @Get('errors')
  async getErrors(@Request() req: { user: UserContext }) {
    return this.dashboard.getErrorDistribution(req.user.orgId);
  }

  @Get('business-lines')
  async getBusinessLines(@Request() req: { user: UserContext }) {
    return this.dashboard.getBusinessLineComparison(req.user.orgId);
  }

  @Get('approval-time')
  async getApprovalTime(@Request() req: { user: UserContext }) {
    return this.dashboard.getApprovalResponseTime(req.user.orgId);
  }

  @Get('cost')
  async getCost(@Request() req: { user: UserContext }) {
    return this.dashboard.getCostEstimation(req.user.orgId);
  }

  /// 导出 CSV。方法级 @RequireAccess('admin') 覆盖类级 operator——仅管理员可导出全量统计。
  @RequireAccess('admin')
  @Get('export')
  async exportCsv(@Request() req: { user: UserContext }, @Res({ passthrough: true }) res: Response) {
    const orgId = req.user.orgId;
    const overview = await this.dashboard.getOverview(orgId);
    const trend = await this.dashboard.getTrend(orgId, 30);
    const csv = this.buildCsv(overview, trend);

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `dashboard_${stamp}.csv`;
    const encoded = encodeURIComponent(`dashboard_${orgId}_${stamp}.csv`);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
    });
    return csv;
  }

  /// 拼 CSV 文本：概览段 + 30 天趋势段。
  private buildCsv(
    overview: Awaited<ReturnType<DashboardService['getOverview']>>,
    trend: Awaited<ReturnType<DashboardService['getTrend']>>,
  ): string {
    const rows: string[][] = [
      ['=== Overview ==='],
      ['Metric', 'Value'],
      ['Success Rate (Today)', `${overview.success_rate_today}%`],
      ['Success Rate (7d)', `${overview.success_rate_7d}%`],
      ['Success Rate (30d)', `${overview.success_rate_30d}%`],
      ['Avg Duration (ms)', String(overview.avg_duration_ms)],
      ['Pending Approvals', String(overview.pending_approvals)],
      ['Needs Human', String(overview.needs_human_count)],
      ['Total Tasks', String(overview.total_tasks)],
      [],
      ['=== Daily Trend (30d) ==='],
      ['Date', 'Success', 'Failed', 'Total'],
      ...trend.map((t) => [t.date, String(t.success), String(t.failed), String(t.total)]),
    ];
    return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }
}

/// 单元格转义：含逗号/引号/换行时加引号并转义内部引号（RFC 4180）。
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
