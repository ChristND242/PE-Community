const DEVELOPMENT_JWT_SECRET = 'local-development-jwt-secret-not-for-production';
const JWT_SECRET_PLACEHOLDERS = new Set([
  'change-me',
  'dev-secret-change-me',
  '<generate-a-strong-random-secret>',
  '<strong-independent-secret>',
]);

export function loadJwtSecret(environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.JWT_SECRET;
  if (configured?.trim()) {
    if (
      environment.NODE_ENV === 'production'
      && (JWT_SECRET_PLACEHOLDERS.has(configured) || Buffer.byteLength(configured, 'utf8') < 32)
    ) {
      throw new Error('JWT_SECRET must contain at least 32 bytes and must not use an example placeholder in production.');
    }
    return configured;
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production.');
  }
  return DEVELOPMENT_JWT_SECRET;
}
