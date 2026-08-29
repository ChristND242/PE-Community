import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';
import {
  networkBlockList,
  normalizeIpAddress,
  resolveClientIp,
  securityRequestContext,
} from './security-request-context';

test('normalizes supported IP representations and rejects malformed values', () => {
  assert.equal(normalizeIpAddress('203.0.113.8:443'), '203.0.113.8');
  assert.equal(normalizeIpAddress('::ffff:192.0.2.8'), '192.0.2.8');
  assert.equal(normalizeIpAddress('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(normalizeIpAddress('fe80::1%eth0'), 'fe80::1');
  assert.equal(normalizeIpAddress('not-an-ip'), null);
});

test('an untrusted direct client cannot forge forwarded IP data', () => {
  const trusted = networkBlockList('10.0.0.0/8');
  assert.equal(resolveClientIp('198.51.100.20', '1.2.3.4', trusted), '198.51.100.20');
});

test('trusted Caddy and multi-hop proxy chains resolve the first untrusted hop', () => {
  const trusted = networkBlockList('10.0.0.0/8,172.16.0.0/12');
  assert.equal(resolveClientIp('172.20.0.3', '198.51.100.20', trusted), '198.51.100.20');
  assert.equal(resolveClientIp('172.20.0.3', '198.51.100.20, 10.1.0.4', trusted), '198.51.100.20');
  assert.equal(resolveClientIp('172.20.0.3', '198.51.100.20, 203.0.113.9, 10.1.0.4', trusted), '203.0.113.9');
});

test('a malformed forwarded chain falls back to the trusted peer', () => {
  const trusted = networkBlockList('172.16.0.0/12');
  assert.equal(resolveClientIp('172.20.0.3', '198.51.100.20, malformed', trusted), '172.20.0.3');
});

test('country and forwarding headers are ignored from an untrusted peer', () => {
  withSecurityEnvironment({
    TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    SECURITY_COUNTRY_HEADER: 'CF-IPCountry',
    SECURITY_COUNTRY_TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
  }, () => {
    const context = securityRequestContext(request('198.51.100.20', {
      'x-forwarded-for': '1.2.3.4',
      'cf-connecting-ip': '1.2.3.4',
      'cf-ipcountry': 'US',
      'user-agent': chromeWindowsUserAgent,
    }));
    assert.equal(context.ipAddress, '198.51.100.20');
    assert.equal(context.countryName, 'Unknown');
    assert.equal(context.browser, 'Chrome');
    assert.equal(context.operatingSystem, 'Windows');
  });
});

test('a configured trusted edge can provide a bounded country signal', () => {
  withSecurityEnvironment({
    TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
    SECURITY_COUNTRY_HEADER: 'CF-IPCountry',
    SECURITY_COUNTRY_TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
  }, () => {
    const context = securityRequestContext(request('10.0.0.4', {
      'x-forwarded-for': '2001:db8::8',
      'cf-ipcountry': 'FR',
    }));
    assert.equal(context.ipAddress, '2001:db8::8');
    assert.equal(context.countryCode, 'FR');
    assert.equal(context.countryName, 'France');
  });
});

test('country safely remains Unknown when no trusted provider is configured', () => {
  withSecurityEnvironment({ TRUSTED_PROXY_CIDRS: 'loopback' }, () => {
    const context = securityRequestContext(request('127.0.0.1', {}));
    assert.equal(context.ipAddress, '127.0.0.1');
    assert.equal(context.countryCode, null);
    assert.equal(context.countryName, 'Unknown');
  });
});

const chromeWindowsUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36';

function request(remoteAddress: string, headers: Record<string, string>): Request {
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    socket: { remoteAddress },
    get: (name: string) => normalized[name.toLowerCase()],
  } as unknown as Request;
}

function withSecurityEnvironment(values: Record<string, string>, action: () => void) {
  const keys = ['TRUSTED_PROXY_CIDRS', 'SECURITY_COUNTRY_HEADER', 'SECURITY_COUNTRY_TRUSTED_PROXY_CIDRS'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  try {
    action();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
