const developmentJwtSecret = 'dev-secret-change-me';
const jwtSecretPlaceholder = '<generate-a-strong-random-secret>';

export function loadJwtSecret(environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.JWT_SECRET;
  if (environment.NODE_ENV === 'production') {
    if (!configured || configured === developmentJwtSecret || configured === jwtSecretPlaceholder || Buffer.byteLength(configured, 'utf8') < 32) {
      throw new Error('JWT_SECRET is required in production and must contain at least 32 bytes.');
    }
  }
  return configured || developmentJwtSecret;
}
