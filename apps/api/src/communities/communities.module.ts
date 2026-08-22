import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventTasksRealtimeModule } from '../event-tasks-realtime/event-tasks-realtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { ProfileLinksModule } from '../profile-links/profile-links.module';

@Module({
  imports: [PrismaModule, AuthModule, EventTasksRealtimeModule, ProfileLinksModule],
  controllers: [CommunitiesController],
  providers: [CommunitiesService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
