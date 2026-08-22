import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILT_IN_EMAIL_TEMPLATES, EMAIL_LOCALES, EMAIL_TEMPLATE_KEYS, renderLocalizedTemplate, renderTemplateEmail } from '@pe/shared';
import { DEFAULT_EMAIL_LOGO_URL, renderAnnouncementEmail, renderBrandedEmail, renderEmailConfigurationTest, renderPasswordResetEmail, renderRegistrationInviteEmail, safeEmailImageUrl, safeEmailUrl } from './email-template';
import { editableTemplateRequiredVariables, emailTemplatePreviewContext, emailTemplateUsesLayoutAction, messageTemplateDefinition } from '../message-templates';

const syntheticUrl = 'https://community.example.test/reset-password?token=synthetic-token';

test('renders the shared branded HTML and plain-text alternatives', () => {
  const rendered = renderBrandedEmail({
    subject: 'Configuration test',
    title: 'Email configuration is working',
    body: 'PE Community can send email.',
    previewText: 'Configuration confirmed.',
    communityName: 'Example Community',
    locale: 'en',
    now: new Date('2026-07-22T00:00:00Z'),
  });

  assert.match(rendered.html, /<!doctype html>/i);
  assert.match(rendered.html, /PE Community/);
  assert.equal(DEFAULT_EMAIL_LOGO_URL, '');
  assert.doesNotMatch(rendered.html, /<img[^>]+alt="PE Community"/);
  assert.match(rendered.html, /font-size:20px;font-weight:700;line-height:1\.3;">PE Community<\/div>/);
  assert.match(rendered.html, /background:#ffffff;border:1px solid #e5e7eb/);
  assert.match(rendered.html, /Configuration confirmed\./);
  assert.match(rendered.html, /This is an automated message/);
  assert.match(rendered.html, /&copy; 2026 PE Community/);
  assert.match(rendered.text, /Email configuration is working/);
  assert.match(rendered.text, /© 2026 PE Community/);
});

test('renders an action anchor, fallback URL, and matching plain text', () => {
  const rendered = renderBrandedEmail({
    subject: 'Reset password',
    title: 'Reset your password',
    body: 'Choose a new password.',
    action: { label: 'Reset password', url: syntheticUrl },
    expiryText: 'This link expires in 45 minutes.',
    locale: 'en',
  });

  assert.match(rendered.html, /<a href="https:\/\/community\.example\.test\/reset-password\?token=synthetic-token"/);
  assert.match(rendered.html, /word-break:break-all/);
  assert.equal(rendered.html.match(/synthetic-token/g)?.length, 3);
  assert.match(rendered.text, new RegExp(syntheticUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(rendered.text.match(/synthetic-token/g)?.length, 1);
});

test('escapes dynamic content and omits unsafe action URLs', () => {
  const rendered = renderBrandedEmail({
    subject: 'Unsafe <subject>',
    title: '<img src=x onerror=alert(1)>',
    body: 'Hello <script>alert("x")</script> & goodbye',
    communityName: 'A&B "Community"',
    action: { label: 'Open', url: 'javascript:alert(1)' },
    locale: 'en',
  });

  assert.doesNotMatch(rendered.html, /<script>|<img src=x|href="javascript:/);
  assert.match(rendered.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; goodbye/);
  assert.match(rendered.html, /A&amp;B &quot;Community&quot;/);
  assert.equal(safeEmailUrl('data:text/html,test'), null);
  assert.equal(safeEmailUrl('vbscript:msgbox(1)'), null);
  assert.equal(safeEmailUrl(syntheticUrl), syntheticUrl);
  assert.equal(safeEmailImageUrl('http://localhost/logo.svg'), null);
  assert.equal(safeEmailImageUrl('file:///tmp/logo.svg'), null);
  assert.equal(safeEmailImageUrl('data:image/svg+xml,test'), null);
  assert.equal(safeEmailImageUrl(DEFAULT_EMAIL_LOGO_URL), null);
});

test('renders French shared labels and retains plain-text branding', () => {
  const rendered = renderBrandedEmail({
    subject: 'Invitation',
    title: 'Invitation à rejoindre la communauté',
    body: 'Votre invitation est prête.',
    locale: 'fr',
    action: { label: 'Consulter l’invitation', url: 'http://localhost:3000/register?token=test' },
  });

  assert.match(rendered.html, /Si le bouton ne fonctionne pas/);
  assert.match(rendered.html, /font-size:20px;font-weight:700;line-height:1\.3;">PE Community<\/div>/);
  assert.match(rendered.text, /Ceci est un message automatique/);
  assert.match(rendered.text, /PE Community/);
  assert.doesNotMatch(rendered.text, /raw\.githubusercontent\.com/);
});

test('test, reset, registration, and announcement templates all use the shared shell', () => {
  const templates = [
    renderEmailConfigurationTest({ communityName: 'Example Community' }),
    renderPasswordResetEmail({ communityName: 'Example Community', memberName: 'Taylor', resetUrl: syntheticUrl }),
    renderRegistrationInviteEmail({ communityName: 'Example Community', inviteUrl: syntheticUrl }),
    renderAnnouncementEmail({ communityName: 'Example Community', title: '<Important update>', body: '<b>Untrusted announcement</b>' }),
  ];

  for (const rendered of templates) {
    assert.match(rendered.html, /background:#ffffff;border:1px solid #e5e7eb/);
    assert.doesNotMatch(rendered.html, /<img[^>]+alt="PE Community"/);
    assert.match(rendered.html, /font-size:20px;font-weight:700;line-height:1\.3;">PE Community<\/div>/);
    assert.match(rendered.html, /This is an automated message/);
    assert.match(rendered.text, /PE Community/);
    assert.doesNotMatch(rendered.html, /file:\/\/|cid:/);
  }
  assert.match(templates[1].html, />Reset password</);
  assert.match(templates[1].text, new RegExp(syntheticUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(templates[2].html, />Review invitation</);
  assert.doesNotMatch(templates[3].html, /<b>Untrusted/);
  assert.match(templates[3].html, /&lt;b&gt;Untrusted announcement&lt;\/b&gt;/);
});

test('every registered email template has complete English and French variants', () => {
  for (const key of EMAIL_TEMPLATE_KEYS) {
    for (const locale of EMAIL_LOCALES) {
      const template = BUILT_IN_EMAIL_TEMPLATES[key][locale];
      assert.equal(template.templateKey, key);
      assert.equal(template.locale, locale);
      assert.ok(template.subject.trim());
      assert.ok(template.heading.trim());
      assert.ok(template.body.trim());
      assert.ok(Array.isArray(template.requiredVariables));
    }
  }
});

test('email-change verification preview uses its layout-owned action URL', () => {
  for (const locale of EMAIL_LOCALES) {
    const template = messageTemplateDefinition('EMAIL_CHANGE_VERIFY_NEW_ADDRESS', locale);
    const preview = emailTemplatePreviewContext('EMAIL_CHANGE_VERIFY_NEW_ADDRESS');

    assert.ok(template);
    assert.equal(emailTemplateUsesLayoutAction(template), true);
    assert.ok(template.buttonLabel?.trim());
    assert.equal(editableTemplateRequiredVariables(template).includes('verificationUrl'), false);
    assert.doesNotMatch(template.body, /\{\{\s*verificationUrl\s*\}\}/);
    assert.equal(new URL(String(preview.variables.verificationUrl)).protocol, 'https:');
    assert.equal(preview.actionUrl, preview.variables.verificationUrl);

    const rendered = renderTemplateEmail(template, preview.variables, {
      communityName: 'PE Community',
      actionUrl: preview.actionUrl,
    });
    assert.match(rendered.html, /verify-email-change\?token=preview/);
    assert.match(rendered.text, /verify-email-change\?token=preview/);
    assert.match(rendered.html, locale === 'fr' ? /Bonjour Exaud/ : /Hello Exaud/);
  }
});

test('localized rendering validates required variables and never resolves fragments from another locale', () => {
  const french = BUILT_IN_EMAIL_TEMPLATES.password_reset_email.fr;
  const rendered = renderLocalizedTemplate(french, {
    communityName: 'PE Community',
    recipientName: 'Camille',
    resetUrl: syntheticUrl,
    expiresInMinutes: 45,
  });
  assert.equal(rendered.locale, 'fr');
  assert.match(rendered.greeting ?? '', /^Bonjour/);
  assert.doesNotMatch(Object.values(rendered).join('\n'), /Hello |Reset password|If the button/);
  assert.throws(() => renderLocalizedTemplate(french, { recipientName: 'Camille' }), /Missing required email template variable/);
});

test('shared shell has conservative mobile rules and keeps the footer in the responsive column', () => {
  const rendered = renderPasswordResetEmail({ communityName: 'Example Community', memberName: 'Camille', resetUrl: syntheticUrl, locale: 'fr' });
  assert.match(rendered.html, /max-width:620px/);
  assert.match(rendered.html, /max-width:480px/);
  assert.match(rendered.html, /\.email-outer\{padding:20px 8px!important\}/);
  assert.match(rendered.html, /\.email-button\{display:block!important/);
  assert.match(rendered.html, /word-break:break-all;overflow-wrap:anywhere/);
  assert.ok(rendered.html.indexOf('class="email-shell"') < rendered.html.indexOf('class="email-footer"'));
  assert.ok(rendered.html.indexOf('class="email-footer"') < rendered.html.lastIndexOf('</table>'));
  assert.doesNotMatch(rendered.html, /height:100vh|min-height:100vh/);
});
