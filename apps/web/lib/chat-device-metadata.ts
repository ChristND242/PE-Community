'use client';

import { apiFetch } from './api';
import { detectClientDeviceInfo } from './chat-device-info';
import { getLocalChatDeviceIdentity, getLocalChatKey } from './chat-key-store';

export type ChatDeviceMetadataUser = {
  id: string;
  communityId: string;
};

export async function enrichCurrentChatDeviceMetadata(user: ChatDeviceMetadataUser) {
  if (typeof window === 'undefined') return false;
  const localKey = await getLocalChatKey(user.id, user.communityId);
  if (!localKey) return false;
  const identity = getLocalChatDeviceIdentity(user.id, user.communityId);
  const detected = await detectClientDeviceInfo();
  if (
    detected.deviceType === 'UNKNOWN'
    && detected.operatingSystemName === 'Unknown'
    && detected.browserName === 'Unknown'
  ) {
    return false;
  }
  const result = await apiFetch<{ changed: boolean }>('/chat/devices/me/metadata', {
    method: 'PATCH',
    headers: { 'x-chat-device-id': identity.deviceIdentifier },
    body: JSON.stringify({
      publicKey: localKey.publicKey,
      generatedLabel: detected.suggestedDisplayName,
      deviceType: detected.deviceType,
      operatingSystemName: detected.operatingSystemName,
      operatingSystemVersion: detected.operatingSystemVersion,
      browserName: detected.browserName,
      browserVersion: detected.browserVersion,
    }),
  });
  return result.changed;
}
