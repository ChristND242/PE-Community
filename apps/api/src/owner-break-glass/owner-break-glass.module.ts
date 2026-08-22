import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OwnerBreakGlassRecoveryService } from './owner-break-glass-recovery.service';

@Module({
  imports: [PrismaModule, EmailModule],
  providers: [OwnerBreakGlassRecoveryService],
  exports: [OwnerBreakGlassRecoveryService],
})
export class OwnerBreakGlassModule {}
