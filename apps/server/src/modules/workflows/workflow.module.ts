// 工作流模板模块。装配模板查询 / 参数校验 / 敏感参数加密 / 实例化 API。
// ParamCryptoService 也导出，供将来任务执行层取回加密参数时复用。

import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { ParamCryptoService } from './param-crypto.service';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService, ParamCryptoService],
  exports: [WorkflowService, ParamCryptoService],
})
export class WorkflowModule {}
