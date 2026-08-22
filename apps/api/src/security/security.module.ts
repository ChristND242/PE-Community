import { Global, Module } from '@nestjs/common';
import { loadPasswordConfig, PASSWORD_CONFIG, PasswordService } from './password.service';

@Global()
@Module({
  providers: [
    { provide: PASSWORD_CONFIG, useFactory: () => loadPasswordConfig() },
    PasswordService,
  ],
  exports: [PasswordService],
})
export class SecurityModule {}
