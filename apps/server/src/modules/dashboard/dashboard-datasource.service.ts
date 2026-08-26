import { Injectable } from '@nestjs/common';
import { TaskRecord, ApprovalStatsRecord, ModelCallRecord } from './dashboard.types';

// 统计的数据来源。
// 全局单例 → DI 单例，configure() 保留（供测试/上报层灌数据），字段私有不外泄。
// Stage 4 若上任务表，换成 Prisma 版实现同一取数接口即可，统计函数与控制器不用动。

@Injectable()
export class DashboardDataSourceService {
  private tasks: TaskRecord[] = [];
  private approvals: ApprovalStatsRecord[] = [];
  private modelCalls: ModelCallRecord[] = [];

  /// 灌入事件数据。
  configure(input: {
    tasks?: TaskRecord[];
    approvals?: ApprovalStatsRecord[];
    modelCalls?: ModelCallRecord[];
  }): void {
    if (input.tasks) this.tasks = input.tasks;
    if (input.approvals) this.approvals = input.approvals;
    if (input.modelCalls) this.modelCalls = input.modelCalls;
  }

  getTasks(): TaskRecord[] {
    return this.tasks;
  }

  getApprovals(): ApprovalStatsRecord[] {
    return this.approvals;
  }

  getModelCalls(): ModelCallRecord[] {
    return this.modelCalls;
  }
}
