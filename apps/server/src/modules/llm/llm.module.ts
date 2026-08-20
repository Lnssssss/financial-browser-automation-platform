// LLM 三层容错 + 模型路由 + 决策缓存模块。
// 大部分是纯逻辑（task-states / model-router / resilient-caller / human-intervention），
// 以导出函数形式供执行层直接调用，不需要 DI；唯一需要装配的是有状态的 ActionCacheStore
// 与它的管理 API。
//
// CacheController 的 @RequireAccess('admin') 内含 AuthGuard('jwt') + AccessGuard：
// 前者依赖 AuthModule 全局注册的 JwtStrategy，后者仅依赖全局 Reflector，故本模块无需 import AuthModule。

import { Module } from '@nestjs/common';
import { ActionCacheStore } from './action-cache.service';
import { CacheController } from './cache.controller';

@Module({
  controllers: [CacheController],
  providers: [ActionCacheStore],
  exports: [ActionCacheStore],
})
export class LlmModule {}
