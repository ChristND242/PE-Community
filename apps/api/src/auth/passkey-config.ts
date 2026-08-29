export type PasskeyConfig = {
  rpName: string;
  rpID: string;
  origin: string;
};

export function loadPasskeyConfig(environment: NodeJS.ProcessEnv = process.env): PasskeyConfig {
  const rpName = environment.WEBAUTHN_RP_NAME?.trim();
  const rpID = environment.WEBAUTHN_RP_ID?.trim().toLowerCase();
  const originValue = environment.WEBAUTHN_ORIGIN?.trim();
  if (!rpName || !rpID || !originValue) {
    throw new Error('WEBAUTHN_RP_NAME, WEBAUTHN_RP_ID, and WEBAUTHN_ORIGIN must be configured.');
  }
  if (rpID.includes('://') || rpID.includes('/') || rpID.includes(':')) {
    throw new Error('WEBAUTHN_RP_ID must be a hostname without a scheme, path, or port.');
  }

  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new Error('WEBAUTHN_ORIGIN must be an absolute origin URL.');
  }
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('WEBAUTHN_ORIGIN must contain only scheme, hostname, and optional port.');
  }
  const localHttp = origin.protocol === 'http:' && (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1');
  if (origin.protocol !== 'https:' && !localHttp) {
    throw new Error('WEBAUTHN_ORIGIN must use HTTPS except for explicitly configured local development.');
  }
  if (origin.hostname !== rpID && !origin.hostname.endsWith(`.${rpID}`)) {
    throw new Error('WEBAUTHN_RP_ID must be the configured origin hostname or a registrable parent domain.');
  }

  return { rpName, rpID, origin: origin.origin };
}

export function assertPasskeyRequestOrigin(requestOrigin: string | undefined, config: PasskeyConfig) {
  if (!requestOrigin || requestOrigin !== config.origin) throw new Error('Invalid passkey request origin.');
}
