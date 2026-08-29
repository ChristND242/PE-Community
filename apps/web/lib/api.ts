import { DEFAULT_COMMUNITY_ID } from '@pe/shared';
import { isProtectedPath } from './route-security';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const COMMUNITY_ID = DEFAULT_COMMUNITY_ID;

export function apiUrl(path: string) {
  const base = API_URL.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  const headers = body instanceof FormData ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) };
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response);
    throw new ApiRequestError(response.status, await response.text());
  }
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string, init?: RequestInit) {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) {
    handleUnauthorizedResponse(response);
    throw new ApiRequestError(response.status, await response.text());
  }
  return {
    blob: await response.blob(),
    filename: attachmentFilename(response.headers.get('content-disposition')),
  };
}

export class ApiRequestError extends Error {
  readonly code: string | null;

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = apiErrorCode(message);
  }
}

export function isApiRequestError(error: unknown, status: number, code: string) {
  return error instanceof ApiRequestError && error.status === status && error.code === code;
}

export function userFacingApiError(error: unknown, fallback: string) {
  if (!(error instanceof ApiRequestError) || error.status >= 500) return fallback;
  try {
    const body = JSON.parse(error.message) as { message?: unknown };
    return typeof body.message === 'string' && body.message.trim() ? body.message.trim() : fallback;
  } catch {
    return fallback;
  }
}

export function handleUnauthorizedResponse(response: Pick<Response, 'status'>) {
  if (response.status !== 401) return false;
  if (typeof window !== 'undefined' && isProtectedPath(window.location.pathname)) {
    window.location.replace('/login');
  }
  return true;
}

function apiErrorCode(body: string) {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    return typeof parsed.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

function attachmentFilename(value: string | null) {
  const match = value?.match(/(?:^|;)\s*filename="([A-Za-z0-9._-]+)"(?:;|$)/i);
  return match?.[1] ?? null;
}
