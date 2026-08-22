export const protectedAdminPrefixes = ['/admin'] as const;
export const protectedMemberPrefixes = ['/dashboard'] as const;
export const protectedAccountPaths = ['/change-password'] as const;

export const publicRouteRoots = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/setup',
] as const;

export type ProtectedRouteKind = 'admin' | 'member' | 'account';

export function protectedRouteKind(pathname: string): ProtectedRouteKind | null {
  if (protectedAdminPrefixes.some((prefix) => pathMatchesPrefix(pathname, prefix))) return 'admin';
  if (protectedMemberPrefixes.some((prefix) => pathMatchesPrefix(pathname, prefix))) return 'member';
  if (protectedAccountPaths.includes(pathname as (typeof protectedAccountPaths)[number])) return 'account';
  return null;
}

export function isProtectedPath(pathname: string) {
  return protectedRouteKind(pathname) !== null;
}

export function isPublicPath(pathname: string) {
  return publicRouteRoots.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
