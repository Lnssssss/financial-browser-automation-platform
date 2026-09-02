// Agent 运行时模块：装配 Planner / Executor / Coordinator。
// LLM_CALLABLE、审计回调仍未接线（Optional）。
// ACTION_HANDLER 已由 WebeyeBridgeModule 提供并在此导入 —— ExecutorService 靠
// @Optional @Inject(ACTION_HANDLER) 取到真实实现（Stage 4 webeye 桥接，见 ADR-005）。

import { Module } from '@nestjs/common';
import { PlannerService } from './planner.service';
import { ExecutorService } from './executor.service';
import { CoordinatorService } from './coordinator.service';
import { WebeyeBridgeModule } from '../webeye/webeye-bridge.module';

@Module({
  imports: [WebeyeBridgeModule],
  providers: [PlannerService, ExecutorService, CoordinatorService],
  exports: [PlannerService, ExecutorService, CoordinatorService],
})
export class AgentModule {}
