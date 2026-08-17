// Agent 运行时模块：装配 Planner / Executor / Coordinator。
// LLM_CALLABLE、ACTION_HANDLER、审计回调现在均未接线（Optional），
// Stage 4 接真实 LLM + Worker 时在此 provide 实现 / 换成 EventEmitter2 事件。

import { Module } from '@nestjs/common';
import { PlannerService } from './planner.service';
import { ExecutorService } from './executor.service';
import { CoordinatorService } from './coordinator.service';

@Module({
  providers: [PlannerService, ExecutorService, CoordinatorService],
  exports: [PlannerService, ExecutorService, CoordinatorService],
})
export class AgentModule {}
