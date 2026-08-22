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
import { loadJwtSecret } from '../security/jwt-secret';

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
  controllers: [AuthController, MeController],
  providers: [AuthService, LoginStreakService, EmailChangeService, EmailChangeRateLimitService],
  exports: [AuthService, LoginStreakService, EmailChangeService],
})
export class AuthModule {}
