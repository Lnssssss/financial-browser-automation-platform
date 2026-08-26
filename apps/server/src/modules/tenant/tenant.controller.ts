// 租户隔离 API 路由。前缀 /enterprise（叠加全局 /api → /api/enterprise）。
// - GET /tasks           列出当前用户可见的任务扩展（自动按租户上下文过滤）
// - GET /admin/visibility 管理员诊断某用户可见范围
//
// /tasks 的过滤依赖中间件注入的租户上下文；缺失即 500（对齐源：不该发生，属配置错）。

import {
  Controller,
  Get,
  InternalServerErrorException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequireAccess } from '../auth/access.guard';
import { TenantService } from './tenant.service';
import { getTenantContext } from './tenant-context';

@Controller('enterprise')
export class TenantController {
  constructor(private readonly tenant: TenantService) {}

  /// 列出可见任务。只需登录（JWT）——可见范围由租户上下文收敛，无需额外角色门槛。
  @UseGuards(AuthGuard('jwt'))
  @Get('tasks')
  async listTasks() {
    const ctx = getTenantContext();
    if (ctx == null) {
      throw new InternalServerErrorException('Tenant context not available');
    }
    return this.tenant.listVisibleTasks(ctx);
  }

  /// 诊断某用户可见范围——管理员专用。
  @RequireAccess('admin')
  @Get('admin/visibility')
  async diagnose(@Query('userId') userId: string) {
    return this.tenant.diagnoseVisibility(userId);
  }
}
