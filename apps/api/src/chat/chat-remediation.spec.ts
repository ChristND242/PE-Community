import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';

const user = { id: 'user-1', communityId: 'community-1', role: 'MEMBER' };
const encryptedPayload = {
  conversationId: 'conversation-1',
  encryptedPayload: 'ciphertext',
  encryptionNonce: 'nonce',
  encryptionAlgorithmVersion: 'ECDH-P256-AES-GCM-v1',
  encryptionKeyVersion: '1',
  senderKeyVersionId: 'sender-key',
  recipientKeyVersionId: 'recipient-key',
};

function gatewayHarness(createMessage: () => Promise<unknown>) {
  const roomEvents: Array<{ event: string; payload: unknown }> = [];
  const clientEvents: Array<{ event: string; payload: unknown }> = [];
  const chat = { createMessage };
  const gateway = new ChatGateway({
    cookieName: 'session',
    revalidateUserSession: async () => user,
  } as never, chat as never);
  Object.defineProperty(gateway, 'server', {
    value: {
      to: () => ({ emit: (event: string, payload: unknown) => roomEvents.push({ event, payload }) }),
    },
  });
  const client = {
    id: 'socket-1',
    data: { user, joinedConversationIds: new Set(['conversation-1']) },
    emit: (event: string, payload: unknown) => clientEvents.push({ event, payload }),
  };
  return { gateway, client, roomEvents, clientEvents };
}

test('encrypted send acknowledges only after service acceptance and room delivery', async () => {
  const message = { id: 'message-1', ...encryptedPayload };
  const harness = gatewayHarness(async () => ({ message }));
  let acknowledgement: { message?: unknown; error?: string } | undefined;
  await harness.gateway.sendMessage(
    harness.client as never,
    encryptedPayload,
    (response) => { acknowledgement = response; },
  );
  assert.deepEqual(acknowledgement, { message });
  assert.deepEqual(harness.roomEvents, [{ event: 'chat:message:new', payload: message }]);
});

test('encrypted send rejection returns a safe machine code and no success event', async () => {
  const harness = gatewayHarness(async () => { throw new ConflictException('CHAT_SENDER_KEY_REQUIRED'); });
  let acknowledgement: { message?: unknown; error?: string } | undefined;
  await harness.gateway.sendMessage(
    harness.client as never,
    encryptedPayload,
    (response) => { acknowledgement = response; },
  );
  assert.deepEqual(acknowledgement, { error: 'CHAT_SENDER_KEY_REQUIRED' });
  assert.equal(harness.roomEvents.length, 0);
  assert.deepEqual(harness.clientEvents[0], {
    event: 'chat:error',
    payload: { code: 'message_rejected', message: 'Encrypted message could not be sent.', conversationId: undefined },
  });
});

test('encrypted send without a joined conversation is rejected through acknowledgement', async () => {
  const harness = gatewayHarness(async () => { throw new Error('must not be called'); });
  harness.client.data.joinedConversationIds.clear();
  let acknowledgement: { message?: unknown; error?: string } | undefined;
  await harness.gateway.sendMessage(
    harness.client as never,
    encryptedPayload,
    (response) => { acknowledgement = response; },
  );
  assert.deepEqual(acknowledgement, { error: 'conversation_not_joined' });
  assert.equal(harness.roomEvents.length, 0);
});
