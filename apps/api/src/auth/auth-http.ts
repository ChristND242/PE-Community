import { randomUUID } from 'crypto';
import type { CookieOptions, Request } from 'express';
import { securityRequestContext } from '../security/security-request-context';
import { SESSION_ABSOLUTE_TIMEOUT_MS } from './auth.service';

export function requestIp(req: Request) {
  return securityRequestContext(req).ipAddress;
}

export function auditRequestContext(req: Request) {
  const requestId = randomUUID();
  const security = securityRequestContext(req);
  return {
    requestId,
    correlationId: requestId,
    sourceIp: security.ipAddress,
    userAgent: security.userAgent,
    countryCode: security.countryCode ?? undefined,
    countryName: security.countryName,
    browser: security.browser,
    operatingSystem: security.operatingSystem,
    route: req.originalUrl.split('?')[0],
    httpMethod: req.method,
    service: 'API',
  };
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
    path: '/',
  };
}

function shouldUseSecureCookies() {
  if (process.env.SESSION_COOKIE_SECURE) return process.env.SESSION_COOKIE_SECURE === 'true';
  if (process.env.WEB_ORIGIN) return process.env.WEB_ORIGIN.startsWith('https://');
  return process.env.NODE_ENV === 'production';
}
