import { Globe2, Link2, type LucideIcon } from 'lucide-react';
import type { IconType } from 'react-icons';
import { FaLinkedinIn } from 'react-icons/fa6';
import {
  SiBluesky,
  SiDiscord,
  SiFacebook,
  SiGithub,
  SiGitlab,
  SiInstagram,
  SiMastodon,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from 'react-icons/si';

export type ProfileLinkPlatform = 'WEBSITE' | 'LINKEDIN' | 'X' | 'FACEBOOK' | 'INSTAGRAM' | 'YOUTUBE' | 'TIKTOK' | 'GITHUB' | 'GITLAB' | 'DISCORD' | 'WHATSAPP' | 'TELEGRAM' | 'MASTODON' | 'THREADS' | 'BLUESKY' | 'OTHER';
export type ProfileLinkVisibility = 'PUBLIC' | 'MEMBERS' | 'PRIVATE';

export type ProfileLinkDto = {
  id: string;
  platform: ProfileLinkPlatform;
  identifier: string | null;
  label: string | null;
  url: string | null;
  href: string | null;
  displayValue: string;
  visibility: ProfileLinkVisibility;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type ProfilePlatformIcon = IconType | LucideIcon;
export type ProfilePlatformDefinition = {
  value: ProfileLinkPlatform;
  icon: ProfilePlatformIcon;
  inputKind: 'IDENTIFIER' | 'URL';
  placeholder: string;
  allowMultiple: boolean;
};

export const profileLinkPlatforms: readonly ProfilePlatformDefinition[] = [
  { value: 'WEBSITE', icon: Globe2, inputKind: 'URL', placeholder: 'https://example.com', allowMultiple: true },
  { value: 'LINKEDIN', icon: FaLinkedinIn, inputKind: 'IDENTIFIER', placeholder: 'community-demo', allowMultiple: false },
  { value: 'X', icon: SiX, inputKind: 'IDENTIFIER', placeholder: '@communitydemo', allowMultiple: false },
  { value: 'FACEBOOK', icon: SiFacebook, inputKind: 'IDENTIFIER', placeholder: 'community.demo', allowMultiple: false },
  { value: 'INSTAGRAM', icon: SiInstagram, inputKind: 'IDENTIFIER', placeholder: '@communitydemo', allowMultiple: false },
  { value: 'YOUTUBE', icon: SiYoutube, inputKind: 'IDENTIFIER', placeholder: '@communitydemo', allowMultiple: false },
  { value: 'TIKTOK', icon: SiTiktok, inputKind: 'IDENTIFIER', placeholder: '@communitydemo', allowMultiple: false },
  { value: 'GITHUB', icon: SiGithub, inputKind: 'IDENTIFIER', placeholder: 'communitydemo', allowMultiple: false },
  { value: 'GITLAB', icon: SiGitlab, inputKind: 'IDENTIFIER', placeholder: 'communitydemo', allowMultiple: false },
  { value: 'DISCORD', icon: SiDiscord, inputKind: 'IDENTIFIER', placeholder: 'communitydemo', allowMultiple: false },
  { value: 'WHATSAPP', icon: SiWhatsapp, inputKind: 'IDENTIFIER', placeholder: '+15551234567', allowMultiple: false },
  { value: 'TELEGRAM', icon: SiTelegram, inputKind: 'IDENTIFIER', placeholder: '@communitydemo', allowMultiple: false },
  { value: 'MASTODON', icon: SiMastodon, inputKind: 'IDENTIFIER', placeholder: '@communitydemo@social.example', allowMultiple: false },
  { value: 'THREADS', icon: SiThreads, inputKind: 'IDENTIFIER', placeholder: '@communitydemo', allowMultiple: false },
  { value: 'BLUESKY', icon: SiBluesky, inputKind: 'IDENTIFIER', placeholder: 'communitydemo.example', allowMultiple: false },
  { value: 'OTHER', icon: Link2, inputKind: 'URL', placeholder: 'https://example.com/profile', allowMultiple: true },
] as const;

export function profileLinkDefinition(platform: ProfileLinkPlatform) {
  return profileLinkPlatforms.find((item) => item.value === platform) ?? profileLinkPlatforms[0];
}

export function normalizeProfileIdentifier(platform: ProfileLinkPlatform, input: string) {
  const trimmed = input.trim();
  if (platform === 'WHATSAPP') return trimmed.replace(/^\+/, '').replace(/[\s()-]/g, '');
  if (profileLinkDefinition(platform).inputKind === 'IDENTIFIER') return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return trimmed;
}

export function profileLinkPreviewHref(platform: ProfileLinkPlatform, input: string) {
  const value = normalizeProfileIdentifier(platform, input);
  if (!value) return null;
  switch (platform) {
    case 'LINKEDIN': return `https://www.linkedin.com/in/${value}`;
    case 'X': return `https://x.com/${value}`;
    case 'FACEBOOK': return `https://www.facebook.com/${value}`;
    case 'INSTAGRAM': return `https://www.instagram.com/${value}/`;
    case 'YOUTUBE': return value.startsWith('UC') ? `https://www.youtube.com/channel/${value}` : `https://www.youtube.com/@${value}`;
    case 'TIKTOK': return `https://www.tiktok.com/@${value}`;
    case 'GITHUB': return `https://github.com/${value}`;
    case 'GITLAB': return `https://gitlab.com/${value}`;
    case 'WHATSAPP': return `https://wa.me/${value}`;
    case 'TELEGRAM': return `https://t.me/${value}`;
    case 'THREADS': return `https://www.threads.net/@${value}`;
    case 'BLUESKY': return `https://bsky.app/profile/${value}`;
    case 'MASTODON': {
      const separator = value.lastIndexOf('@');
      return separator > 0 ? `https://${value.slice(separator + 1)}/@${value.slice(0, separator)}` : null;
    }
    default: return null;
  }
}
