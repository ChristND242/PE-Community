import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsService } from '../rbac/permissions.service';
import { ReleaseDiscoveryService } from './release-discovery.service';
import { SystemUpdatesController } from './system-updates.controller';
import { SystemUpdatesService } from './system-updates.service';
import { SystemVersionController } from './system-version.controller';
import { UpdaterAgentClient } from './updater-agent.client';
import { SystemUpdatesGateway } from './system-updates.gateway';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SystemVersionController, SystemUpdatesController],
  providers: [PermissionsService, ReleaseDiscoveryService, UpdaterAgentClient, SystemUpdatesService, SystemUpdatesGateway],
  exports: [SystemUpdatesService],
})
export class SystemUpdatesModule {}
