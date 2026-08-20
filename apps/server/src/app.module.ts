import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { WorkflowModule } from './modules/workflows/workflow.module';
import { LlmModule } from './modules/llm/llm.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AuthModule, UserModule, ApprovalModule, WorkflowModule, LlmModule],
  controllers: [HealthController],
})
export class AppModule {}
