import assert from 'node:assert/strict';
import test from 'node:test';
import { getDocsPage } from './content';

function pageText(key: 'reminders' | 'messageTemplates', lang: 'en' | 'fr' = 'en') {
  const page = getDocsPage(key, lang);
  return [
    page.title,
    page.description,
    ...(page.cards ?? []).flatMap((card) => [card.title, card.body]),
    ...page.sections.flatMap((section) => [
      section.title,
      ...(section.body ?? []),
      ...(section.bullets ?? []),
      ...(section.callout ? [section.callout.title, section.callout.body] : []),
      ...(section.table ? [...section.table.headers, ...section.table.rows.flat()] : []),
    ]),
  ].join('\n');
}

test('Reminders documents every control and the verified manual execution model', () => {
  const text = pageText('reminders');
  const controls = [
    'Birthday reminders',
    'Advance reminder days before',
    'Send day-of birthday notification',
    'Notify all active members about birthdays',
    'Enable membership anniversary reminders',
    'Send day-of anniversary notification',
    'Enable passport expiration reminders',
    'Notify member',
    'Notify admins',
    'Email reminders',
    'First notice / Second notice / Final notice',
    'Day-of expiration reminder',
  ];

  controls.forEach((control) => assert.match(text, new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  assert.match(text, /Run due reminders performs the complete check/);
  assert.match(text, /no automatic schedule/);
  assert.match(text, /exactly matches a configured offset/);
  assert.match(text, /community timezone is not used/);
  assert.match(text, /does not sweep overdue or missed windows/);
  assert.match(text, /already created.*is skipped/s);
  assert.match(text, /successful all-zero summary/);
  assert.match(text, /Background email delivery has its own retry/);
  assert.match(text, /Birthday due:/);
  assert.match(text, /Nothing due:/);
  assert.match(text, /Birthday disabled:/);
  assert.match(text, /Passport already processed:/);
});

test('Message templates documents inventories and every non-obvious editor action', () => {
  const text = pageText('messageTemplates');
  const transactionalTemplates = [
    'Password reset email',
    'Registration invite email',
    'Email change verification',
    'Email change request notice',
    'Email change completion notice',
    'Registration acknowledgement',
    'Pending registration reminder',
    'Existing-account registration notice',
    'Registration policy guidance',
  ];
  const reminderTemplates = [
    'Birthday in-app notification',
    'Birthday day in-app notification',
    'Anniversary in-app notification',
    'Anniversary day in-app notification',
    'Passport expiration in-app notification',
    'Passport expiration email',
  ];

  [...transactionalTemplates, ...reminderTemplates].forEach((name) => assert.match(text, new RegExp(name)));
  assert.match(text, /Task due soon.*Overdue task escalation/s);
  assert.match(text, /Hello \{\{recipientName\}\}/);
  assert.match(text, /Preview shows Hello Exaud/);
  assert.match(text, /do not paste resetUrl.*passwordRecoveryUrl/s);
  assert.match(text, /Preview versus Send test/);
  assert.match(text, /current unsaved draft/);
  assert.match(text, /signed-in administrator’s account email/);
  assert.match(text, /Messages already queued keep the rendered content/);
  assert.match(text, /Discard changes/);
  assert.match(text, /reminder reset persists immediately/);
  assert.match(text, /transactional email reset remains a draft/);
});

test('English and French Settings guides keep the same task structure', () => {
  for (const key of ['reminders', 'messageTemplates'] as const) {
    const english = getDocsPage(key, 'en');
    const french = getDocsPage(key, 'fr');
    assert.deepEqual(
      french.sections.map((section) => section.id),
      english.sections.map((section) => section.id),
    );
    assert.equal(french.cards?.length, english.cards?.length);
    assert.notEqual(pageText(key, 'fr'), pageText(key, 'en'));
  }
});
