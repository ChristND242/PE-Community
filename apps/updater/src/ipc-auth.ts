import { createHmac, timingSafeEqual } from 'node:crypto';
import { UPDATER_PROTOCOL_VERSION } from './domain.js';

export type SignedUpdaterRequest = {
  protocol: string;
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  contentDigest: string;
};

export function updaterSignature(secret: string, request: SignedUpdaterRequest) {
  return createHmac('sha256', secret)
    .update(
      `PE_COMMUNITY_UPDATER\n${request.protocol}\n${request.method}\n${request.path}\n${request.timestamp}\n${request.nonce}\n${request.contentDigest}`,
    )
    .digest('hex');
}

export function updaterSignatureMatches(
  secrets: readonly string[],
  request: SignedUpdaterRequest,
  signature: string,
) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const supplied = Buffer.from(signature, 'hex');
  let matched = false;
  for (const secret of secrets) {
    const expected = Buffer.from(updaterSignature(secret, request), 'hex');
    matched = timingSafeEqual(supplied, expected) || matched;
  }
  return matched;
}

export function signedRequestMetadataValid(
  request: SignedUpdaterRequest,
  now = Date.now(),
) {
  return (
    request.protocol === String(UPDATER_PROTOCOL_VERSION) &&
    /^\d{13}$/.test(request.timestamp) &&
    Math.abs(now - Number(request.timestamp)) <= 30_000 &&
    /^[a-f0-9]{64}$/.test(request.nonce) &&
    /^[a-f0-9]{64}$/.test(request.contentDigest) &&
    ['GET', 'POST'].includes(request.method) &&
    request.path.startsWith('/v1/') &&
    request.path.length <= 512
  );
}
