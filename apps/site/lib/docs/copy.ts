import type { DocsLang } from './content';

export type DocsCopyState = 'idle' | 'copied' | 'failed';

export function getDocsCopyLabels(lang: DocsLang) {
  return lang === 'fr'
    ? {
        idle: { text: 'Copier', ariaLabel: 'Copier le code' },
        copied: { text: 'Copié', ariaLabel: 'Code copié' },
        failed: { text: 'Échec', ariaLabel: 'Échec de la copie' },
      }
    : {
        idle: { text: 'Copy', ariaLabel: 'Copy code' },
        copied: { text: 'Copied', ariaLabel: 'Code copied' },
        failed: { text: 'Failed', ariaLabel: 'Copy failed' },
      };
}

export async function writeClipboardText(
  value: string,
  clipboard: Pick<Clipboard, 'writeText'> = navigator.clipboard,
) {
  await clipboard.writeText(value);
}
