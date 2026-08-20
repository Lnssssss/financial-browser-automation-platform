import { Controller, Delete, Get, Param, Post, Request } from '@nestjs/common';
import { RequireAccess } from '../auth/access.guard';
import { UserContext } from '../auth/permission.types';
import { ActionCacheStore } from './action-cache.service';

// 缓存管理 API（仅管理员）。检视与清理 LLM 动作决策缓存。
// NestJS @Controller + @RequireAccess('admin')。
// require_admin 语义（org_admin/super_admin）由 access.guard 的 assertAdmin 承接。

@RequireAccess('admin')
@Controller('enterprise/cache')
export class CacheController {
  constructor(private readonly store: ActionCacheStore) {}

  /// 缓存命中/未命中统计。
  @Get('stats')
  cacheStats() {
    return this.store.stats;
  }

  /// 清某任务的缓存决策。
  /// 注：key 按 DOM+goal 组织、无法按 task_id 精确过滤，故按机构前缀整体清。
  @Delete('task/:taskId')
  clearTaskCache(@Param('taskId') taskId: string, @Request() req: { user: UserContext }) {
    const prefix = `action_cache:${req.user.orgId}:`;
    const removed = this.store.clearByPrefix(prefix);
    return { removed, task_id: taskId };
  }

  /// 清所有过期条目。
  @Delete('expired')
  clearExpiredCache() {
    return { removed: this.store.clearExpired() };
  }

  /// 清空整个动作缓存。
  @Delete('all')
  clearAllCache() {
    return { removed: this.store.clearAll() };
  }

  /// 重置命中/未命中计数。
  @Post('reset-stats')
  resetCacheStats() {
    this.store.resetStats();
    return { status: 'ok' };
  }
}
