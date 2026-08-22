import { apiUrl } from './api';

export type PublicInstanceBootstrap = {
  initialized: boolean;
  setupRequired: boolean;
  defaultLanguage: 'en' | 'fr';
  timezone: string;
};

let browserBootstrapRequest: Promise<PublicInstanceBootstrap | null> | null = null;

export function loadPublicInstanceBootstrap() {
  if (typeof window === 'undefined') return fetchPublicInstanceBootstrap();
  browserBootstrapRequest ??= fetchPublicInstanceBootstrap();
  return browserBootstrapRequest;
}

async function fetchPublicInstanceBootstrap(): Promise<PublicInstanceBootstrap | null> {
  try {
    const response = await fetch(apiUrl('/setup/status'), { cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json() as Partial<PublicInstanceBootstrap>;
    return {
      initialized: Boolean(body.initialized),
      setupRequired: Boolean(body.setupRequired),
      defaultLanguage: body.defaultLanguage === 'fr' ? 'fr' : 'en',
      timezone: validTimezone(body.timezone) ?? 'UTC',
    };
  } catch {
    return null;
  }
}

function validTimezone(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value.trim() });
    return value.trim();
  } catch {
    return null;
  }
}
