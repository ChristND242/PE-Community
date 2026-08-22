import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { destinationForApplicationEntry, type ApplicationSetupState } from './application-entry';
import { apiUrl } from './api';

export type AuthenticatedSession = {
  id: string;
  email: string;
  name: string;
  communityId: string;
  role: string;
  permissions: string[];
  forcePasswordChange?: boolean;
};

export async function requireAuthenticatedSession(options: { allowPasswordChange?: boolean } = {}) {
  const session = await readAuthenticatedSession();
  if (!options.allowPasswordChange && session.forcePasswordChange) redirect('/change-password');
  return session;
}

export async function requireAdminSession() {
  const session = await requireAuthenticatedSession();
  if (session.role !== 'owner' && session.role !== 'admin') redirect('/dashboard');
  return session;
}

export async function resolveApplicationEntryDestination() {
  const setupState = await readSetupState();
  if (setupState !== 'complete') return destinationForApplicationEntry(setupState, null);
  return destinationForApplicationEntry(setupState, await readOptionalAuthenticatedSession());
}

async function readAuthenticatedSession(): Promise<AuthenticatedSession> {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'pe_session';
  const cookie = (await cookies()).get(cookieName)?.value;
  if (!cookie) redirect(await unauthenticatedDestination());

  const response = await fetch(await serverApiUrl('/auth/me'), {
    cache: 'no-store',
    headers: { cookie: `${cookieName}=${cookie}` },
  });

  if (response.status === 401) redirect(await unauthenticatedDestination());
  if (!response.ok) throw new Error(`Session validation failed with status ${response.status}.`);

  return response.json() as Promise<AuthenticatedSession>;
}

async function unauthenticatedDestination() {
  return destinationForApplicationEntry(await readSetupState(), null);
}

async function readSetupState(): Promise<ApplicationSetupState> {
  try {
    const response = await fetch(await serverApiUrl('/setup/status'), { cache: 'no-store' });
    if (!response.ok) return 'error';
    const status = await response.json() as { setupRequired?: unknown };
    if (typeof status.setupRequired !== 'boolean') return 'error';
    return status.setupRequired ? 'required' : 'complete';
  } catch {
    return 'error';
  }
}

async function readOptionalAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'pe_session';
  const cookie = (await cookies()).get(cookieName)?.value;
  if (!cookie) return null;

  try {
    const response = await fetch(await serverApiUrl('/auth/me'), {
      cache: 'no-store',
      headers: { cookie: `${cookieName}=${cookie}` },
    });
    if (!response.ok) return null;
    const session = await response.json() as Partial<AuthenticatedSession>;
    if (!session.id || !session.communityId || !session.role) return null;
    return session as AuthenticatedSession;
  } catch {
    return null;
  }
}

async function serverApiUrl(path: string) {
  const publicUrl = apiUrl(path);
  if (/^https?:\/\//i.test(publicUrl)) return publicUrl;

  if (process.env.INTERNAL_API_URL) {
    const base = process.env.INTERNAL_API_URL.replace(/\/$/, '');
    const internalPath = publicUrl.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
    return `${base}${internalPath}`;
  }

  const headerList = await headers();
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? `localhost:${process.env.WEB_PORT ?? 3000}`;
  return `${proto}://${host}${publicUrl}`;
}
