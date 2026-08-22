import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { userRoleLabel } from './user-role';

const english = {
  status: {
    owner: 'Owner',
    admin: 'Admin',
    member: 'Member',
  },
};

const french = {
  status: {
    owner: 'Propriétaire',
    admin: 'Administrateur',
    member: 'Membre',
  },
};

test('confirmed canonical roles resolve to professional English labels', () => {
  assert.equal(userRoleLabel(english, 'OWNER'), 'Owner');
  assert.equal(userRoleLabel(english, 'ADMIN'), 'Admin');
  assert.equal(userRoleLabel(english, 'MEMBER'), 'Member');
  assert.equal(userRoleLabel(english, 'owner'), 'Owner');
});

test('confirmed canonical roles resolve to professional French labels', () => {
  assert.equal(userRoleLabel(french, 'OWNER'), 'Propriétaire');
  assert.equal(userRoleLabel(french, 'ADMIN'), 'Administrateur');
  assert.equal(userRoleLabel(french, 'MEMBER'), 'Membre');
});

test('language changes update labels without mutating canonical roles', () => {
  const role = 'OWNER';
  assert.equal(userRoleLabel(english, role), 'Owner');
  assert.equal(userRoleLabel(french, role), 'Propriétaire');
  assert.equal(role, 'OWNER');
});

test('unknown and missing roles use the established safe fallback', () => {
  assert.equal(userRoleLabel(french, 'COMMUNITY_LEAD'), 'COMMUNITY_LEAD');
  assert.equal(userRoleLabel(french, null), '');
});

test('Chat participant badges use the shared resolver and never render raw role enums', async () => {
  const [chatSource, i18nSource] = await Promise.all([
    readFile(new URL('../components/chat-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./i18n.tsx', import.meta.url), 'utf8'),
  ]);

  assert.equal(
    (chatSource.match(/userRoleLabel\(t, participant\.role\)/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(chatSource, /\{participant\.role\}/);
  assert.match(i18nSource, /owner: 'Propriétaire'/);
  assert.match(i18nSource, /admin: 'Administrateur'/);
  assert.match(i18nSource, /member: 'Membre'/);
});
