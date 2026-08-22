import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL('./profile-social-links.tsx', import.meta.url);
const displayUrl = new URL('./profile-link-display.tsx', import.meta.url);
const comboboxUrl = new URL('./profile-platform-combobox.tsx', import.meta.url);
const catalogUrl = new URL('../lib/profile-links.ts', import.meta.url);
const memberProfileUrl = new URL('../app/dashboard/profile/page.tsx', import.meta.url);
const adminProfileUrl = new URL('../app/admin/profile/admin-profile-form.tsx', import.meta.url);
const adminMemberUrl = new URL('../app/admin/members/[id]/page.tsx', import.meta.url);
const directoryProfileUrl = new URL('../app/dashboard/members/[id]/page.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('profile social links provide identifier-aware collection management', async () => {
  const [component, catalog] = await Promise.all([readFile(componentUrl, 'utf8'), readFile(catalogUrl, 'utf8')]);
  assert.match(component, /useState\(false\)/);
  assert.match(component, /aria-expanded=\{addOpen\}/);
  assert.match(component, /addOpen &&/);
  assert.match(component, /ProfilePlatformCombobox/);
  assert.match(component, /platform\.allowMultiple \|\| !used/);
  assert.match(component, /draft\.platform === 'OTHER'/);
  assert.match(component, /identifier: normalizeProfileIdentifier/);
  assert.match(component, /definition\.inputKind === 'IDENTIFIER'/);
  assert.match(component, /JSON\.stringify\(profileLinkPayload/);
  assert.doesNotMatch(component, /JSON\.stringify\(draft\)/);
  assert.match(component, /<ConfirmDialog/);
  assert.match(component, /orderedIds: positioned\.map/);
  assert.match(component, /commit\(previous\)/);
  assert.match(component, /if \(busy\) return/);
  assert.match(catalog, /allowMultiple: true/);
  assert.match(catalog, /FaLinkedinIn/);
  assert.match(catalog, /SiGithub/);
  assert.match(catalog, /DISCORD[\s\S]*?profileLinkPreviewHref/);
  for (const platform of ['WEBSITE', 'LINKEDIN', 'X', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK', 'GITHUB', 'GITLAB', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'MASTODON', 'THREADS', 'BLUESKY', 'OTHER']) assert.match(catalog, new RegExp(`value: '${platform}'`));
});

test('platform selector is portaled, searchable, keyboard navigable, and uses the shared brand map', async () => {
  const combobox = await readFile(comboboxUrl, 'utf8');
  assert.match(combobox, /createPortal/);
  assert.match(combobox, /document\.body/);
  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /role="listbox"/);
  assert.match(combobox, /ArrowDown/);
  assert.match(combobox, /Escape/);
  assert.match(combobox, /position: fixed|className="fixed/);
});

test('fixed Website LinkedIn Twitter editors are replaced across profile management surfaces', async () => {
  const [member, admin, adminMember] = await Promise.all([readFile(memberProfileUrl, 'utf8'), readFile(adminProfileUrl, 'utf8'), readFile(adminMemberUrl, 'utf8')]);
  for (const source of [member, admin, adminMember]) {
    assert.match(source, /<ProfileSocialLinks/);
    assert.doesNotMatch(source, /updateField\('(website|linkedin|twitter)'/);
    assert.doesNotMatch(source, /website: form\.website|linkedin: form\.linkedin|twitter: form\.twitter/);
  }
  assert.match(adminMember, /canManage=\{canUpdateMembers\}/);
});

test('directory rendering uses backend-derived safe external links', async () => {
  const [page, display] = await Promise.all([readFile(directoryProfileUrl, 'utf8'), readFile(displayUrl, 'utf8')]);
  assert.match(page, /member\.profileLinks/);
  assert.doesNotMatch(page, /Object\.entries\(member\?\.profile\?\.socialLinks/);
  assert.match(display, /target="_blank"/);
  assert.match(display, /rel="noopener noreferrer nofollow"/);
  assert.match(display, /link\.href/);
  assert.doesNotMatch(display, /href=\{link\.url\}/);
  assert.doesNotMatch(display, /dangerouslySetInnerHTML/);
});

test('profile-link identifier controls and platform labels are bilingual', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');
  for (const value of ['Add social link', 'Username or handle', 'Enter only the username, not the full profile URL.', 'Search platforms...', 'Ajouter un lien social', 'Nom d’utilisateur ou identifiant', 'Saisissez uniquement le nom d’utilisateur, et non l’URL complète du profil.', 'Rechercher des plateformes...']) assert.match(i18n, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
