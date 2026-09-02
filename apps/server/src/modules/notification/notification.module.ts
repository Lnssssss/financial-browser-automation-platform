// 通知模块装配。这是被审批流程调用的内部服务（源无 routes.py），故无 controller。
// Stage 4：RetryQueueClient 已接真实 Redis（NotificationRedisRetryQueue，token=NOTIFICATION_RETRY_QUEUE）——
// dispatcher 构造时 @Optional 注入，失败通知正式入 Redis 重试队列。

import { Module } from '@nestjs/common';
import { NotificationChannelsService } from './notification-channels.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import {
  NOTIFICATION_RETRY_QUEUE,
  NotificationRedisRetryQueue,
} from './notification-retry-queue';

@Module({
  providers: [
    // http 是 HttpPoster interface（DI 元数据擦除后成 Object，容器无法解析）→ 用工厂走默认构造，
    // 默认参数 new FetchHttpPoster() 自然生效。同 dashboard-cache / audit-storage 的处理方式。
    {
      provide: NotificationChannelsService,
      useFactory: () => new NotificationChannelsService(),
    },
    // 重试队列的真实实现 + 绑定到注入 token（dispatcher 用 @Inject(NOTIFICATION_RETRY_QUEUE) 取）。
    NotificationRedisRetryQueue,
    {
      provide: NOTIFICATION_RETRY_QUEUE,
      useExisting: NotificationRedisRetryQueue,
    },
    NotificationDispatcherService,
  ],
  exports: [NotificationChannelsService, NotificationDispatcherService],
})
export class NotificationModule {}
