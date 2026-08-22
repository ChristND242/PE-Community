import { Avatar, Style } from '@dicebear/core';
import loreleiNeutralDefinition from '@dicebear/styles/lorelei-neutral.json';
import notionistsDefinition from '@dicebear/styles/notionists.json';
import personasDefinition from '@dicebear/styles/personas.json';

export type DicebearStyleName = 'lorelei-neutral' | 'notionists' | 'personas';

export const avatarUploadMaxBytes = 5 * 1024 * 1024;
export const avatarUploadMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'] as const;
export const avatarUploadAccept = 'image/jpeg,image/png,image/webp';

export function createSetupAvatarSeed(name: string, identifier = createSetupAvatarIdentifier()) {
  return `${name.trim() || 'Owner'}:${identifier}`;
}

export type AvatarProfile = {
  avatarUrl?: string | null;
  dicebearStyle?: string | null;
  dicebearSeed?: string | null;
  id?: string | null;
  userId?: string | null;
};

export type ResolvedAvatar =
  | { type: 'image'; src: string }
  | { type: 'dicebear'; src: string }
  | { type: 'initials' };

const dicebearStyles = {
  'lorelei-neutral': new Style(loreleiNeutralDefinition),
  notionists: new Style(notionistsDefinition),
  personas: new Style(personasDefinition),
} satisfies Record<DicebearStyleName, Style>;

export const dicebearAvatarOptions: Array<{ style: DicebearStyleName; label: string; license: string }> = [
  { style: 'lorelei-neutral', label: 'Lorelei Neutral', license: 'CC0 1.0' },
  { style: 'notionists', label: 'Notionists', license: 'CC0 1.0' },
  { style: 'personas', label: 'Personas', license: 'CC BY 4.0' },
];

export function resolveUserAvatar(profile?: AvatarProfile | null): ResolvedAvatar {
  const avatarUrl = profile?.avatarUrl?.trim();
  if (avatarUrl) return { type: 'image', src: avatarUrl };
  const dicebear = dicebearDataUri(profile?.dicebearStyle, profile?.dicebearSeed ?? profile?.userId ?? profile?.id);
  if (dicebear) return { type: 'dicebear', src: dicebear };
  return { type: 'initials' };
}

export function dicebearDataUri(styleName?: string | null, seed?: string | null) {
  const style = normalizedDicebearStyle(styleName);
  const normalizedSeed = seed?.trim();
  if (!style || !normalizedSeed) return null;
  try {
    return new Avatar(dicebearStyles[style], { seed: normalizedSeed, size: 256 }).toDataUri();
  } catch {
    return null;
  }
}

export function normalizedDicebearStyle(styleName?: string | null): DicebearStyleName | null {
  return styleName === 'lorelei-neutral' || styleName === 'notionists' || styleName === 'personas' ? styleName : null;
}

function createSetupAvatarIdentifier() {
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
}
