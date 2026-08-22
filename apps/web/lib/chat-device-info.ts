export type ChatDeviceType = 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN';

export type DetectedClientDeviceInfo = {
  deviceType: ChatDeviceType;
  operatingSystemName: string;
  operatingSystemVersion: string | null;
  browserName: string;
  browserVersion: string | null;
  suggestedDisplayName: string;
};

type NavigatorLike = {
  userAgent?: string;
  platform?: string;
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
    brands?: Array<{ brand: string; version: string }>;
    getHighEntropyValues?: (hints: string[]) => Promise<{
      platform?: string;
      platformVersion?: string;
      uaFullVersion?: string;
      fullVersionList?: Array<{ brand: string; version: string }>;
    }>;
  };
};

const metadataLength = 64;

export async function detectClientDeviceInfo(source?: NavigatorLike): Promise<DetectedClientDeviceInfo> {
  const runtimeSource: NavigatorLike = source
    ?? (typeof navigator === 'undefined' ? {} : navigator as NavigatorLike);
  const basic = detectClientDeviceInfoSync(runtimeSource);
  const clientHints = runtimeSource.userAgentData;
  if (!clientHints?.getHighEntropyValues) return basic;
  try {
    const highEntropy = await clientHints.getHighEntropyValues(['platform', 'platformVersion', 'uaFullVersion', 'fullVersionList']);
    const browser = browserFromBrands(highEntropy.fullVersionList ?? clientHints.brands ?? []);
    const operatingSystemName = normalizeOperatingSystem(highEntropy.platform ?? clientHints.platform ?? basic.operatingSystemName);
    const browserName = browser.name === 'Unknown' ? basic.browserName : browser.name;
    return normalizedDeviceInfo({
      ...basic,
      operatingSystemName,
      operatingSystemVersion: cleanVersion(highEntropy.platformVersion) ?? basic.operatingSystemVersion,
      browserName,
      browserVersion: browser.version ?? cleanVersion(highEntropy.uaFullVersion) ?? basic.browserVersion,
    });
  } catch {
    return basic;
  }
}

export function detectClientDeviceInfoSync(source: NavigatorLike): DetectedClientDeviceInfo {
  const userAgent = bounded(source.userAgent ?? '', 512);
  const hintedBrowser = browserFromBrands(source.userAgentData?.brands ?? []);
  const fallbackBrowser = browserFromUserAgent(userAgent);
  const operatingSystem = operatingSystemFromUserAgent(userAgent, source.userAgentData?.platform ?? source.platform ?? '');
  const browserName = hintedBrowser.name === 'Unknown' ? fallbackBrowser.name : hintedBrowser.name;
  const browserVersion = hintedBrowser.version ?? fallbackBrowser.version;
  const deviceType = detectDeviceType(userAgent, source.userAgentData?.mobile);
  return normalizedDeviceInfo({
    deviceType,
    operatingSystemName: operatingSystem.name,
    operatingSystemVersion: operatingSystem.version,
    browserName,
    browserVersion,
    suggestedDisplayName: '',
  });
}

function normalizedDeviceInfo(info: DetectedClientDeviceInfo): DetectedClientDeviceInfo {
  const operatingSystemName = bounded(info.operatingSystemName || 'Unknown', metadataLength);
  const browserName = bounded(info.browserName || 'Unknown', metadataLength);
  const fallback = info.deviceType === 'MOBILE'
    ? 'Mobile device'
    : info.deviceType === 'TABLET'
      ? 'Tablet device'
      : 'Unknown device';
  const suggestedDisplayName = browserName !== 'Unknown' && operatingSystemName !== 'Unknown'
    ? `${browserName} on ${operatingSystemName}`
    : browserName !== 'Unknown'
      ? `${browserName} browser`
      : operatingSystemName !== 'Unknown'
        ? `${operatingSystemName} device`
        : fallback;
  return {
    deviceType: info.deviceType,
    operatingSystemName,
    operatingSystemVersion: cleanVersion(info.operatingSystemVersion),
    browserName,
    browserVersion: cleanVersion(info.browserVersion),
    suggestedDisplayName: bounded(suggestedDisplayName, 80),
  };
}

function browserFromBrands(brands: Array<{ brand: string; version: string }>) {
  const ordered = [
    ['Microsoft Edge', 'Edge'],
    ['Google Chrome', 'Chrome'],
    ['Opera', 'Opera'],
    ['Chromium', 'Chrome'],
  ] as const;
  for (const [brand, name] of ordered) {
    const match = brands.find((item) => item.brand === brand);
    if (match) return { name, version: cleanVersion(match.version) };
  }
  return { name: 'Unknown', version: null };
}

function browserFromUserAgent(userAgent: string) {
  const patterns: Array<[RegExp, string]> = [
    [/(?:Edg|EdgiOS|EdgA)\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).+Safari\//, 'Safari'],
  ];
  for (const [pattern, name] of patterns) {
    const match = userAgent.match(pattern);
    if (match) return { name, version: cleanVersion(match[1]) };
  }
  return { name: 'Unknown', version: null };
}

function operatingSystemFromUserAgent(userAgent: string, platform: string) {
  const normalizedPlatform = normalizeOperatingSystem(platform);
  if (normalizedPlatform !== 'Unknown') return { name: normalizedPlatform, version: null };
  const android = userAgent.match(/Android\s+([\d.]+)/i);
  if (android) return { name: 'Android', version: cleanVersion(android[1]) };
  const ios = userAgent.match(/(?:iPhone OS|CPU OS)\s+([\d_]+)/i);
  if (ios) return { name: 'iOS', version: cleanVersion(ios[1].replaceAll('_', '.')) };
  const mac = userAgent.match(/Mac OS X\s+([\d_]+)/i);
  if (mac) return { name: 'macOS', version: cleanVersion(mac[1].replaceAll('_', '.')) };
  if (/Windows NT/i.test(userAgent)) return { name: 'Windows', version: null };
  if (/CrOS/i.test(userAgent)) return { name: 'ChromeOS', version: null };
  if (/Linux/i.test(userAgent)) return { name: 'Linux', version: null };
  return { name: 'Unknown', version: null };
}

function normalizeOperatingSystem(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('win')) return 'Windows';
  if (normalized.includes('mac')) return 'macOS';
  if (normalized.includes('android')) return 'Android';
  if (normalized.includes('ios') || normalized.includes('iphone') || normalized.includes('ipad')) return 'iOS';
  if (normalized.includes('cros') || normalized.includes('chrome os')) return 'ChromeOS';
  if (normalized.includes('linux')) return 'Linux';
  return 'Unknown';
}

function detectDeviceType(userAgent: string, hintedMobile?: boolean): ChatDeviceType {
  if (hintedMobile === true) return 'MOBILE';
  if (/iPad|Tablet/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) return 'TABLET';
  if (/Mobile|iPhone|Android/i.test(userAgent)) return 'MOBILE';
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent) || hintedMobile === false) return 'DESKTOP';
  return 'UNKNOWN';
}

function cleanVersion(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.trim().replace(/[^\d._-]/g, '').slice(0, 32);
  return cleaned || null;
}

function bounded(value: string, maximum: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum);
}
