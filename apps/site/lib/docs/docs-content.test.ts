import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  docsPageOrder,
  docsPages,
  getDocsPage,
  localizeDocsText,
} from './content';
import { docsNavigation, getDocsNavigation } from './navigation';
import { searchDocs } from './search';

const docsAppUrl = new URL('../../app/docs/', import.meta.url);

test('every documentation page has one route, one navigation entry, and stable headings', async () => {
  const orderedKeys = new Set(docsPageOrder);
  const orderedHrefs = docsPageOrder.map((key) => docsPages[key].href);
  const navigationHrefs = docsNavigation.flatMap((group) =>
    group.items.map((item) => item.href),
  );

  assert.equal(orderedKeys.size, docsPageOrder.length);
  assert.equal(new Set(orderedHrefs).size, orderedHrefs.length);
  assert.deepEqual(new Set(navigationHrefs), new Set(orderedHrefs));

  await Promise.all(
    docsPageOrder.map(async (key) => {
      const page = docsPages[key];
      const route =
        page.href === '/docs'
          ? new URL('page.tsx', docsAppUrl)
          : new URL(`${page.href.slice('/docs/'.length)}/page.tsx`, docsAppUrl);
      await access(route);

      const sectionIds = page.sections.map((section) => section.id);
      assert.equal(
        new Set(sectionIds).size,
        sectionIds.length,
        `${page.href} has duplicate heading IDs`,
      );
      sectionIds.forEach((id) =>
        assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      );
    }),
  );
});

test('the internal application API is not published as a documentation product', async () => {
  const published = JSON.stringify({ docsPageOrder, docsNavigation, docsPages });

  assert.doesNotMatch(published, /\/docs\/api|Starter API notes|Starter endpoints/);
  assert.equal(searchDocs('Starter API notes', 'en').length, 0);
  assert.equal(searchDocs('API', 'en').some((result) => result.href === '/docs/api'), false);
  await assert.rejects(access(new URL('api/page.tsx', docsAppUrl)));
});

test('Platform navigation is a complete product reference with focused responsibilities', () => {
  const platform = docsNavigation.find((group) => group.title === 'Platform');
  const technicalReference = docsNavigation.find(
    (group) => group.title === 'Technical reference',
  );
  const expectedPlatformHrefs = [
    '/docs/administration',
    '/docs/reminders',
    '/docs/message-templates',
    '/docs/roles-and-permissions',
    '/docs/registrations',
    '/docs/calendar-and-events',
    '/docs/announcements-and-feed',
    '/docs/task-boards',
    '/docs/automation',
    '/docs/notifications',
    '/docs/streaks-and-engagement',
    '/docs/audit-logs',
    '/docs/encrypted-chat',
    '/docs/security',
  ];

  assert.deepEqual(
    platform?.items.map((item) => item.href),
    expectedPlatformHrefs,
  );
  assert.deepEqual(
    technicalReference?.items.map((item) => item.href),
    ['/docs/architecture', '/docs/contributing'],
  );
  assert.deepEqual(
    getDocsNavigation('fr')
      .find((group) => group.title === 'Plateforme')
      ?.items.map((item) => item.title),
    [
      'Administration',
      'Rappels',
      'Modèles de messages',
      'Rôles et permissions',
      'Inscriptions',
      'Calendrier et événements',
      'Annonces et Fil',
      'Tableaux de tâches',
      'Automatisation',
      'Notifications',
      'Séries et engagement',
      'Journaux d’audit',
      'Chat chiffré',
      'Sécurité',
    ],
  );

  const platformText = new Map(
    [
      'administration',
      'reminders',
      'messageTemplates',
      'rolesPermissions',
      'registrations',
      'calendarEvents',
      'announcementsFeed',
      'taskBoards',
      'automation',
      'notifications',
      'streaksEngagement',
      'auditLogs',
      'encryptedChat',
      'security',
    ].map((key) => [
      key,
      pageText(
        getDocsPage(key as Parameters<typeof getDocsPage>[0], 'en'),
      ).join('\n'),
    ]),
  );

  assert.match(
    platformText.get('rolesPermissions') ?? '',
    /Navigation visibility improves usability, but protected actions are still validated by the server/,
  );
  assert.match(platformText.get('registrations') ?? '', /CAPTCHA/);
  assert.match(
    platformText.get('registrations') ?? '',
    /assigns the Member role/,
  );
  assert.match(
    platformText.get('calendarEvents') ?? '',
    /Going, Maybe, and Not going/,
  );
  assert.match(platformText.get('calendarEvents') ?? '', /terminal cutoff/);
  assert.match(
    platformText.get('announcementsFeed') ?? '',
    /Email active members/,
  );
  assert.match(platformText.get('announcementsFeed') ?? '', /one level deep/);
  assert.match(
    platformText.get('taskBoards') ?? '',
    /Active.*Paused.*Completed.*Archived/s,
  );
  assert.match(
    platformText.get('automation') ?? '',
    /Success, Skipped, or Failed/,
  );
  assert.match(
    platformText.get('notifications') ?? '',
    /A toast is not a receipt/,
  );
  assert.match(
    platformText.get('streaksEngagement') ?? '',
    /community timezone/,
  );
  assert.match(
    platformText.get('auditLogs') ?? '',
    /does not claim external immutable/,
  );
  assert.match(platformText.get('encryptedChat') ?? '', /ECDH on P-256/);
  assert.match(platformText.get('encryptedChat') ?? '', /PBKDF2-SHA-256/);
  assert.match(
    platformText.get('encryptedChat') ?? '',
    /does not provide forward secrecy/,
  );
  assert.match(platformText.get('security') ?? '', /Argon2id/);

  for (const text of platformText.values()) {
    assert.doesNotMatch(
      text,
      /apps\/|repository package|route implementation|Public Site|Marketing|development phase|recent implementation|source consumer|controller\/service class|current implementation|\/docs\b/i,
    );
  }
});

test('English and French pages have matching structure and registered internal card links', () => {
  const hrefs = new Set(docsPageOrder.map((key) => docsPages[key].href));
  const acceptedSharedTerms = new Set([
    'API',
    'Admin',
    'Administration',
    'Architecture',
    'Caddy',
    'Caddyfile',
    'Communication',
    'Configuration',
    'Docker Compose',
    'Endpoint',
    'Installation',
    'Introduction',
    'Notifications',
    'Permissions',
    'Platform',
    'Port',
    'Ports',
    'Public',
    'Section',
    'Services',
    'Service',
    'Sessions',
    'Setup token',
    'Variable',
    'Volume',
    'Volumes',
    'Worker',
    'Documentation',
    'PostgreSQL',
    'POSTGRES_PASSWORD',
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'SESSION_COOKIE_NAME',
    'SETUP_TOKEN',
    'WEB_ORIGIN',
    'NEXT_PUBLIC_API_URL',
    'INTERNAL_API_URL',
    'APP_DOMAIN',
    'COMPOSE_PROJECT_NAME',
    'postgres',
    'redis',
    'api',
    'worker',
    'web',
    'caddy',
    'caddy_data, caddy_config',
    'PASSWORD_PEPPER and PASSWORD_PEPPER_PREVIOUS',
    'EMAIL_ENCRYPTION_KEY',
    'JWT_SECRET and session settings',
    'REGISTRATION_KEY_HASH_SECRET',
    'OWNER_BREAK_GLASS_SECRET',
    'PostgreSQL / Redis / uploads',
  ]);

  for (const key of docsPageOrder) {
    const english = getDocsPage(key, 'en');
    const french = getDocsPage(key, 'fr');

    assert.equal(french.href, english.href);
    assert.deepEqual(
      french.sections.map((section) => section.id),
      english.sections.map((section) => section.id),
      `${english.href} has mismatched EN/FR sections`,
    );
    assert.equal(french.sections.length, english.sections.length);
    assert.notEqual(
      french.description,
      english.description,
      `${english.href} description was not localized`,
    );

    const englishText = pageText(english);
    const frenchText = pageText(french);
    englishText.forEach((value, index) => {
      if (value === frenchText[index]) {
        assert.ok(
          acceptedSharedTerms.has(value) || isTechnicalIdentifier(value),
          `${english.href} has untranslated text: ${value}`,
        );
      }
    });

    for (const card of [...(english.cards ?? []), ...(french.cards ?? [])]) {
      assert.ok(
        hrefs.has(card.href),
        `${english.href} links to an unregistered docs page: ${card.href}`,
      );
    }
  }
});

test('new navigation copy is localized and docs components remain presentation-only', async () => {
  assert.equal(
    localizeDocsText(
      'Privacy, key recovery, devices, and encrypted media.',
      'fr',
    ),
    'Confidentialité, récupération des clés, appareils et médias chiffrés.',
  );

  const docsPageComponent = await readFile(
    new URL('../../components/docs/docs-page.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(docsPageComponent, /apiFetch|fetch\(|Prisma|socket/i);
});

test('docs entry pages separate documentation orientation from role-based onboarding', () => {
  const homeEn = getDocsPage('overview', 'en');
  const homeFr = getDocsPage('overview', 'fr');
  const gettingStartedEn = getDocsPage('gettingStarted', 'en');
  const gettingStartedFr = getDocsPage('gettingStarted', 'fr');
  const homeText = serializedPageText(homeEn);
  const gettingStartedText = serializedPageText(gettingStartedEn);
  const combinedEntryText = `${homeText}\n${gettingStartedText}`;

  assert.deepEqual(
    homeFr.sections.map((section) => section.id),
    homeEn.sections.map((section) => section.id),
  );
  assert.deepEqual(
    gettingStartedFr.sections.map((section) => section.id),
    gettingStartedEn.sections.map((section) => section.id),
  );
  assert.deepEqual(
    homeFr.cards?.map((card) => card.href),
    homeEn.cards?.map((card) => card.href),
  );
  assert.equal(homeFr.cards?.length, homeEn.cards?.length);
  assert.deepEqual(
    gettingStartedFr.cards?.map((card) => card.href),
    gettingStartedEn.cards?.map((card) => card.href),
  );
  assert.equal(gettingStartedFr.cards?.length, gettingStartedEn.cards?.length);

  assert.match(homeText, /Choose where to begin/);
  assert.match(homeText, /Set up a new community/);
  assert.match(homeText, /Administer a community/);
  assert.match(homeText, /Use the Member workspace/);
  assert.match(homeText, /Maintain or contribute/);
  assert.match(homeText, /First-run setup is completed once/);
  assert.match(
    homeText,
    /Account security and encrypted-chat recovery are separate/,
  );
  assert.doesNotMatch(
    homeText,
    /Quick command path|nano \.env|docker compose -f docker-compose\.prod\.yml/,
  );
  assert.doesNotMatch(homeText, /\/docs\/api/);

  assert.match(gettingStartedText, /New Owner/);
  assert.match(gettingStartedText, /Existing Owner or Admin/);
  assert.match(gettingStartedText, /Member:/);
  assert.match(gettingStartedText, /Maintainer:/);
  assert.match(gettingStartedText, /First steps for a new community/);
  assert.match(gettingStartedText, /Data ownership and responsibility/);
  assert.doesNotMatch(
    gettingStartedText,
    /student communities|worker communities|diaspora organizations/i,
  );
  assert.doesNotMatch(gettingStartedText, /Next\.js|NestJS|BullMQ|Caddy/);
  assert.doesNotMatch(gettingStartedText, /\/docs\/api/);

  assert.equal(
    combinedEntryText.match(/after production validation/g)?.length,
    1,
  );
});

test('operator setup pages provide verified EN/FR guidance without README shortcuts', async () => {
  const keys = [
    'installation',
    'firstRunSetup',
    'environmentVariables',
  ] as const;
  const environmentExample = await readFile(
    new URL('../../../../.env.example', import.meta.url),
    'utf8',
  );
  const expectedEnvironmentVariables = [
    ...environmentExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm),
  ].map((match) => match[1]);

  for (const key of keys) {
    const english = getDocsPage(key, 'en');
    const french = getDocsPage(key, 'fr');
    assert.deepEqual(
      pageStructure(french),
      pageStructure(english),
      `${english.href} has mismatched EN/FR content structure`,
    );
    assert.deepEqual(
      french.cards?.map((card) => card.href),
      english.cards?.map((card) => card.href),
    );
    assert.doesNotMatch(serializedPageText(english), /\/docs\/api/);
    assert.doesNotMatch(serializedPageText(french), /\/docs\/api/);
  }

  const installation = serializedPageText(getDocsPage('installation', 'en'));
  assert.doesNotMatch(
    installation,
    /nano \.env|1GB RAM plus swap|1 GB.*recommended/i,
  );
  assert.match(installation, /Verify the services/);
  assert.match(installation, /logs --tail=100 api/);
  assert.match(installation, /down -v.*removes.*named volumes/i);
  assert.match(installation, /Current deployment boundary/);

  const setup = serializedPageText(getDocsPage('firstRunSetup', 'en'));
  assert.match(setup, /When setup is available/);
  assert.match(setup, /Community foundation/);
  assert.match(setup, /Identity and access/);
  assert.match(setup, /What setup does not create/);
  assert.match(setup, /does not decrypt chat backups/);
  assert.match(setup, /one database transaction/);

  const environment = getDocsPage('environmentVariables', 'en');
  const environmentText = serializedPageText(environment);
  for (const variable of expectedEnvironmentVariables) {
    assert.match(
      environmentText,
      new RegExp(`\\b${variable}\\b`),
      `${variable} is not documented`,
    );
  }
  for (const variable of ['REALTIME_DIAGNOSTICS', 'EMAIL_DEV_LOG']) {
    assert.match(
      environmentText,
      new RegExp(`\\b${variable}\\b`),
      `${variable} advanced scope is not documented`,
    );
  }
  assert.match(environmentText, /Required production configuration/);
  assert.match(environmentText, /Recommended security configuration/);
  assert.match(
    environmentText,
    /The standard deployment configures PostgreSQL and Redis connections automatically/,
  );
  assert.match(environmentText, /browser-visible/);
  assert.match(
    environmentText,
    /Configure CAPTCHA\/Turnstile from administration settings/,
  );
  assert.match(environmentText, /Owner account recovery/);
  assert.match(environmentText, /Changing configuration later/);
  assert.match(environmentText, /Sign-in or browser requests fail/);
  assert.doesNotMatch(environmentText, /NEXT_PUBLIC_APP_ORIGIN/);
  assert.doesNotMatch(
    environmentText,
    /apps\/(?:site|web|api|worker)|Public Site|Marketing|source-level|executable consumer|current implementation|NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION|TURNSTILE_|S3_|MINIO_|QUEUE_CONCURRENCY/i,
  );
  const redactedExample = environment.sections.find(
    (section) => section.id === 'production-example',
  )?.code;
  assert.equal(redactedExample?.title, '.env (redacted production example)');
  assert.equal(redactedExample?.language, 'dotenv');
  assert.doesNotMatch(
    redactedExample?.value ?? '',
    /DATABASE_URL|REDIS_URL|INTERNAL_API_URL|API_PORT|WEB_PORT|UPLOADS_DIR|REALTIME_DIAGNOSTICS|EMAIL_DEV_LOG/,
  );
  assert.doesNotMatch(
    environmentText,
    /change-me|pe_password|AKIA[0-9A-Z]{16}|BEGIN (?:RSA |EC )?PRIVATE KEY/i,
  );
});

test('Docker Compose guide preserves the production distribution contract', () => {
  const page = getDocsPage('dockerCompose', 'en');
  const pageContent = serializedPageText(page);
  const compose = page.sections.find(
    (section) => section.id === 'production-compose-file',
  )?.code?.value;
  const caddyfile = page.sections.find((section) => section.id === 'caddyfile')
    ?.code?.value;

  assert.ok(compose, 'production compose example is missing');
  assert.ok(caddyfile, 'production Caddyfile example is missing');

  assert.match(compose, /^services:/);
  assert.doesNotMatch(compose, /^version:/m);
  assert.equal((compose.match(/^\s+build:/gm) ?? []).length, 3);
  assert.doesNotMatch(
    compose,
    /container_name:|privileged:|network_mode:\s*host|docker\.sock/,
  );
  assert.match(compose, /dockerfile: apps\/api\/Dockerfile/);
  assert.match(compose, /dockerfile: apps\/worker\/Dockerfile/);
  assert.match(compose, /dockerfile: apps\/web\/Dockerfile/);
  assert.doesNotMatch(compose, /ghcr\.io|PE_COMMUNITY_VERSION/);
  assert.equal((compose.match(/restart: unless-stopped/g) ?? []).length, 6);
  assert.match(compose, /image: postgres:16-alpine/);
  assert.match(compose, /image: redis:7-alpine/);
  assert.match(compose, /image: caddy:2-alpine/);
  assert.match(compose, /command: \["redis-server", "--appendonly", "yes"\]/);
  assert.equal((compose.match(/healthcheck:/g) ?? []).length, 3);
  assert.match(compose, /http:\/\/localhost:4000\/health/);
  assert.match(compose, /condition: service_healthy/);
  assert.doesNotMatch(compose, /prisma migrate deploy/);

  for (const volume of [
    'postgres_data',
    'redis_data',
    'uploads_data',
    'caddy_data',
    'caddy_config',
  ]) {
    assert.match(compose, new RegExp(`\\b${volume}\\b`));
    assert.match(pageContent, new RegExp(`\\b${volume}\\b`));
  }

  assert.match(compose, /"\$\{HTTP_PORT:-80\}:80"/);
  assert.match(compose, /"\$\{HTTPS_PORT:-443\}:443"/);
  assert.match(compose, /"\$\{HTTPS_PORT:-443\}:443\/udp"/);
  assert.doesNotMatch(
    compose,
    /-\s*["']?(?:5432|6379|4000|3000):(?:5432|6379|4000|3000)/,
  );

  const socketRoute = caddyfile.indexOf('handle /socket.io*');
  const apiRoute = caddyfile.indexOf('handle_path /api/v1/*');
  const uploadsRoute = caddyfile.indexOf('handle /uploads/*');
  const interfaceRoute = caddyfile.indexOf('handle {');
  assert.ok(socketRoute >= 0);
  assert.ok(socketRoute < apiRoute);
  assert.ok(apiRoute < uploadsRoute);
  assert.ok(uploadsRoute < interfaceRoute);
  assert.match(caddyfile, /reverse_proxy api:4000/);
  assert.match(caddyfile, /reverse_proxy web:3000/);

  assert.match(pageContent, /No prebuilt public container images are published/i);
  assert.match(pageContent, /docker compose -f docker-compose\.prod\.yml up -d --build/);
  assert.match(pageContent, /docker compose ps/);
  assert.match(pageContent, /docker compose logs -f/);
  assert.match(pageContent, /docker compose restart/);
  assert.match(pageContent, /docker compose stop/);
  assert.match(pageContent, /docker compose down -v/);
  assert.match(pageContent, /COMPOSE_PROJECT_NAME=pe-community/);
  assert.match(pageContent, /POSTGRES_PASSWORD=<strong-url-safe-database-password>/);
  assert.doesNotMatch(pageContent, /docker compose pull|ghcr\.io|PE_COMMUNITY_VERSION/);
  assert.match(pageContent, /migrations run automatically/i);
  assert.match(pageContent, /older image may not be compatible/i);
  assert.match(
    pageContent,
    /PostgreSQL backup does not include uploaded files/i,
  );
  assert.doesNotMatch(pageContent, /docker compose build/);
  assert.doesNotMatch(pageContent, /Docker secrets|_FILE/);
  assert.doesNotMatch(pageContent, /Next\.js|NestJS|BullMQ/);
  assert.doesNotMatch(
    pageContent,
    /Public Site|Marketing/,
  );
});

test('Configuration is an in-application Settings reference in English and French', () => {
  const english = getDocsPage('configuration', 'en');
  const french = getDocsPage('configuration', 'fr');
  const englishText = serializedPageText(english);

  assert.equal(english.href, '/docs/configuration');
  assert.deepEqual(pageStructure(french), pageStructure(english));
  assert.deepEqual(
    english.sections.map((section) => section.id),
    [
      'settings-scope',
      'general',
      'registration-and-member-access',
      'security',
      'email-delivery',
      'notifications',
      'reminders',
      'templates',
      'chat-and-media',
      'saving-and-testing',
      'permissions',
      'related-guides',
    ],
  );

  for (const field of [
    'Community slug',
    'Default language',
    'Timezone',
    'Registration entry method',
    'Member directory visibility',
    'CAPTCHA provider',
    'Require two-factor authentication',
    'SMTP host and SMTP port',
    'Admin in-app alerts',
    'Reminders',
    'Message templates',
    'Maximum active chat devices',
    'Chat attachment limit',
  ]) {
    assert.match(englishText, new RegExp(field));
  }

  assert.match(englishText, /assigned permissions/);
  assert.match(englishText, /Save changes/);
  assert.match(englishText, /Discard changes/);
  assert.match(englishText, /Test configuration/);
  assert.match(englishText, /Reset to default/);
  assert.match(englishText, /Environment variables/);
  assert.doesNotMatch(englishText, /\/setup/);
  assert.doesNotMatch(
    englishText,
    /POSTGRES_|DATABASE_URL|REDIS_URL|docker compose|apps\/|Public Site|Marketing|Next\.js|NestJS|BullMQ/,
  );
});

test('only the release consistency callout opts out of its decorative icon', async () => {
  const dockerCompose = getDocsPage('dockerCompose', 'en');
  const releaseSection = dockerCompose.sections.find(
    (section) => section.id === 'environment-file',
  );
  const iconlessCallouts = docsPageOrder.flatMap((key) =>
    docsPages[key].sections
      .filter((section) => section.callout?.showIcon === false)
      .map((section) => section.callout?.title),
  );
  const calloutComponent = await readFile(
    new URL('../../components/docs/docs-callout.tsx', import.meta.url),
    'utf8',
  );
  const pageContentComponent = await readFile(
    new URL('../../components/docs/docs-page-content.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(releaseSection?.callout?.title, 'Keep release files together');
  assert.equal(
    releaseSection?.callout?.body,
    'Build from one reviewed source release. Do not mix Dockerfiles, lockfiles, deployment configuration, or application source from different revisions.',
  );
  assert.equal(releaseSection?.callout?.showIcon, false);
  assert.deepEqual(iconlessCallouts, ['Keep release files together']);
  assert.match(calloutComponent, /showIcon = true/);
  assert.match(calloutComponent, /showIcon && <Icon/);
  assert.match(pageContentComponent, /showIcon=\{section\.callout\.showIcon\}/);
});

test('production operations guides have distinct, source-backed responsibilities', () => {
  const keys = [
    'deployment',
    'backupRestore',
    'upgrades',
    'troubleshooting',
  ] as const;

  for (const key of keys) {
    const english = getDocsPage(key, 'en');
    const french = getDocsPage(key, 'fr');
    assert.deepEqual(
      pageStructure(french),
      pageStructure(english),
      `${english.href} has mismatched EN/FR operational structure`,
    );
  }

  const deployment = operationalPageText(getDocsPage('deployment', 'en'));
  assert.match(deployment, /Before deployment/);
  assert.match(deployment, /Configure the hostname/);
  assert.match(deployment, /Create an A record/);
  assert.match(deployment, /Firewall and public ports/);
  assert.match(deployment, /80\/tcp/);
  assert.match(deployment, /443\/tcp/);
  assert.match(deployment, /automatic certificate issuance and renewal/);
  assert.match(deployment, /docker compose -f docker-compose\.prod\.yml up -d --build/);
  assert.match(deployment, /docker compose ps/);
  assert.doesNotMatch(
    deployment,
    /Production guidance deferred|web:3000|api:4000|pg_dump|logs --tail|ghcr\.io|PE_COMMUNITY_VERSION/,
  );

  const backup = operationalPageText(getDocsPage('backupRestore', 'en'));
  assert.match(backup, /PostgreSQL/);
  assert.match(backup, /Back up uploads/);
  assert.match(backup, /database backup is not complete by itself/i);
  assert.match(backup, /PASSWORD_PEPPER/);
  assert.match(backup, /EMAIL_ENCRYPTION_KEY/);
  assert.match(backup, /pg_dump/);
  assert.match(backup, /pg_restore/);
  assert.match(backup, /Restore an installation/);
  assert.match(backup, /A backup is not verified until/);
  assert.doesNotMatch(backup, /docker compose pull|APP_DOMAIN=/);

  const upgrades = operationalPageText(getDocsPage('upgrades', 'en'));
  assert.match(
    upgrades,
    /Create and verify a PostgreSQL, uploads, and configuration backup/,
  );
  assert.match(upgrades, /documented source release/);
  assert.match(upgrades, /docker compose -f docker-compose\.prod\.yml up -d --build/);
  assert.match(
    upgrades,
    /Pending database migrations are applied before the API starts accepting traffic/,
  );
  assert.match(upgrades, /older application image may not be compatible/i);
  assert.match(upgrades, /Do not assume.*complete rollback/);
  assert.doesNotMatch(
    upgrades,
    /git pull|Future GHCR|ghcr\.io|PE_COMMUNITY_VERSION|pg_dump|APP_DOMAIN=/,
  );

  const troubleshooting = operationalPageText(
    getDocsPage('troubleshooting', 'en'),
  );
  for (const symptom of [
    'Application does not open',
    'HTTPS certificate is not issued',
    'Application opens but actions fail',
    'Sign-in does not work',
    'Chat or realtime features do not connect',
    'Background jobs are not processing',
    'Email is not being sent',
    'Uploaded files are unavailable',
    'Data appears missing after redeployment',
    'Database or migration startup fails',
    'Disk space is low',
    'A service keeps restarting',
  ]) {
    assert.match(troubleshooting, new RegExp(symptom));
  }
  assert.match(troubleshooting, /\/socket\.io/);
  assert.match(troubleshooting, /outbound SMTP/);
  assert.match(troubleshooting, /COMPOSE_PROJECT_NAME/);
  assert.match(troubleshooting, /docker system df/);
  assert.doesNotMatch(
    troubleshooting,
    /docker system prune|down -v|docker compose pull|PE_COMMUNITY_VERSION=<|pg_dump/,
  );

  const sectionIds = keys.flatMap((key) =>
    getDocsPage(key, 'en').sections.map((section) => section.id),
  );
  assert.equal(new Set(sectionIds).size, sectionIds.length);

  const combined = keys
    .map((key) => operationalPageText(getDocsPage(key, 'en')))
    .join('\n');
  assert.doesNotMatch(
    combined,
    /apps\/(?:site|web|api|worker)|Public Site|Marketing|current implementation|recently added|implementation phase|monorepo/i,
  );
  for (const key of keys) {
    for (const section of getDocsPage(key, 'en').sections) {
      if (section.code) {
        assert.ok(
          section.code.language === 'shell' ||
            section.code.language === 'dotenv',
          `${key}/${section.id} is missing its supported Shiki language`,
        );
      }
    }
  }
});

test('published guide copy avoids internal implementation framing', () => {
  const publishedText = docsPageOrder
    .flatMap((key) => [
      ...pageText(getDocsPage(key, 'en')),
      ...pageText(getDocsPage(key, 'fr')),
    ])
    .join('\n');
  assert.doesNotMatch(
    publishedText,
    /apps\/(?:site|web)|Public Site|Site public|Marketing previews|aperçus marketing|source-level|executable consumer|source consumer|recent architecture/i,
  );
  assert.doesNotMatch(publishedText, /\/docs\b/);
  assert.doesNotMatch(
    publishedText,
    /AutomationCanvasView|data-automation-node-menu|marketing preview callbacks/i,
  );
});

function pageText(page: ReturnType<typeof getDocsPage>) {
  return [
    page.title,
    page.description,
    page.eyebrow ?? '',
    ...(page.cards ?? []).flatMap((card) => [card.title, card.body]),
    ...page.sections.flatMap((section) => [
      section.title,
      ...(section.body ?? []),
      ...(section.bullets ?? []),
      ...(section.callout ? [section.callout.title, section.callout.body] : []),
      ...(section.table
        ? [...section.table.headers, ...section.table.rows.flat()]
        : []),
      ...(section.diagram
        ? [section.diagram.caption, ...section.diagram.nodes]
        : []),
      ...(section.mermaid
        ? [section.mermaid.title, section.mermaid.description]
        : []),
    ]),
  ];
}

function pageStructure(page: ReturnType<typeof getDocsPage>) {
  return {
    cards: page.cards?.length ?? 0,
    sections: page.sections.map((section) => ({
      id: section.id,
      body: section.body?.length ?? 0,
      bullets: section.bullets?.length ?? 0,
      code: section.code ? { present: true, value: section.code.value } : null,
      callout: section.callout
        ? {
            variant: section.callout.variant,
            showIcon: section.callout.showIcon ?? true,
          }
        : null,
      table: section.table
        ? {
            headers: section.table.headers.length,
            rows: section.table.rows.map((row) => row.length),
          }
        : null,
      mermaid: section.mermaid
        ? {
            present: true,
            syntaxes: Object.values(section.mermaid.sources).map(
              (source) => source.split('\n', 1)[0],
            ),
          }
        : null,
    })),
  };
}

function serializedPageText(page: ReturnType<typeof getDocsPage>) {
  return JSON.stringify(page);
}

function operationalPageText(page: ReturnType<typeof getDocsPage>) {
  return [
    ...pageText(page),
    ...page.sections.flatMap((section) =>
      section.code ? [section.code.value] : [],
    ),
  ].join('\n');
}

function isTechnicalIdentifier(value: string) {
  return /^(?:GET|POST|PATCH|DELETE) \/|^[A-Z][A-Z0-9_]+$|^\d+(?:\/(?:tcp|udp))?$|^\/|^\w+:\/\/|^[a-z]+:\d+$|^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(
    value,
  );
}
