import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from '@shikijs/transformers';
import { createHighlighter, type BundledLanguage } from 'shiki';

export const DOCS_SHIKI_THEME = 'vitesse-dark' as const;

export const DOCS_CODE_LANGUAGES = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'jsonc',
  'bash',
  'yaml',
  'dockerfile',
  'sql',
  'html',
  'css',
  'powershell',
  'dotenv',
  'nginx',
  'prisma',
] as const satisfies readonly BundledLanguage[];

type DocsCodeLanguage = (typeof DOCS_CODE_LANGUAGES)[number];

const languageAliases: Record<string, DocsCodeLanguage> = {
  bash: 'bash',
  shell: 'bash',
  sh: 'bash',
  terminal: 'bash',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yaml',
  yml: 'yaml',
  docker: 'dockerfile',
  dockerfile: 'dockerfile',
  sql: 'sql',
  html: 'html',
  css: 'css',
  powershell: 'powershell',
  ps1: 'powershell',
  dotenv: 'dotenv',
  env: 'dotenv',
  nginx: 'nginx',
  prisma: 'prisma',
};

const languageLabels: Record<DocsCodeLanguage, string> = {
  typescript: 'TypeScript',
  tsx: 'TSX',
  javascript: 'JavaScript',
  jsx: 'JSX',
  json: 'JSON',
  jsonc: 'JSONC',
  bash: 'Terminal',
  yaml: 'YAML',
  dockerfile: 'Dockerfile',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  powershell: 'PowerShell',
  dotenv: 'Environment',
  nginx: 'Nginx',
  prisma: 'Prisma',
};

const supportedLanguages = new Set<string>(DOCS_CODE_LANGUAGES);
const highlighterPromise = createHighlighter({
  themes: [DOCS_SHIKI_THEME],
  langs: [...DOCS_CODE_LANGUAGES],
});

export type HighlightedDocsCode = {
  html: string;
  rawCode: string;
  copyCode: string;
  language: string;
  languageLabel: string;
  supported: boolean;
  title?: string;
  showLineNumbers: boolean;
};

export type DocsCodeInput = {
  value: string;
  language?: string;
  label?: string;
  title?: string;
  meta?: string;
  showLineNumbers?: boolean;
};

export function normalizeDocsCodeLanguage(language: string | undefined) {
  const requested = String(language ?? 'bash')
    .trim()
    .toLocaleLowerCase();
  return languageAliases[requested] ?? (requested || 'text');
}

export function getDocsCodeLanguageLabel(language: string | undefined) {
  const normalized = normalizeDocsCodeLanguage(language);
  return (
    languageLabels[normalized as DocsCodeLanguage] ??
    (String(language ?? 'Text').trim() || 'Text')
  );
}

export function cleanDocsCodeForCopy(value: string) {
  return value
    .split('\n')
    .filter(
      (line) =>
        !/^\s*(?:\/\/|#|<!--)\s*\[!code\s+(?:highlight|focus|\+\+|--|error|warning|info|word(?::[^\]]+)?)\]\s*(?:-->)?\s*$/.test(
          line,
        ),
    )
    .join('\n');
}

export async function highlightDocsCode(
  input: DocsCodeInput,
): Promise<HighlightedDocsCode> {
  const normalizedLanguage = normalizeDocsCodeLanguage(input.language);
  const supported = supportedLanguages.has(normalizedLanguage);
  const highlighter = await highlighterPromise;
  const html = highlighter.codeToHtml(input.value, {
    lang: supported ? (normalizedLanguage as DocsCodeLanguage) : 'text',
    theme: DOCS_SHIKI_THEME,
    meta: input.meta ? { __raw: input.meta } : undefined,
    transformers: [
      transformerMetaHighlight(),
      transformerMetaWordHighlight(),
      transformerNotationDiff(),
      transformerNotationHighlight(),
      transformerNotationFocus(),
      transformerNotationErrorLevel(),
      transformerNotationWordHighlight(),
    ],
  });

  return {
    html,
    rawCode: input.value,
    copyCode: cleanDocsCodeForCopy(input.value),
    language: normalizedLanguage,
    languageLabel: getDocsCodeLanguageLabel(input.language),
    supported,
    title: input.title ?? input.label,
    showLineNumbers: input.showLineNumbers ?? false,
  };
}
