import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { WorkflowModule } from './modules/workflows/workflow.module';
import { LlmModule } from './modules/llm/llm.module';
import { AuditModule } from './modules/audit/audit.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationModule } from './modules/notification/notification.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AuthModule, UserModule, ApprovalModule, WorkflowModule, LlmModule, AuditModule, DashboardModule, NotificationModule],
  controllers: [HealthController],
})
export class AppModule {}
