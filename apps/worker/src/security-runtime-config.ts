const secretPlaceholder = '<generate-a-strong-random-secret>';

export function validateWorkerSecurityConfig(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== 'production') return;
  const secret = environment.EMAIL_ENCRYPTION_KEY;
  if (!secret || secret === secretPlaceholder || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('EMAIL_ENCRYPTION_KEY is required in production and must contain at least 32 bytes.');
  }
}
