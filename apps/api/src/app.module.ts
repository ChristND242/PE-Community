import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuditLogModule } from './audit/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CommunitiesModule } from './communities/communities.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { SetupModule } from './setup/setup.module';
import { SecurityModule } from './security/security.module';
import { OwnerBreakGlassModule } from './owner-break-glass/owner-break-glass.module';
import { SystemUpdatesModule } from './system-updates/system-updates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
    PrismaModule,
    AuditLogModule,
    SecurityModule,
    OwnerBreakGlassModule,
    SetupModule,
    AuthModule,
    ChatModule,
    AdminModule,
    CommunitiesModule,
    SystemUpdatesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
