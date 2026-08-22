const applicationOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();

export function getAppHref(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('Application links must use a root-relative path.');
  }
  const relativeUrl = new URL(path, 'https://site.invalid');
  const normalizedPath = `${relativeUrl.pathname.replace(/\/{2,}/g, '/')}${relativeUrl.search}${relativeUrl.hash}`;
  if (!applicationOrigin) return normalizedPath;

  try {
    const origin = new URL(applicationOrigin);
    if (!['http:', 'https:'].includes(origin.protocol)) return normalizedPath;
    return new URL(normalizedPath, origin.origin).toString();
  } catch {
    return normalizedPath;
  }
}
