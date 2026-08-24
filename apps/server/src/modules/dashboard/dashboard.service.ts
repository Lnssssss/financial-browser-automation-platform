import { Injectable } from '@nestjs/common';
import { DashboardDataSourceService } from './dashboard-datasource.service';
import { DashboardCacheService } from './dashboard-cache.service';
import {
  computeOverview,
  computeTrend,
  computeErrorDistribution,
  computeBusinessLineComparison,
  computeApprovalResponseTime,
  computeCostEstimation,
} from './dashboard-stats';
import {
  OverviewStats,
  TrendItem,
  BLComparisonItem,
  ApprovalTimeItem,
  CostEstimation,
} from './dashboard.types';

// Dashboard 编排层。把「取数据源 → 查缓存 → 未命中则计算 → 回写缓存」这条固定流程收成一处，
// 六个统计各一个方法。缓存 key 的 metric 名对齐源码（overview/trend/errors/business_lines/
// approval_time/cost），trend 带 {days} 参与 key 哈希——不同 days 不能互相命中。

@Injectable()
export class DashboardService {
  constructor(
    private readonly source: DashboardDataSourceService,
    private readonly cache: DashboardCacheService,
  ) {}

  /// 通用 cache-aside：命中直接返回，未命中算完回写。缓存未接线时 getCached 恒 null，退化为每次实时算。
  private async cached<T>(
    metric: string,
    orgId: string,
    compute: () => T,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const hit = await this.cache.getCached<T>(orgId, metric, params);
    if (hit !== null) return hit;
    const result = compute();
    await this.cache.setCached(orgId, metric, result, params);
    return result;
  }

  async getOverview(orgId: string): Promise<OverviewStats> {
    return this.cached('overview', orgId, () =>
      computeOverview(this.source.getTasks(), this.source.getApprovals(), orgId),
    );
  }

  async getTrend(orgId: string, days = 7): Promise<TrendItem[]> {
    return this.cached('trend', orgId, () => computeTrend(this.source.getTasks(), orgId, days), {
      days,
    });
  }

  async getErrorDistribution(orgId: string): Promise<Record<string, number>> {
    return this.cached('errors', orgId, () =>
      computeErrorDistribution(this.source.getTasks(), orgId),
    );
  }

  async getBusinessLineComparison(orgId: string): Promise<BLComparisonItem[]> {
    return this.cached('business_lines', orgId, () =>
      computeBusinessLineComparison(this.source.getTasks(), orgId),
    );
  }

  async getApprovalResponseTime(orgId: string): Promise<ApprovalTimeItem[]> {
    return this.cached('approval_time', orgId, () =>
      computeApprovalResponseTime(this.source.getApprovals(), orgId),
    );
  }

  async getCostEstimation(orgId: string): Promise<CostEstimation> {
    return this.cached('cost', orgId, () =>
      computeCostEstimation(this.source.getModelCalls(), orgId),
    );
  }
}
