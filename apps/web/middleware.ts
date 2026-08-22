import { NextRequest, NextResponse } from 'next/server';
import { isProtectedPath } from './lib/route-security';

export async function middleware(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) return NextResponse.next();

  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'pe_session';
  if (request.cookies.has(cookieName)) return NextResponse.next();

  const destination = await unauthenticatedDestination(request);
  return NextResponse.redirect(new URL(destination, request.url));
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/change-password'],
};

async function unauthenticatedDestination(request: NextRequest) {
  try {
    const response = await fetch(setupStatusUrl(request), { cache: 'no-store' });
    if (!response.ok) return '/login';
    const status = await response.json() as { setupRequired?: boolean };
    return status.setupRequired ? '/setup' : '/login';
  } catch {
    return '/login';
  }
}

function setupStatusUrl(request: NextRequest) {
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  if (/^https?:\/\//i.test(publicApiUrl)) {
    return `${publicApiUrl.replace(/\/$/, '')}/setup/status`;
  }

  if (process.env.INTERNAL_API_URL) {
    return `${process.env.INTERNAL_API_URL.replace(/\/$/, '')}/setup/status`;
  }

  const base = publicApiUrl.replace(/\/$/, '');
  return new URL(`${base}/setup/status`, request.url).toString();
}
