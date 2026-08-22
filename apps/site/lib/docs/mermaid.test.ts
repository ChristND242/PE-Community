import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getDocsPage } from './content';
import { getDocsMermaidConfig } from './mermaid-config';

const architectureDiagramIds = [
  'components',
  'request-flow',
  'setup-flow',
  'background-jobs',
  'notification-flow',
  'automation-flow',
  'chat-boundary',
] as const;

const animatedArchitectureIds = [
  'request-flow',
  'background-jobs',
  'notification-flow',
  'automation-flow',
] as const;

const staticArchitectureIds = [
  'components',
  'setup-flow',
  'chat-boundary',
] as const;

function animationIds(source: string) {
  return [...source.matchAll(/^\s*([a-z][a-zA-Z]+)@\{ animation: (fast|slow) \}$/gm)].map(
    ([, id, speed]) => ({ id, speed }),
  );
}

test('Architecture uses seven bilingual Mermaid diagrams instead of manual flow cards', () => {
  const english = getDocsPage('architecture', 'en');
  const french = getDocsPage('architecture', 'fr');
  const syntaxCounts = new Map<string, number>();

  assert.deepEqual(
    english.sections.map((section) => section.id),
    architectureDiagramIds,
  );

  for (const id of architectureDiagramIds) {
    const englishSection = english.sections.find((section) => section.id === id);
    const frenchSection = french.sections.find((section) => section.id === id);
    assert.ok(englishSection?.mermaid, `${id} is missing its Mermaid diagram`);
    assert.ok(frenchSection?.mermaid, `${id} is missing its French diagram`);
    assert.equal(englishSection.diagram, undefined);
    assert.equal(frenchSection.diagram, undefined);

    for (const source of Object.values(englishSection.mermaid.sources)) {
      const syntax = source.split('\n', 1)[0];
      syntaxCounts.set(syntax, (syntaxCounts.get(syntax) ?? 0) + 1);
      assert.match(source, /\n\s+accTitle:/);
      assert.match(source, /\n\s+accDescr:/);
      assert.doesNotMatch(source, /\bclick\b|<\/?(?:script|iframe|foreignObject)\b/i);
    }

    assert.notEqual(
      englishSection.mermaid.sources.en,
      englishSection.mermaid.sources.fr,
    );
  }

  assert.equal(syntaxCounts.get('flowchart TB'), 4);
  assert.equal(syntaxCounts.get('flowchart TD'), 8);
  assert.equal(syntaxCounts.get('sequenceDiagram'), 2);
  assert.equal(syntaxCounts.get('stateDiagram-v2'), undefined);
});

test('Architecture animates only meaningful request and process flows', () => {
  const architecture = getDocsPage('architecture', 'en');

  for (const id of animatedArchitectureIds) {
    const section = architecture.sections.find((entry) => entry.id === id);
    assert.ok(section?.mermaid);
    for (const source of Object.values(section.mermaid.sources)) {
      const animations = animationIds(source);
      assert.ok(animations.length > 0, `${id} has no animated flow edges`);
      for (const animation of animations) {
        assert.match(source, new RegExp(`\\b${animation.id}@(?:-\\.->|-->)`));
      }
    }
  }

  for (const id of staticArchitectureIds) {
    const section = architecture.sections.find((entry) => entry.id === id);
    assert.ok(section?.mermaid);
    for (const source of Object.values(section.mermaid.sources)) {
      assert.deepEqual(animationIds(source), [], `${id} should remain static`);
    }
  }

  const request = architecture.sections.find((entry) => entry.id === 'request-flow');
  const jobs = architecture.sections.find((entry) => entry.id === 'background-jobs');
  const notifications = architecture.sections.find(
    (entry) => entry.id === 'notification-flow',
  );
  const automation = architecture.sections.find(
    (entry) => entry.id === 'automation-flow',
  );
  assert.match(request?.mermaid?.sources.en ?? '', /requestToProxy@\{ animation: fast \}/);
  assert.match(jobs?.mermaid?.sources.en ?? '', /enqueueJob@\{ animation: fast \}/);
  assert.match(jobs?.mermaid?.sources.en ?? '', /loadState@\{ animation: slow \}/);
  assert.match(notifications?.mermaid?.sources.en ?? '', /recordToSurface@\{ animation: fast \}/);
  assert.doesNotMatch(notifications?.mermaid?.sources.en ?? '', /Toast@\{ animation:/);
  assert.match(automation?.mermaid?.sources.en ?? '', /executeAction@\{ animation: slow \}/);
  assert.match(automation?.mermaid?.sources.en ?? '', /dispatchEmail@\{ animation: fast \}/);
  assert.doesNotMatch(automation?.mermaid?.sources.en ?? '', /Skipped@\{ animation:/);
});

test('Encrypted chat keeps its security guidance and adds three source-backed Mermaid flows', async () => {
  const english = getDocsPage('encryptedChat', 'en');
  const diagrams = english.sections.filter((section) => section.mermaid);
  const e2ee = english.sections.find((section) => section.id === 'e2ee-model');
  const backup = english.sections.find((section) => section.id === 'backup');
  const devices = english.sections.find((section) => section.id === 'device-management');
  const publishedText = JSON.stringify(english);

  assert.equal(diagrams.length, 3);
  assert.equal(e2ee?.diagram, undefined);
  assert.match(e2ee?.mermaid?.sources.en ?? '', /^flowchart TD/);
  assert.match(backup?.mermaid?.sources.en ?? '', /^flowchart TD/);
  assert.match(devices?.mermaid?.sources.en ?? '', /^stateDiagram-v2/);
  assert.doesNotMatch(publishedText, /Participant browser: plaintext|Browser encryption/);
  assert.match(publishedText, /ECDH on P-256/);
  assert.match(publishedText, /PBKDF2-SHA-256/);
  assert.match(publishedText, /210,000 iterations/);
  assert.match(publishedText, /A backup for a revoked key is rejected/);
  assert.match(publishedText, /Revocation is not remote erasure/);
  assert.match(publishedText, /does not provide forward secrecy/);
  assert.doesNotMatch(
    publishedText,
    /zero knowledge|perfect forward secrecy|automatic secure cloud backup|remote deletion/i,
  );

  const e2eeSource = e2ee?.mermaid?.sources.en ?? '';
  const backupSource = backup?.mermaid?.sources.en ?? '';
  const deviceSource = devices?.mermaid?.sources.en ?? '';
  assert.match(e2eeSource, /sendCiphertext@\{ animation: fast \}/);
  assert.match(e2eeSource, /deliverCiphertext@\{ animation: fast \}/);
  assert.match(e2eeSource, /directEncrypt@\{ animation: slow \}/);
  assert.match(e2eeSource, /decryptLocally@\{ animation: slow \}/);
  assert.match(
    e2eeSource,
    /Ciphertext sendCiphertext@--> Service\["PE Community service: ciphertext and permitted metadata"\]/,
  );
  assert.doesNotMatch(e2eeSource, /Sender[^\n]*@--> Service/);
  assert.match(backupSource, /deriveBackupKey@\{ animation: slow \}/);
  assert.match(backupSource, /restoreLocally@\{ animation: slow \}/);
  assert.doesNotMatch(backupSource, /Protect[^\n]*@--> NewBrowser/);
  assert.deepEqual(animationIds(deviceSource), []);

  for (const section of diagrams) {
    assert.ok(section.mermaid);
    assert.notEqual(section.mermaid.sources.en, section.mermaid.sources.fr);
    for (const source of Object.values(section.mermaid.sources)) {
      assert.match(source, /\n\s+accTitle:/);
      assert.match(source, /\n\s+accDescr:/);
      assert.doesNotMatch(source, /\bclick\b|<\/?(?:script|iframe|foreignObject)\b/i);
    }
  }

  const [cryptoSource, recoverySource, workspaceSource, serviceSource] =
    await Promise.all([
      readFile(new URL('../../../web/lib/chat-crypto.ts', import.meta.url), 'utf8'),
      readFile(
        new URL('../../../web/lib/chat-key-recovery.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../../web/components/chat-workspace.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../../api/src/chat/chat.service.ts', import.meta.url),
        'utf8',
      ),
    ]);
  assert.match(cryptoSource, /namedCurve: 'P-256'/);
  assert.match(cryptoSource, /name: 'AES-GCM', length: 256/);
  assert.match(recoverySource, /backupIterations = 210_000/);
  assert.match(recoverySource, /name: 'PBKDF2'/);
  assert.match(workspaceSource, /recipients\[recipientKey\.userId\]/);
  assert.match(serviceSource, /CHAT_BACKUP_KEY_MISMATCH/);
  assert.match(serviceSource, /status: 'REVOKED', revokedAt/);
});

test('Docs Mermaid configuration is strict and has deliberate light and dark themes', () => {
  const light = getDocsMermaidConfig('light');
  const dark = getDocsMermaidConfig('dark');

  for (const config of [light, dark]) {
    assert.equal(config.securityLevel, 'strict');
    assert.equal(config.startOnLoad, false);
    assert.equal(config.suppressErrorRendering, true);
    assert.equal(config.theme, 'base');
    assert.equal(config.flowchart?.htmlLabels, false);
    assert.equal(config.deterministicIds, true);
  }

  assert.notEqual(
    light.themeVariables?.background,
    dark.themeVariables?.background,
  );
  assert.notEqual(
    light.themeVariables?.primaryTextColor,
    dark.themeVariables?.primaryTextColor,
  );
});

test('The installed Mermaid release supports native edge IDs and fast or slow animation', async () => {
  const [sitePackage, lockfile] = await Promise.all([
    readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../../../../pnpm-lock.yaml', import.meta.url), 'utf8'),
  ]);

  assert.match(sitePackage, /"mermaid": "\^11\.16\.1"/);
  assert.match(lockfile, /mermaid:\n\s+specifier: \^11\.16\.1\n\s+version: 11\.16\.1/);

  const animatedSources = [
    ...getDocsPage('architecture', 'en').sections,
    ...getDocsPage('encryptedChat', 'en').sections,
  ]
    .flatMap((section) =>
      section.mermaid ? Object.values(section.mermaid.sources) : [],
    )
    .filter((source) => animationIds(source).length > 0);

  assert.ok(animatedSources.length > 0);
  assert.ok(animatedSources.some((source) => /@\{ animation: fast \}/.test(source)));
  assert.ok(animatedSources.some((source) => /@\{ animation: slow \}/.test(source)));
  assert.ok(animatedSources.every((source) => !/@\{ animate: true,/.test(source)));
});

test('Mermaid remains a dynamically loaded shared runtime with a restrained fallback', async () => {
  const [renderer, component, docsComponent, docsPage, globalStyles, sitePackage, webPackage] =
    await Promise.all([
      readFile(new URL('./mermaid-renderer.ts', import.meta.url), 'utf8'),
      readFile(
        new URL('../../components/mermaid-diagram.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../components/docs/docs-mermaid-diagram.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../components/docs/docs-page.tsx', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../../app/globals.css', import.meta.url), 'utf8'),
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../../../web/package.json', import.meta.url), 'utf8'),
    ]);

  assert.match(renderer, /await import\('mermaid'\)/);
  assert.match(renderer, /renderQueue/);
  assert.match(renderer, /mermaid\.parse/);
  assert.match(component, /state\.status === 'error'/);
  assert.match(component, /resolvedTheme/);
  assert.match(component, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(component, />\s*\{source\}\s*</);
  assert.match(docsComponent, /presentation="docs"/);
  assert.doesNotMatch(docsPage, /mermaid|DocsMermaid/);
  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globalStyles, /\.site-mermaid-output \.edge-animation-fast/);
  assert.match(globalStyles, /\.site-mermaid-output \.edge-animation-slow/);
  assert.match(globalStyles, /animation: none !important/);
  assert.match(globalStyles, /stroke-dasharray: none !important/);
  assert.match(sitePackage, /"mermaid"/);
  assert.doesNotMatch(sitePackage, /framer-motion|gsap|anime\.js|lottie/);
  assert.doesNotMatch(webPackage, /"mermaid"/);
});
