import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createNotificationDiagramSource,
  createOwnershipDiagramSource,
  type NotificationDiagramLabels,
  type OwnershipDiagramLabels,
} from './marketing-mermaid-sources';

const ownershipLabels: OwnershipDiagramLabels = {
  environment: 'YOUR ENVIRONMENT',
  members: 'Members',
  administrators: 'Administrators',
  web: 'Web',
  api: 'API',
  postgresql: 'PostgreSQL',
  worker: 'Worker',
  redis: 'Redis',
  uploads: 'Uploads',
  smtpProvider: 'SMTP provider',
  diagramTitle: 'Operator-controlled environment',
  diagramDescription: 'Operator-controlled services and data with configured email delivery.',
  unavailable: 'Infrastructure flow unavailable.',
};

const notificationLabels: NotificationDiagramLabels = {
  communityAction: 'Community activity',
  notificationCreated: 'Notification created',
  queue: 'Queue',
  worker: 'Worker',
  inApp: 'In-app notification',
  emailProvider: 'Email provider',
  deliveryStatus: 'Delivery status',
  optionalEmail: 'Email enabled?',
  diagramTitle: 'Community notification journey',
  diagramDescription: 'Queued background delivery with optional email.',
  unavailable: 'Delivery flow unavailable.',
};

function animationIds(source: string) {
  return [...source.matchAll(/^\s*([a-z][a-zA-Z]+)@\{ animation: (fast|slow) \}$/gm)].map(
    ([, id, speed]) => ({ id, speed }),
  );
}

test('Data ownership uses a truthful animated Mermaid boundary', () => {
  const source = createOwnershipDiagramSource(ownershipLabels);
  const portraitSource = createOwnershipDiagramSource(ownershipLabels, 'portrait');
  const environmentStart = source.indexOf('subgraph Environment');
  const environmentEnd = source.indexOf('\n  end');
  const provider = source.indexOf('Provider["SMTP provider"]');

  assert.match(source, /^flowchart LR/);
  assert.match(source, /subgraph Environment[\s\S]*direction LR/);
  assert.match(portraitSource, /^flowchart TB/);
  assert.match(portraitSource, /subgraph Environment[\s\S]*direction TB/);
  assert.ok(environmentStart > 0);
  assert.ok(environmentEnd > environmentStart);
  assert.ok(provider > environmentEnd, 'SMTP provider must remain outside the environment');
  for (const label of ['Web', 'API', 'PostgreSQL', 'Uploads', 'Redis', 'Worker']) {
    const position = source.indexOf(label, environmentStart);
    assert.ok(position > environmentStart && position < environmentEnd, `${label} is outside the environment`);
  }

  assert.match(source, /People requestToWeb@--> Web/);
  assert.match(source, /Worker deliverEmail@--> Provider/);
  assert.match(source, /requestToWeb@\{ animation: slow \}/);
  assert.match(source, /webToApi@\{ animation: fast \}/);
  assert.match(source, /enqueueJob@\{ animation: fast \}/);
  assert.match(source, /queueToWorker@\{ animation: fast \}/);
  assert.match(source, /deliverEmail@\{ animation: fast \}/);
  assert.doesNotMatch(source, /(?:Database|Uploads)@\{ animation:/);
});

test('Notification journey distinguishes persistent, queued, and optional delivery', () => {
  const source = createNotificationDiagramSource(notificationLabels);
  const portraitSource = createNotificationDiagramSource(notificationLabels, 'portrait');
  const animations = animationIds(source);

  assert.match(source, /^flowchart LR/);
  assert.match(portraitSource, /^flowchart TB/);
  assert.match(source, /Community activity/);
  assert.match(source, /Notification created/);
  assert.match(source, /Queue/);
  assert.match(source, /Worker/);
  assert.match(source, /In-app notification/);
  assert.match(source, /Email enabled\?/);
  assert.match(source, /Email provider/);
  assert.match(source, /Delivery status/);
  assert.ok(animations.some(({ speed }) => speed === 'slow'));
  assert.ok(animations.some(({ speed }) => speed === 'fast'));
  assert.match(source, /Created inAppDelivery@--> InApp/);
  assert.match(source, /InApp --> Status/);
  assert.match(source, /Created enqueueEmail@-.->|Email enabled\?| Queue/);
  assert.match(source, /Queue workerHandoff@--> Worker/);
  assert.doesNotMatch(source, /Optional\{|Status@\{ animation:|Provider --> Status[^\n]*@/);
});

test('Marketing reuses one Mermaid engine with a visual-first card layout', async () => {
  const [trustSection, sharedComponent, renderer, config, globals, sitePackage, i18n] =
    await Promise.all([
      readFile(new URL('./platform-trust-section.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../mermaid-diagram.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../lib/docs/mermaid-renderer.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../lib/docs/mermaid-config.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../app/globals.css', import.meta.url), 'utf8'),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../../lib/i18n.tsx', import.meta.url), 'utf8'),
    ]);

  assert.match(trustSection, /presentation="marketing"/);
  assert.doesNotMatch(trustSection, /site-delivery-status/);
  assert.doesNotMatch(trustSection, /InfrastructureNode|NotificationQueueRow/);
  assert.doesNotMatch(trustSection, /setTimeout|notification-\$\{|NOTIFICATION_QUEUE_TIMESTAMPS/);
  assert.match(trustSection, /visualFirst = id === 'notifications' \|\| id === 'ownership'/);
  assert.match(
    trustSection,
    /xl:grid-cols-\[minmax\(0,0\.72fr\)_minmax\(0,1\.28fr\)\]/,
  );
  assert.match(
    trustSection,
    /2xl:grid-cols-\[minmax\(0,0\.68fr\)_minmax\(0,1\.32fr\)\]/,
  );
  assert.match(trustSection, /xl:min-h-\[clamp\(520px,calc\(100dvh-180px\),620px\)\]/);
  assert.equal((trustSection.match(/max-w-\[760px\]/g) ?? []).length, 2);
  assert.match(trustSection, /card\.points\.length > 0/);
  assert.equal((i18n.match(/points: \[\],/g) ?? []).length, 4);
  assert.doesNotMatch(
    i18n,
    /points: \['Queued delivery', 'Background processing', 'Delivery status', 'Email notifications', 'Operational visibility'\]/,
  );
  assert.doesNotMatch(
    i18n,
    /points: \['Web and API', 'Operational services', 'Community data', 'Background processing', 'Provider choice'\]/,
  );
  assert.match(sharedComponent, /marketing \? 'sr-only'/);
  assert.match(sharedComponent, /site-marketing-mermaid-output/);
  assert.match(sharedComponent, /site-marketing-mermaid relative w-full overflow-visible py-2/);
  assert.doesNotMatch(
    sharedComponent,
    /site-marketing-mermaid relative[^'\n]*(?:rounded|border|bg-|shadow|p-[345678])/,
  );
  assert.match(
    sharedComponent,
    /docs-mermaid mt-6 overflow-hidden rounded-xl border[^'\n]*bg-white[^'\n]*p-4/,
  );
  assert.equal((renderer.match(/await import\('mermaid'\)/g) ?? []).length, 1);
  assert.equal((renderer.match(/mermaid\.initialize/g) ?? []).length, 1);
  assert.match(renderer, /return \{ svg: result\.svg \}/);
  assert.doesNotMatch(renderer, /replace\([^\n]*viewBox|removeAttribute\(['"]viewBox/);
  assert.match(config, /presentation === 'marketing'/);
  assert.match(config, /marketingThemeVariables/);
  assert.equal((config.match(/fontSize: '16px'/g) ?? []).length, 2);
  assert.match(config, /diagramPadding: 2/);
  assert.match(config, /nodeSpacing: 54/);
  assert.match(config, /rankSpacing: 38/);
  assert.match(config, /padding: 20/);
  assert.match(config, /subGraphTitleMargin: \{[\s\S]*top: 10,[\s\S]*bottom: 14,/);
  assert.match(config, /wrappingWidth: 132/);
  assert.match(config, /presentation === 'marketing'[\s\S]*sharedConfig\.flowchart/);
  assert.match(globals, /html:not\(\.dark\) \.site-marketing-mermaid/);
  assert.match(globals, /\.site-marketing-mermaid-output/);
  assert.match(globals, /\.site-marketing-mermaid[\s\S]*background: transparent/);
  assert.match(globals, /\.site-marketing-mermaid[\s\S]*box-shadow: none/);
  assert.match(globals, /\.site-marketing-mermaid-viewport[\s\S]*min-height: 0/);
  assert.doesNotMatch(globals, /height: clamp\(340px, 34vw, 460px\)/);
  assert.doesNotMatch(globals, /site-marketing-mermaid[^}]*transform:\s*scale|site-marketing-mermaid[^}]*zoom:/);
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globals, /\.site-mermaid-output \.edge-animation-fast/);
  assert.match(globals, /stroke-dasharray: none !important/);
  assert.doesNotMatch(trustSection, /from ['"](?:framer-motion|gsap|anime\.js|lottie|motion)['"]/);
  assert.match(trustSection, /useState<MarketingDiagramOrientation>\('landscape'\)/);
  assert.match(trustSection, /window\.matchMedia\('\(max-width: 639px\)'\)/);
  assert.match(trustSection, /createNotificationDiagramSource\(labels, orientation\)/);
  assert.match(trustSection, /createOwnershipDiagramSource\(labels, orientation\)/);
  assert.match(sitePackage, /"mermaid": "\^11\.16\.1"/);
});
