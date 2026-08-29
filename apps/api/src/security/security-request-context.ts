import { BlockList, isIP } from 'node:net';
import type { Request } from 'express';

export type SecurityRequestContext = {
  ipAddress: string;
  countryCode: string | null;
  countryName: string;
  userAgent: string;
  browser: string;
  operatingSystem: string;
};

const proxyPresets: Record<string, string[]> = {
  loopback: ['127.0.0.0/8', '::1/128'],
  linklocal: ['169.254.0.0/16', 'fe80::/10'],
  uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
};

export function securityRequestContext(req: Request): SecurityRequestContext {
  const peerIp = normalizeIpAddress(req.socket.remoteAddress) ?? 'Unknown';
  const trustedProxies = networkBlockList(process.env.TRUSTED_PROXY_CIDRS ?? 'loopback,linklocal,uniquelocal');
  const ipAddress = resolveClientIp(peerIp, req.get('x-forwarded-for'), trustedProxies);
  const userAgent = boundedSingleLine(req.get('user-agent'), 512) || 'Unknown';
  const agent = parseSecurityUserAgent(userAgent);
  const country = resolveTrustedCountry(req, peerIp);
  return { ipAddress, ...country, userAgent, ...agent };
}

export function trustedProxy(ipAddress: string) {
  const ip = normalizeIpAddress(ipAddress);
  if (!ip) return false;
  return networkBlockList(process.env.TRUSTED_PROXY_CIDRS ?? 'loopback,linklocal,uniquelocal').check(ip, ip.includes(':') ? 'ipv6' : 'ipv4');
}

export function resolveClientIp(peerIp: string, forwardedFor: string | undefined, trusted = networkBlockList('')) {
  const peer = normalizeIpAddress(peerIp) ?? 'Unknown';
  if (peer === 'Unknown' || !isTrusted(peer, trusted)) return peer;
  const forwarded = parseForwardedFor(forwardedFor);
  if (!forwarded) return peer;
  const chain = [...forwarded, peer];
  let index = chain.length - 1;
  while (index > 0 && isTrusted(chain[index], trusted)) index -= 1;
  return chain[index];
}

export function normalizeIpAddress(value: unknown) {
  if (typeof value !== 'string') return null;
  let candidate = value.trim();
  if (!candidate) return null;
  if (candidate.startsWith('[')) {
    const closing = candidate.indexOf(']');
    if (closing < 0) return null;
    candidate = candidate.slice(1, closing);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(':'));
  }
  const zoneIndex = candidate.indexOf('%');
  if (zoneIndex >= 0) candidate = candidate.slice(0, zoneIndex);
  const mapped = candidate.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) candidate = mapped[1];
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

export function networkBlockList(input: string) {
  const list = new BlockList();
  for (const item of input.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)) {
    for (const entry of proxyPresets[item] ?? [item]) addNetwork(list, entry);
  }
  return list;
}

function parseForwardedFor(value: string | undefined) {
  if (!value) return [];
  const parts = value.split(',').map((part) => normalizeIpAddress(part));
  if (parts.length > 16 || parts.some((part) => !part)) return null;
  return parts as string[];
}

function addNetwork(list: BlockList, value: string) {
  const [addressValue, prefixValue] = value.split('/');
  const address = normalizeIpAddress(addressValue);
  if (!address) return;
  const family = address.includes(':') ? 'ipv6' : 'ipv4';
  const maximum = family === 'ipv6' ? 128 : 32;
  const prefix = prefixValue === undefined ? maximum : Number(prefixValue);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maximum) return;
  list.addSubnet(address, prefix, family);
}

function isTrusted(ipAddress: string, list: BlockList) {
  const normalized = normalizeIpAddress(ipAddress);
  return normalized ? list.check(normalized, normalized.includes(':') ? 'ipv6' : 'ipv4') : false;
}

function resolveTrustedCountry(req: Request, peerIp: string) {
  const headerName = boundedSingleLine(process.env.SECURITY_COUNTRY_HEADER, 80);
  const trustedNetworks = boundedSingleLine(process.env.SECURITY_COUNTRY_TRUSTED_PROXY_CIDRS, 2_000);
  if (!headerName || !trustedNetworks || !isTrusted(peerIp, networkBlockList(trustedNetworks))) {
    return { countryCode: null, countryName: 'Unknown' };
  }
  const code = boundedSingleLine(req.get(headerName), 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX') return { countryCode: null, countryName: 'Unknown' };
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return { countryCode: code, countryName: name && name !== code ? name : 'Unknown' };
  } catch {
    return { countryCode: code, countryName: 'Unknown' };
  }
}

function parseSecurityUserAgent(userAgent: string) {
  const browser = userAgent.match(/Edg\/[\d.]+/i) ? 'Edge'
    : userAgent.match(/(?:Chrome|CriOS)\/[\d.]+/i) ? 'Chrome'
      : userAgent.match(/Firefox\/[\d.]+/i) ? 'Firefox'
        : userAgent.match(/Safari\/[\d.]+/i) && userAgent.match(/Version\/[\d.]+/i) ? 'Safari'
          : 'Unknown';
  const operatingSystem = /Android/i.test(userAgent) ? 'Android'
    : /(?:iPhone|iPad|CPU (?:iPhone )?OS)/i.test(userAgent) ? 'iOS'
      : /Windows NT/i.test(userAgent) ? 'Windows'
        : /Mac OS X|Macintosh/i.test(userAgent) ? 'macOS'
          : /Linux/i.test(userAgent) ? 'Linux'
            : 'Unknown';
  return { browser, operatingSystem };
}

function boundedSingleLine(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum) : '';
}
