import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfileLinksService } from './profile-links.service';

@Module({
  imports: [PrismaModule],
  providers: [ProfileLinksService],
  exports: [ProfileLinksService],
})
export class ProfileLinksModule {}
