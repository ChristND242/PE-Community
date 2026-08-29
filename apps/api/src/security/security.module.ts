import { Global, Module } from '@nestjs/common';
import { loadPasswordConfig, PASSWORD_CONFIG, PasswordService } from './password.service';
import { validateProductionSecretEncryption } from './encrypted-secret';

const EMAIL_SECRET_ENCRYPTION_CONFIG = Symbol('EMAIL_SECRET_ENCRYPTION_CONFIG');

@Global()
@Module({
  providers: [
    { provide: PASSWORD_CONFIG, useFactory: () => loadPasswordConfig() },
    {
      provide: EMAIL_SECRET_ENCRYPTION_CONFIG,
      useFactory: () => {
        validateProductionSecretEncryption();
        return true;
      },
    },
    PasswordService,
  ],
  exports: [PasswordService],
})
export class SecurityModule {}
