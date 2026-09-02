// WebeyeBridgeModule（A 段·等价迁移）：提供 action_handler 的真实实现。
//
// 拆成独立模块的原因是打破潜在循环依赖：
//   - AgentModule.ExecutorService 需要 ACTION_HANDLER（本模块提供）
//   - WebeyeModule.ExecutorWorker 需要 AgentModule.CoordinatorService
// 若把 ACTION_HANDLER 和 ExecutorWorker 放同一模块，就会 agent ↔ webeye 互相 import 成环。
// 拆成 Bridge(A) → Agent → Webeye(B) 的线性链后无环。
//
// 本模块零 agent 依赖：只把 SkyvernTaskClient 包成 ACTION_HANDLER 供 AgentModule 导入。

import { Module } from '@nestjs/common';
import { ACTION_HANDLER } from '../agent/executor.service';
import { SkyvernTaskClient } from './skyvern-task.client';
import { createSkyvernActionHandler } from './skyvern-action.handler';

@Module({
  providers: [
    SkyvernTaskClient,
    {
      // ExecutorService 靠 @Optional @Inject(ACTION_HANDLER) 取；useFactory 走具体构造，
      // 避免 interface/函数类型无法被 DI 按类型解析的坑（见 db push 期 DI 教训）。
      provide: ACTION_HANDLER,
      useFactory: (client: SkyvernTaskClient) => createSkyvernActionHandler(client),
      inject: [SkyvernTaskClient],
    },
  ],
  exports: [ACTION_HANDLER, SkyvernTaskClient],
})
export class WebeyeBridgeModule {}
