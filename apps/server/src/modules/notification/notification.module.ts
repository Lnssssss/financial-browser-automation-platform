// 通知模块装配。这是被审批流程调用的内部服务（源无 routes.py），故无 controller。
// RetryQueueClient 默认不接线（Stage 4 接 Redis 时改这里的 provider）。

import { Module } from '@nestjs/common';
import { NotificationChannelsService } from './notification-channels.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  providers: [NotificationChannelsService, NotificationDispatcherService],
  exports: [NotificationChannelsService, NotificationDispatcherService],
})
export class NotificationModule {}
