import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunitiesModule } from '../communities/communities.module';
import { EmailModule } from '../email/email.module';
import { EventTasksRealtimeModule } from '../event-tasks-realtime/event-tasks-realtime.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RegistrationModule } from '../registration/registration.module';
import { PermissionsService } from '../rbac/permissions.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ProfileLinksModule } from '../profile-links/profile-links.module';

@Module({
  imports: [PrismaModule, AuthModule, CommunitiesModule, EmailModule, EventTasksRealtimeModule, RegistrationModule, ProfileLinksModule],
  controllers: [AdminController],
  providers: [AdminService, PermissionsService],
})
export class AdminModule {}
