// 租户模块装配。
// - JwtModule：中间件用 JwtService.verify 解码 token（与 AuthModule 同一 secret）
// - configure()：把 TenantIsolationMiddleware 挂到全部路由（白名单在中间件内部判）
//
// PrismaService 由全局 PrismaModule 提供，无需在此 import。

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantIsolationMiddleware } from './tenant.middleware';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '1d' },
    }),
  ],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 挂到所有路由；具体是否注入由中间件内的白名单判定
    consumer.apply(TenantIsolationMiddleware).forRoutes('*');
  }
}
