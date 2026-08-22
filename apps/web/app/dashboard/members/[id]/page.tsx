'use client';

import { CalendarDays, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/shell';
import { ProfilePhoto } from '../../../../components/profile-photo';
import { ProfileLinkDisplay } from '../../../../components/profile-link-display';
import { TableErrorState, TableSkeleton } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { useI18n } from '../../../../lib/i18n';
import { userRoleLabel } from '../../../../lib/user-role';
import { formatDate } from '../../../../lib/utils';
import type { ProfileLinkDto, ProfileLinkPlatform } from '../../../../lib/profile-links';

type Member = {
  id: string;
  status: string;
  joinedAt: string;
  role: { key: string };
  user: { name: string; email: string; createdAt: string };
  profileLinks?: ProfileLinkDto[];
  profile?: {
    title?: string | null;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
    bio?: string | null;
    location?: string | null;
    interests?: string[];
    skills?: string[];
  } | null;
};

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang, t } = useI18n();
  const [member, setMember] = useState<Member | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      setMember(await apiFetch<Member>(`/communities/${COMMUNITY_ID}/members/${id}`));
    } catch {
      setError(t.dashboard.memberLoadFailed);
    }
  }

  useEffect(() => {
    load();
  }, [id, t.dashboard.memberLoadFailed]);

  return (
    <AppShell>
      <div className="space-y-6">
        <Link href="/dashboard/members" className="text-sm font-semibold text-white/55 transition hover:text-accent">{t.common.back}</Link>
        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !member ? (
          <TableSkeleton rows={6} columns={2} />
        ) : (
          <>
            <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/20" aria-labelledby="member-profile-name">
              <div className="relative h-40 overflow-hidden sm:h-48" aria-hidden="true">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(52,211,153,0.22),transparent_34%),radial-gradient(circle_at_88%_4%,rgba(56,189,248,0.17),transparent_36%),linear-gradient(135deg,rgba(9,24,19,0.98),rgba(5,12,18,0.99))]" />
                <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(135deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#07100c] to-transparent" />
              </div>
              <div className="relative -mt-12 px-5 pb-6 text-center sm:-mt-14 sm:px-8 sm:pb-7">
                <div className="relative mx-auto h-24 w-24 sm:h-28 sm:w-28">
                  <ProfilePhoto
                    name={member.user.name}
                    alt={member.user.name}
                    avatarUrl={member.profile?.avatarUrl}
                    dicebearStyle={member.profile?.dicebearStyle}
                    dicebearSeed={member.profile?.dicebearSeed}
                    size="lg"
                    className="h-24 w-24 rounded-full border-white/20 bg-[#07100c] text-2xl shadow-2xl shadow-emerald-950/30 ring-4 ring-[#07100c] sm:h-28 sm:w-28"
                  />
                  <span title={userRoleLabel(t, member.role.key)} className="absolute -right-4 bottom-2 z-10 inline-flex max-w-[76px] items-center justify-center truncate rounded-full border border-emerald-300/25 bg-emerald-950/95 px-2 py-1 text-[10px] font-bold uppercase leading-none text-emerald-100 shadow-lg shadow-emerald-950/40 backdrop-blur sm:-right-5 sm:bottom-3">
                    {userRoleLabel(t, member.role.key)}
                  </span>
                </div>
                <div className="mt-4 min-w-0">
                  <h1 id="member-profile-name" className="min-w-0 max-w-full break-words text-2xl font-semibold tracking-tight text-white sm:text-3xl">{member.user.name}</h1>
                </div>
                {member.profile?.title && <p className="mx-auto mt-1.5 max-w-2xl text-sm leading-6 text-white/55">{member.profile.title}</p>}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/48">
                  <span className="inline-flex min-w-0 items-center gap-2"><MapPin size={14} className="shrink-0 text-accent dark:text-emerald-200/70" /><span className="break-words">{member.profile?.location ?? t.dashboard.noLocation}</span></span>
                  <span className="inline-flex items-center gap-2"><CalendarDays size={14} className="shrink-0 text-[var(--app-icon-muted)] dark:text-sky-200/70" />{t.dashboard.memberSince} {formatDate(member.joinedAt ?? member.user.createdAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
                </div>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              <ProfileSection title={t.dashboard.personalDetails}>
                <dl className="divide-y divide-white/[0.07]">
                  <DetailRow label={t.common.location} value={member.profile?.location ?? t.dashboard.noLocation} />
                  <DetailRow label={t.dashboard.memberSince} value={formatDate(member.joinedAt ?? member.user.createdAt, lang === 'fr' ? 'fr-FR' : 'en-US')} />
                  <DetailRow label={t.common.role} value={userRoleLabel(t, member.role.key)} />
                </dl>
              </ProfileSection>

              <ProfileSection title={t.dashboard.profileSummary}>
                {member.profile?.bio ? <p className="whitespace-pre-line text-sm leading-7 text-white/62">{member.profile.bio}</p> : <ProfileEmptyState text={t.dashboard.noBio} />}
              </ProfileSection>

              <ProfileSection title={t.dashboard.socialLinks}>
                {member.profileLinks?.length ? <ProfileLinkDisplay links={member.profileLinks} labels={profilePlatformLabels(t)} openLabel={t.dashboard.profileLinkOpenPlatform} /> : <ProfileEmptyState text={t.dashboard.noSocialLinks} />}
              </ProfileSection>

              <ListCard title={t.dashboard.interests} empty={t.dashboard.noInterests} items={member.profile?.interests ?? []} />
              <ListCard title={t.dashboard.skills} empty={t.dashboard.noSkills} items={member.profile?.skills ?? []} className="xl:col-span-2" />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function profilePlatformLabels(t: ReturnType<typeof useI18n>['t']): Record<ProfileLinkPlatform, string> {
  return { WEBSITE: t.dashboard.website, LINKEDIN: t.dashboard.linkedin, X: t.dashboard.twitter, FACEBOOK: t.dashboard.profilePlatformFacebook, INSTAGRAM: t.dashboard.profilePlatformInstagram, YOUTUBE: t.dashboard.profilePlatformYouTube, TIKTOK: t.dashboard.profilePlatformTikTok, GITHUB: t.dashboard.profilePlatformGitHub, GITLAB: t.dashboard.profilePlatformGitLab, DISCORD: t.dashboard.profilePlatformDiscord, WHATSAPP: t.dashboard.profilePlatformWhatsApp, TELEGRAM: t.dashboard.profilePlatformTelegram, MASTODON: t.dashboard.profilePlatformMastodon, THREADS: t.dashboard.profilePlatformThreads, BLUESKY: t.dashboard.profilePlatformBluesky, OTHER: t.dashboard.profileLinkOther };
}

function ListCard({ title, items, empty, className }: { title: string; items: string[]; empty: string; className?: string }) {
  return (
    <ProfileSection title={title} className={className}>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-sm font-medium text-white/70">{item}</span>)}
        </div>
      ) : <ProfileEmptyState text={empty} />}
    </ProfileSection>
  );
}

function ProfileSection({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/5 backdrop-blur-sm ${className}`}>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfileEmptyState({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-3.5 text-sm text-white/45">{text}</p>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><dt className="text-sm text-white/42">{label}</dt><dd className="text-sm font-medium text-white/72 sm:text-right">{value}</dd></div>;
}
