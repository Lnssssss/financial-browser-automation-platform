import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AuthModule, UserModule],
  controllers: [HealthController],
})
export class AppModule {}
