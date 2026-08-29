import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { RegistrationModule } from '../registration/registration.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';
import { LoginStreakService } from './login-streak.service';
import { EmailChangeRateLimitService } from './email-change-rate-limit.service';
import { EmailChangeService } from './email-change.service';
import { ProfileLinksModule } from '../profile-links/profile-links.module';
import Redis from 'ioredis';
import { PasskeyController } from './passkey.controller';
import { PASSKEY_REDIS, PasskeyChallengeService } from './passkey-challenge.service';
import { PasskeyService } from './passkey.service';
import { StepUpController } from './step-up.controller';
import { StepUpService } from './step-up.service';
import { SecurityActivityController } from './security-activity.controller';
import { SecurityActivityService } from './security-activity.service';
import { loadJwtSecret } from './auth-security-config';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    RegistrationModule,
    ProfileLinksModule,
    JwtModule.register({
      secret: loadJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController, MeController, PasskeyController, StepUpController, SecurityActivityController],
  providers: [
    AuthService,
    LoginStreakService,
    EmailChangeService,
    EmailChangeRateLimitService,
    PasskeyService,
    PasskeyChallengeService,
    StepUpService,
    SecurityActivityService,
    {
      provide: PASSKEY_REDIS,
      useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 1,
        connectTimeout: 3_000,
      }),
    },
  ],
  exports: [AuthService, LoginStreakService, EmailChangeService, StepUpService, SecurityActivityService],
})
export class AuthModule {}
