import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const siteUrl = new URL('./', import.meta.url);

async function read(path: string) {
  return readFile(new URL(path, siteUrl), 'utf8');
}

test('homepage controls use stable semantic accessibility ids', async () => {
  const [homepage, themeSwitch, trustSection] = await Promise.all([
    read('app/public-homepage.tsx'),
    read('components/theme-switch.tsx'),
    read('components/marketing/platform-trust-section.tsx'),
  ]);

  assert.match(homepage, /const publicMobileMenuId = 'site-public-mobile-navigation'/);
  assert.match(homepage, /aria-controls=\{publicMobileMenuId\}/);
  assert.match(homepage, /id=\{publicMobileMenuId\}/);
  assert.doesNotMatch(homepage, /useId/);
  assert.doesNotMatch(themeSwitch, /useId|id=\{/);
  assert.match(trustSection, /id="marketing-notification-journey"/);
  assert.match(trustSection, /id="marketing-data-ownership"/);
});

test('Mermaid keeps a stable SSR shell and accessible id fallback', async () => {
  const diagram = await read('components/mermaid-diagram.tsx');

  assert.match(diagram, /const reactId = useId\(\)/);
  assert.match(diagram, /const diagramId = id \?\? reactId/);
  assert.match(diagram, /aria-labelledby=\{titleId\}/);
  assert.match(diagram, /aria-describedby=\{descriptionId\}/);
  assert.match(diagram, /useEffect\(\(\) => \{/);
  assert.match(diagram, /resolvedTheme/);
  assert.doesNotMatch(diagram, /typeof window|matchMedia|localStorage|sessionStorage/);
});

test('homepage hydration state starts consistently without warning workarounds', async () => {
  const [homepage, themeSwitch, language, layout, trustSection] = await Promise.all([
    read('app/public-homepage.tsx'),
    read('components/theme-switch.tsx'),
    read('lib/i18n.tsx'),
    read('app/layout.tsx'),
    read('components/marketing/platform-trust-section.tsx'),
  ]);
  const hydrationSources = `${homepage}\n${themeSwitch}`;

  assert.match(themeSwitch, /useState\(false\)/);
  assert.match(language, /useState<Lang>\('en'\)/);
  assert.doesNotMatch(hydrationSources, /Math\.random|Date\.now|randomUUID/);
  assert.doesNotMatch(hydrationSources, /suppressHydrationWarning/);
  assert.doesNotMatch(homepage, /innerWidth|isMobile|useMediaQuery/);
  assert.match(
    trustSection,
    /useState<MarketingDiagramOrientation>\('landscape'\)/,
  );
  assert.match(trustSection, /useEffect\(\(\) => \{[\s\S]*window\.matchMedia/);
  assert.doesNotMatch(
    trustSection,
    /return\s+orientation\s+===\s+['"]portrait['"]\s+\?\s+<MermaidDiagram/,
  );
  assert.equal((layout.match(/suppressHydrationWarning/g) ?? []).length, 1);
});
