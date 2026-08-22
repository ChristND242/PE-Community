import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EventTasksRealtimeGateway } from './event-tasks-realtime.gateway';
import { EventTaskCollaborationService } from './event-task-collaboration.service';

@Module({
  imports: [AuthModule, PrismaModule],
  providers: [EventTasksRealtimeGateway, EventTaskCollaborationService],
  exports: [EventTasksRealtimeGateway, EventTaskCollaborationService],
})
export class EventTasksRealtimeModule {}
