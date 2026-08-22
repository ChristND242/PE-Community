import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaptchaVerificationService } from './captcha-verification.service';
import { RegistrationRateLimitService } from './registration-rate-limit.service';
import { RegistrationNotificationQueueService } from './registration-notification-queue.service';
import { RegistrationSettingsService } from './registration-settings.service';
import { RegistrationSubmissionService } from './registration-submission.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CaptchaVerificationService,
    RegistrationRateLimitService,
    RegistrationNotificationQueueService,
    RegistrationSettingsService,
    RegistrationSubmissionService,
  ],
  exports: [RegistrationSettingsService, RegistrationSubmissionService],
})
export class RegistrationModule {}
