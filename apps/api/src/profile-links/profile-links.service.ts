import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProfileLinkPlatform, ProfileLinkVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const PROFILE_LINK_LIMIT = 15;
export const PROFILE_LINK_URL_MAX_LENGTH = 2048;
export const PROFILE_LINK_IDENTIFIER_MAX_LENGTH = 255;
export const PROFILE_LINK_LABEL_MAX_LENGTH = 50;

const urlPlatforms = new Set<ProfileLinkPlatform>([ProfileLinkPlatform.WEBSITE, ProfileLinkPlatform.OTHER]);
type UrlProfileLinkPlatform = typeof ProfileLinkPlatform.WEBSITE | typeof ProfileLinkPlatform.OTHER;

type SocialPlatformPolicy = {
  normalizeIdentifier: (value: string) => string;
  validateIdentifier: (value: string) => boolean;
  profileUrl: (identifier: string) => string | null;
  displayValue: (identifier: string) => string;
};

const stripHandlePrefix = (value: string) => value.startsWith('@') ? value.slice(1) : value;
const handleDisplay = (value: string) => `@${value}`;
const segmentPolicy = (pattern: RegExp, profileUrl: (identifier: string) => string | null, displayValue = handleDisplay): SocialPlatformPolicy => ({
  normalizeIdentifier: stripHandlePrefix,
  validateIdentifier: (value) => pattern.test(value),
  profileUrl,
  displayValue,
});

export const socialPlatformPolicies: Record<Exclude<ProfileLinkPlatform, 'WEBSITE' | 'OTHER'>, SocialPlatformPolicy> = {
  LINKEDIN: segmentPolicy(/^[A-Za-z0-9][A-Za-z0-9-]{2,99}$/, (value) => `https://www.linkedin.com/in/${value}`, (value) => value),
  X: segmentPolicy(/^[A-Za-z0-9_]{1,15}$/, (value) => `https://x.com/${value}`),
  FACEBOOK: segmentPolicy(/^[A-Za-z0-9.]{5,50}$/, (value) => `https://www.facebook.com/${value}`, (value) => value),
  INSTAGRAM: segmentPolicy(/^[A-Za-z0-9._]{1,30}$/, (value) => `https://www.instagram.com/${value}/`),
  YOUTUBE: segmentPolicy(/^(?:[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$/, (value) => value.startsWith('UC') ? `https://www.youtube.com/channel/${value}` : `https://www.youtube.com/@${value}`),
  TIKTOK: segmentPolicy(/^[A-Za-z0-9._]{2,24}$/, (value) => `https://www.tiktok.com/@${value}`),
  GITHUB: segmentPolicy(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/, (value) => `https://github.com/${value}`, (value) => value),
  GITLAB: segmentPolicy(/^[A-Za-z0-9_][A-Za-z0-9_.-]{1,254}$/, (value) => `https://gitlab.com/${value}`, (value) => value),
  DISCORD: segmentPolicy(/^(?:[A-Za-z0-9._]{2,32}|[0-9]{17,20})$/, () => null, (value) => value),
  WHATSAPP: {
    normalizeIdentifier: (value) => value.replace(/^\+/, '').replace(/[\s()-]/g, ''),
    validateIdentifier: (value) => /^[0-9]{7,15}$/.test(value),
    profileUrl: (value) => `https://wa.me/${value}`,
    displayValue: (value) => `+${value}`,
  },
  TELEGRAM: segmentPolicy(/^[A-Za-z][A-Za-z0-9_]{4,31}$/, (value) => `https://t.me/${value}`),
  MASTODON: {
    normalizeIdentifier: stripHandlePrefix,
    validateIdentifier: isValidMastodonIdentifier,
    profileUrl: (value) => {
      const separator = value.lastIndexOf('@');
      return `https://${value.slice(separator + 1)}/@${value.slice(0, separator)}`;
    },
    displayValue: (value) => `@${value}`,
  },
  THREADS: segmentPolicy(/^[A-Za-z0-9._]{1,30}$/, (value) => `https://www.threads.net/@${value}`),
  BLUESKY: segmentPolicy(/^(?=.{3,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/, (value) => `https://bsky.app/profile/${value}`, (value) => value),
};

export const profileLinkDtoSelect = {
  id: true,
  platform: true,
  identifier: true,
  label: true,
  url: true,
  legacyUrl: true,
  visibility: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MemberProfileLinkSelect;

export type StoredProfileLink = Prisma.MemberProfileLinkGetPayload<{ select: typeof profileLinkDtoSelect }>;

export type ProfileLinkDto = {
  id: string;
  platform: ProfileLinkPlatform;
  identifier: string | null;
  url: string | null;
  href: string | null;
  displayValue: string;
  label: string | null;
  visibility: ProfileLinkVisibility;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProfileLinkInput = {
  platform?: unknown;
  identifier?: unknown;
  label?: unknown;
  url?: unknown;
  visibility?: unknown;
};

export type ValidatedProfileLink = {
  platform: ProfileLinkPlatform;
  identifier: string | null;
  label: string | null;
  url: string | null;
  normalizedUrl: string | null;
  visibility: ProfileLinkVisibility;
  hostname: string | null;
};

@Injectable()
export class ProfileLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async listOwn(userId: string, communityId: string) {
    const membership = await this.activeMembershipForUser(userId, communityId);
    return this.listForMembership(membership.id);
  }

  async listForDirectory(viewerUserId: string, communityId: string, membershipId: string) {
    await this.activeMembershipForUser(viewerUserId, communityId);
    const target = await this.membershipInCommunity(membershipId, communityId);
    const links = await this.prisma.memberProfileLink.findMany({
      where: { membershipId, ...(target.userId === viewerUserId ? {} : { visibility: { in: [ProfileLinkVisibility.PUBLIC, ProfileLinkVisibility.MEMBERS] } }) },
      select: profileLinkDtoSelect,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return safeProfileLinkResponses(links);
  }

  async listForAdmin(communityId: string, membershipId: string) {
    await this.membershipInCommunity(membershipId, communityId);
    return this.listForMembership(membershipId);
  }

  async createOwn(userId: string, communityId: string, input: ProfileLinkInput) {
    const membership = await this.activeMembershipForUser(userId, communityId);
    return this.create(communityId, membership.id, userId, input);
  }

  async createForAdmin(communityId: string, membershipId: string, actorUserId: string, input: ProfileLinkInput) {
    await this.membershipInCommunity(membershipId, communityId);
    return this.create(communityId, membershipId, actorUserId, input);
  }

  async updateOwn(userId: string, communityId: string, linkId: string, input: ProfileLinkInput) {
    const membership = await this.activeMembershipForUser(userId, communityId);
    return this.update(communityId, membership.id, linkId, userId, input);
  }

  async updateForAdmin(communityId: string, membershipId: string, linkId: string, actorUserId: string, input: ProfileLinkInput) {
    await this.membershipInCommunity(membershipId, communityId);
    return this.update(communityId, membershipId, linkId, actorUserId, input);
  }

  async deleteOwn(userId: string, communityId: string, linkId: string) {
    const membership = await this.activeMembershipForUser(userId, communityId);
    return this.remove(communityId, membership.id, linkId, userId);
  }

  async deleteForAdmin(communityId: string, membershipId: string, linkId: string, actorUserId: string) {
    await this.membershipInCommunity(membershipId, communityId);
    return this.remove(communityId, membershipId, linkId, actorUserId);
  }

  async reorderOwn(userId: string, communityId: string, orderedIds: unknown) {
    const membership = await this.activeMembershipForUser(userId, communityId);
    return this.reorder(communityId, membership.id, userId, orderedIds);
  }

  async reorderForAdmin(communityId: string, membershipId: string, actorUserId: string, orderedIds: unknown) {
    await this.membershipInCommunity(membershipId, communityId);
    return this.reorder(communityId, membershipId, actorUserId, orderedIds);
  }

  private async listForMembership(membershipId: string) {
    const links = await this.prisma.memberProfileLink.findMany({ where: { membershipId }, select: profileLinkDtoSelect, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    return safeProfileLinkResponses(links);
  }

  private async create(communityId: string, membershipId: string, actorUserId: string, input: ProfileLinkInput) {
    const value = validateProfileLink(input);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.memberProfileLink.findMany({ where: { membershipId }, select: { platform: true, normalizedUrl: true, position: true } });
        if (existing.length >= PROFILE_LINK_LIMIT) profileLinkError('PROFILE_LINK_LIMIT_REACHED', `A profile can contain at most ${PROFILE_LINK_LIMIT} links.`);
        if (!urlPlatforms.has(value.platform) && existing.some((link) => link.platform === value.platform)) profileLinkError('PROFILE_LINK_PLATFORM_EXISTS', 'This platform has already been added.');
        if (value.normalizedUrl && existing.some((link) => link.normalizedUrl === value.normalizedUrl)) profileLinkError('PROFILE_LINK_URL_EXISTS', 'This URL has already been added.');
        const link = await tx.memberProfileLink.create({
          data: { membershipId, ...withoutHostname(value), position: existing.reduce((maximum, link) => Math.max(maximum, link.position), -1) + 1 },
          select: profileLinkDtoSelect,
        });
        await this.audit(tx, communityId, actorUserId, membershipId, 'profile.link_created', link.id, value.platform, value.visibility, value.hostname, link.position);
        return profileLinkResponse(link);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      rethrowProfileLinkConstraint(error);
    }
  }

  private async update(communityId: string, membershipId: string, linkId: string, actorUserId: string, input: ProfileLinkInput) {
    const current = await this.prisma.memberProfileLink.findFirst({ where: { id: linkId, membershipId }, select: profileLinkDtoSelect });
    if (!current) throw new NotFoundException('Profile link not found.');
    const value = validateProfileLink({
      platform: current.platform,
      identifier: input.identifier === undefined ? current.identifier : input.identifier,
      label: input.label === undefined ? current.label : input.label,
      url: input.url === undefined ? current.url : input.url,
      visibility: input.visibility === undefined ? current.visibility : input.visibility,
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (value.normalizedUrl) {
          const duplicate = await tx.memberProfileLink.findFirst({ where: { membershipId, normalizedUrl: value.normalizedUrl, id: { not: linkId } }, select: { id: true } });
          if (duplicate) profileLinkError('PROFILE_LINK_URL_EXISTS', 'This URL has already been added.');
        }
        const link = await tx.memberProfileLink.update({ where: { id: linkId }, data: { ...withoutHostname(value), legacyUrl: null }, select: profileLinkDtoSelect });
        await this.audit(tx, communityId, actorUserId, membershipId, 'profile.link_updated', link.id, link.platform, link.visibility, value.hostname, link.position);
        return profileLinkResponse(link);
      });
    } catch (error) {
      rethrowProfileLinkConstraint(error);
    }
  }

  private async remove(communityId: string, membershipId: string, linkId: string, actorUserId: string) {
    const current = await this.prisma.memberProfileLink.findFirst({ where: { id: linkId, membershipId }, select: profileLinkDtoSelect });
    if (!current) throw new NotFoundException('Profile link not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.memberProfileLink.delete({ where: { id: linkId } });
      const remaining = await tx.memberProfileLink.findMany({ where: { membershipId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
      for (const [position, link] of remaining.entries()) await tx.memberProfileLink.update({ where: { id: link.id }, data: { position } });
      await this.audit(tx, communityId, actorUserId, membershipId, 'profile.link_deleted', current.id, current.platform, current.visibility, current.url ? safeHostname(current.url) : null, current.position);
    });
    return { ok: true };
  }

  private async reorder(communityId: string, membershipId: string, actorUserId: string, orderedIdsValue: unknown) {
    if (!Array.isArray(orderedIdsValue) || orderedIdsValue.some((id) => typeof id !== 'string') || new Set(orderedIdsValue).size !== orderedIdsValue.length) profileLinkError('PROFILE_LINK_UNAVAILABLE', 'The complete unique link order is required.');
    const orderedIds = orderedIdsValue as string[];
    return this.prisma.$transaction(async (tx) => {
      const links = await tx.memberProfileLink.findMany({ where: { membershipId }, select: { id: true } });
      if (links.length !== orderedIds.length || links.some((link) => !orderedIds.includes(link.id))) profileLinkError('PROFILE_LINK_UNAVAILABLE', 'The complete owner-owned link order is required.');
      for (const [position, id] of orderedIds.entries()) await tx.memberProfileLink.update({ where: { id }, data: { position } });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'profile.links_reordered', targetType: 'Membership', targetId: membershipId, metadata: { linkIds: orderedIds } } });
      const reordered = await tx.memberProfileLink.findMany({ where: { membershipId }, select: profileLinkDtoSelect, orderBy: { position: 'asc' } });
      return safeProfileLinkResponses(reordered);
    });
  }

  private async activeMembershipForUser(userId: string, communityId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { userId, communityId, status: 'ACTIVE' }, select: { id: true, userId: true } });
    if (!membership) throw new NotFoundException('Member profile not found.');
    return membership;
  }

  private async membershipInCommunity(membershipId: string, communityId: string) {
    const membership = await this.prisma.membership.findFirst({ where: { id: membershipId, communityId, status: 'ACTIVE' }, select: { id: true, userId: true } });
    if (!membership) throw new NotFoundException('Member profile not found.');
    return membership;
  }

  private audit(tx: Prisma.TransactionClient, communityId: string, actorUserId: string, membershipId: string, action: string, linkId: string, platform: ProfileLinkPlatform, visibility: ProfileLinkVisibility, hostname: string | null, position: number) {
    return tx.auditLog.create({ data: { communityId, actorUserId, action, targetType: 'MemberProfileLink', targetId: linkId, metadata: { membershipId, platform, visibility, hostname, position } } });
  }
}

export function validateProfileLink(input: ProfileLinkInput): ValidatedProfileLink {
  const platform = enumValue(ProfileLinkPlatform, input.platform, 'PROFILE_LINK_UNAVAILABLE', 'Choose a supported platform.');
  const visibility = input.visibility === undefined ? ProfileLinkVisibility.PUBLIC : enumValue(ProfileLinkVisibility, input.visibility, 'PROFILE_LINK_UNAVAILABLE', 'Choose a supported visibility.');
  const rawLabel = typeof input.label === 'string' ? input.label.trim() : '';
  if (rawLabel.length > PROFILE_LINK_LABEL_MAX_LENGTH) profileLinkError('PROFILE_LINK_UNAVAILABLE', `Custom label must be at most ${PROFILE_LINK_LABEL_MAX_LENGTH} characters.`);

  if (!isUrlPlatform(platform)) {
    if (input.url !== undefined) profileLinkError('PROFILE_LINK_URL_NOT_ALLOWED', 'Enter only the username or identifier, not the full profile URL.');
    if (input.label !== undefined && rawLabel) profileLinkError('PROFILE_LINK_UNAVAILABLE', 'Custom labels are available only for Other links.');
    const rawIdentifier = typeof input.identifier === 'string' ? input.identifier.trim() : '';
    if (!rawIdentifier) profileLinkError('PROFILE_LINK_IDENTIFIER_REQUIRED', 'A username or identifier is required.');
    if (rawIdentifier.length > PROFILE_LINK_IDENTIFIER_MAX_LENGTH || rawIdentifier.includes('://')) profileLinkError('PROFILE_LINK_IDENTIFIER_INVALID', 'Enter only a valid username or identifier, not a full URL.');
    const policy = socialPlatformPolicies[platform];
    const identifier = policy.normalizeIdentifier(rawIdentifier);
    if (!identifier || /[\u0000-\u001f\u007f]/.test(identifier) || !policy.validateIdentifier(identifier)) profileLinkError('PROFILE_LINK_IDENTIFIER_INVALID', 'Enter a valid username or identifier.');
    return { platform, identifier, label: null, url: null, normalizedUrl: null, visibility, hostname: derivedHostname(policy.profileUrl(identifier)) };
  }

  if (input.identifier !== undefined) profileLinkError('PROFILE_LINK_IDENTIFIER_NOT_ALLOWED', 'This platform requires an HTTPS URL.');
  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  if (!rawUrl) profileLinkError('PROFILE_LINK_URL_REQUIRED', 'An HTTPS URL is required.');
  if (rawUrl.length > PROFILE_LINK_URL_MAX_LENGTH) profileLinkError('PROFILE_LINK_URL_INVALID', `URL must be at most ${PROFILE_LINK_URL_MAX_LENGTH} characters.`);
  const parsed = parseHttpsUrl(rawUrl);
  if (platform === ProfileLinkPlatform.OTHER && !rawLabel) profileLinkError('PROFILE_LINK_UNAVAILABLE', 'A custom label is required for Other links.');
  parsed.hash = '';
  return { platform, identifier: null, label: platform === ProfileLinkPlatform.OTHER ? rawLabel : null, url: parsed.toString(), normalizedUrl: parsed.toString(), visibility, hostname: parsed.hostname.toLowerCase() };
}

export function profileLinkResponse(link: StoredProfileLink): ProfileLinkDto | null {
  if (isUrlPlatform(link.platform)) {
    if (!link.url) return null;
    try {
      const parsed = parseHttpsUrl(link.url);
      parsed.hash = '';
      return { ...publicFields(link), identifier: null, url: parsed.toString(), href: parsed.toString(), displayValue: link.label || displayUrl(parsed) };
    } catch {
      return null;
    }
  }
  if (!link.identifier) return { ...publicFields(link), identifier: null, url: null, href: null, displayValue: '' };
  const policy = socialPlatformPolicies[link.platform];
  const identifier = policy.normalizeIdentifier(link.identifier);
  if (!policy.validateIdentifier(identifier)) return null;
  return { ...publicFields(link), identifier, url: null, href: policy.profileUrl(identifier), displayValue: policy.displayValue(identifier) };
}

export function safeProfileLinkResponses(links: StoredProfileLink[]) {
  return links.map(profileLinkResponse).filter((link): link is ProfileLinkDto => Boolean(link));
}

function publicFields(link: StoredProfileLink) {
  return { id: link.id, platform: link.platform, label: link.label, visibility: link.visibility, position: link.position, createdAt: link.createdAt, updatedAt: link.updatedAt };
}

function parseHttpsUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { profileLinkError('PROFILE_LINK_URL_INVALID', 'Enter a valid HTTPS URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) profileLinkError('PROFILE_LINK_URL_INVALID', 'Only public HTTPS URLs without credentials are allowed.');
  return parsed;
}

function isUrlPlatform(platform: ProfileLinkPlatform): platform is UrlProfileLinkPlatform {
  return urlPlatforms.has(platform);
}

function isValidMastodonIdentifier(value: string) {
  if (value.includes('/') || value.includes('?') || value.includes('#') || value.includes('://')) return false;
  const separator = value.lastIndexOf('@');
  if (separator <= 0 || separator === value.length - 1 || value.indexOf('@') !== separator) return false;
  const username = value.slice(0, separator);
  const hostname = value.slice(separator + 1).toLowerCase();
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(username)) return false;
  try {
    const parsed = new URL(`https://${hostname}`);
    return parsed.hostname === hostname && parsed.pathname === '/' && hostname.includes('.');
  } catch {
    return false;
  }
}

function derivedHostname(href: string | null) {
  return href ? safeHostname(href) : null;
}

function displayUrl(url: URL) {
  return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
}

function enumValue<T extends Record<string, string>>(values: T, value: unknown, code: string, message: string): T[keyof T] {
  if (typeof value !== 'string' || !Object.values(values).includes(value)) profileLinkError(code, message);
  return value as T[keyof T];
}

function withoutHostname(value: ValidatedProfileLink) {
  const { hostname: _hostname, ...data } = value;
  return data;
}

function safeHostname(url: string) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

function profileLinkError(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

function rethrowProfileLinkConstraint(error: unknown): never {
  if (error instanceof BadRequestException) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') profileLinkError('PROFILE_LINK_PLATFORM_EXISTS', 'This profile link already exists.');
  throw error;
}
