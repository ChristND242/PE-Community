'use client';

import { AlertTriangle, ArrowLeft, CalendarDays, Check, KeyRound, Mail, MapPin, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '../../../../components/shell';
import { IdentityVerificationBadge } from '../../../../components/identity-verification-badge';
import { ProfilePhoto } from '../../../../components/profile-photo';
import { ProfileSocialLinks } from '../../../../components/profile-social-links';
import { Card, ConfirmDialog, LoadingButton, StatusBadge, TableErrorState, TableSkeleton } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { identityVerificationForRole } from '../../../../lib/identity-verification';
import { statusLabel, useI18n } from '../../../../lib/i18n';
import { PERMISSIONS, hasPermission } from '../../../../lib/permissions';
import { userRoleLabel } from '../../../../lib/user-role';
import { cn, formatDate } from '../../../../lib/utils';
import type { ProfileLinkDto } from '../../../../lib/profile-links';
import { isStepUpCancellation, useStepUpAuthentication } from '../../../../components/step-up-authentication-dialog';

type Member = {
  id: string;
  status: string;
  joinedAt: string;
  role: { key: string };
  user: { id: string; name: string; email: string; createdAt: string; twoFactorEnabled?: boolean };
  profileLinks?: ProfileLinkDto[];
  profile?: {
    title?: string | null;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
    bio?: string | null;
    birthdate?: string | null;
    passportExpiresAt?: string | null;
    location?: string | null;
    interests?: string[];
    skills?: string[];
  } | null;
};

type FormState = {
  name: string;
  title: string;
  avatarUrl: string;
  bio: string;
  birthdate: string;
  passportExpiresAt: string;
  location: string;
  interests: string;
  skills: string;
  roleKey: string;
};

const roleOptions = ['member', 'admin', 'owner'];
type CurrentUser = { id: string; role: string; permissions?: string[] };

export default function AdminMemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang, t } = useI18n();
  const stepUp = useStepUpAuthentication();
  const [member, setMember] = useState<Member | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [confirming, setConfirming] = useState<'suspend' | 'reactivate' | 'remove' | null>(null);
  const [confirmingPasswordReset, setConfirmingPasswordReset] = useState(false);
  const [confirmingTwoFactorReset, setConfirmingTwoFactorReset] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resettingTwoFactor, setResettingTwoFactor] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(true);

  async function load() {
    setError('');
    try {
      const [user, data] = await Promise.all([
        apiFetch<CurrentUser>('/auth/me'),
        apiFetch<Member>(`/admin/${COMMUNITY_ID}/members/${id}`),
      ]);
      setCurrentUser(user);
      setMember(data);
      setForm({
        name: data.user.name,
        title: data.profile?.title ?? '',
        avatarUrl: data.profile?.avatarUrl ?? '',
        bio: data.profile?.bio ?? '',
        birthdate: dateInputValue(data.profile?.birthdate),
        passportExpiresAt: dateInputValue(data.profile?.passportExpiresAt),
        location: data.profile?.location ?? '',
        interests: (data.profile?.interests ?? []).join(', '),
        skills: (data.profile?.skills ?? []).join(', '),
        roleKey: data.role.key,
      });
    } catch {
      setError(t.admin.adminMemberLoadFailed);
    }
  }

  useEffect(() => {
    load();
  }, [id, t.admin.adminMemberLoadFailed]);

  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const completion = useMemo(() => form ? profileCompletion(form, Boolean(member?.profileLinks?.length)) : 0, [form, member?.profileLinks?.length]);
  const memberSince = member ? formatDate(member.joinedAt ?? member.user.createdAt, locale) : '';
  const roleChanged = Boolean(form && member && form.roleKey !== member.role.key);
  const actionPending = saving || savingRole || confirmLoading || resettingPassword || resettingTwoFactor;
  const canManageRoles = hasPermission(currentUser, PERMISSIONS.rolesManage);
  const canUpdateMembers = hasPermission(currentUser, PERMISSIONS.membersUpdate);
  const canSuspendMembers = hasPermission(currentUser, PERMISSIONS.membersSuspend);
  const canDeleteMembers = hasPermission(currentUser, PERMISSIONS.membersDelete);
  const canUpdatePassportExpiration = hasPermission(currentUser, PERMISSIONS.passportExpirationUpdateAdmin);
  const canResetTwoFactor = Boolean(canUpdateMembers && currentUser?.id !== member?.user.id);

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => current ? { ...current, [field]: value } : current);
  }

  async function saveMember() {
    if (!form || saving) return;
    setValidation('');
    if (!form.name.trim()) {
      setValidation(t.dashboard.nameRequired);
      return;
    }
    setSaving(true);
    try {
      const updated = await apiFetch<Member>(`/admin/${COMMUNITY_ID}/members/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          title: form.title,
          avatarUrl: form.avatarUrl,
          bio: form.bio,
          birthdate: form.birthdate,
          passportExpiresAt: form.passportExpiresAt,
          location: form.location,
          interests: form.interests,
          skills: form.skills,
        }),
      });
      setMember(updated);
      toast.success(t.admin.memberUpdated);
    } catch {
      toast.error(t.admin.memberUpdateFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveRole() {
    if (!form || savingRole || !roleChanged) return;
    setSavingRole(true);
    try {
      const updated = await stepUp.run(() => apiFetch<Member>(`/admin/${COMMUNITY_ID}/members/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ roleKey: form.roleKey }),
      }));
      setMember(updated);
      toast.success(t.admin.roleUpdated);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.admin.roleUpdateFailed);
    } finally {
      setSavingRole(false);
    }
  }

  async function confirmAction() {
    if (!confirming || confirmLoading) return;
    setConfirmLoading(true);
    try {
      const updated = await stepUp.run(() => apiFetch<Member>(`/admin/${COMMUNITY_ID}/members/${id}/${confirming === 'remove' ? 'remove' : 'suspend'}`, {
        method: 'PATCH',
        body: confirming === 'remove' ? undefined : JSON.stringify({ status: confirming === 'reactivate' ? 'ACTIVE' : 'SUSPENDED' }),
      }));
      if (confirming === 'remove') {
        router.push('/admin/members');
        return;
      }
      setMember(updated);
      toast.success(confirming === 'reactivate' ? t.admin.memberReactivated : t.admin.memberSuspended);
      setConfirming(null);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(confirming === 'remove' ? t.admin.removeFailed : confirming === 'reactivate' ? t.admin.reactivateFailed : t.admin.suspendFailed);
    } finally {
      setConfirmLoading(false);
    }
  }

  async function resetPassword() {
    if (resettingPassword || temporaryPassword.trim().length < 8) {
      toast.error(t.admin.temporaryPasswordValidation);
      return;
    }
    setResettingPassword(true);
    try {
      await stepUp.run(() => apiFetch(`/admin/${COMMUNITY_ID}/members/${id}/reset-password`, {
        method: 'PATCH',
        body: JSON.stringify({ temporaryPassword, forcePasswordChange }),
      }));
      toast.success(t.admin.passwordResetSuccess);
      setTemporaryPassword('');
      setForcePasswordChange(true);
      setConfirmingPasswordReset(false);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.admin.passwordResetFailed);
    } finally {
      setResettingPassword(false);
    }
  }

  async function resetTwoFactor() {
    if (resettingTwoFactor || !canResetTwoFactor) return;
    setResettingTwoFactor(true);
    try {
      const updated = await stepUp.run(() => apiFetch<Member>(`/admin/${COMMUNITY_ID}/members/${id}/2fa/reset`, { method: 'POST' }));
      setMember(updated);
      toast.success(t.admin.twoFactorResetSuccess);
      setConfirmingTwoFactorReset(false);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.admin.twoFactorResetFailed);
    } finally {
      setResettingTwoFactor(false);
    }
  }

  const confirmTitle = confirming === 'remove' ? t.admin.removeConfirmTitle : confirming === 'reactivate' ? t.admin.reactivateConfirmTitle : t.admin.suspendConfirmTitle;
  const confirmDescription = confirming === 'remove' ? t.admin.removeConfirmDescription : confirming === 'reactivate' ? t.admin.reactivateConfirmDescription : t.admin.suspendConfirmDescription;
  const confirmLabel = confirming === 'remove' ? t.admin.removeMember : confirming === 'reactivate' ? t.admin.reactivateMember : t.admin.suspendMember;

  return (
    <AppShell admin>
      <div className="space-y-6">
        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !member || !form ? (
          <DetailSkeleton />
        ) : (
          <>
            <header className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.028))] shadow-2xl shadow-black/20">
              <div className="border-b border-white/10 px-4 py-3 sm:px-5">
                <Link href="/admin/members" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-sm font-semibold text-white/62 transition hover:border-accent/35 hover:bg-accent/10 hover:text-accent">
                  <ArrowLeft size={15} />
                  {t.common.back}
                </Link>
              </div>
              <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
                  <ProfilePhoto name={member.user.name} avatarUrl={form.avatarUrl} dicebearStyle={member.profile?.dicebearStyle} dicebearSeed={member.profile?.dicebearSeed} size="lg" />
                  <div className="min-w-0">
                    <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight text-white md:text-3xl"><span className="truncate">{member.user.name}</span><IdentityVerificationBadge kind={identityVerificationForRole(member.role.key)} size="md" /></h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/55">
                      <span className="inline-flex items-center gap-2"><Mail size={15} />{member.user.email}</span>
                      <span className="inline-flex items-center gap-2"><CalendarDays size={15} />{t.admin.memberSinceLabel} {memberSince}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <StatusBadge tone={member.status === 'ACTIVE' ? 'good' : member.status === 'PENDING' ? 'warn' : 'bad'}>{statusLabel(t, member.status)}</StatusBadge>
                  <StatusBadge>{userRoleLabel(t, member.role.key)}</StatusBadge>
                </div>
              </div>
            </header>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.058),rgba(255,255,255,0.025))] p-0 shadow-2xl shadow-black/20">
                <div className="border-b border-white/10 px-5 py-4">
                  <p className="text-base font-semibold text-white">{t.admin.editMember}</p>
                  <p className="mt-1 text-sm text-white/48">{t.admin.memberDetailSubtitle}</p>
                </div>
                <div className="space-y-6 p-5">
                  <FormSection title={t.admin.identity} description={t.admin.identityDescription}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={t.dashboard.fullName} value={form.name} onChange={(value) => updateField('name', value)} error={validation} />
                      <Field label={t.dashboard.titleLabel} value={form.title} onChange={(value) => updateField('title', value)} />
                      <Field label={t.admin.profilePicture} value={form.avatarUrl} placeholder={t.admin.profilePicturePlaceholder} onChange={(value) => updateField('avatarUrl', value)} />
                      <Field label={t.common.location} value={form.location} onChange={(value) => updateField('location', value)} />
                      <Field type="date" label={t.dashboard.birthdate} value={form.birthdate} description={t.dashboard.birthdatePrivacyHelp} onChange={(value) => updateField('birthdate', value)} />
                      <Field type="date" label={t.dashboard.passportExpirationDate} value={form.passportExpiresAt} description={t.dashboard.passportExpirationHelp} disabled={!canUpdatePassportExpiration} onChange={(value) => updateField('passportExpiresAt', value)} />
                    </div>
                  </FormSection>

                  <FormSection title={t.admin.profileDetails} description={t.admin.profileDetailsDescription}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label={t.dashboard.interests} value={form.interests} description={t.admin.fieldHintCommaList} onChange={(value) => updateField('interests', value)} />
                      <Field label={t.dashboard.skills} value={form.skills} description={t.admin.fieldHintCommaList} onChange={(value) => updateField('skills', value)} />
                      <label className="md:col-span-2">
                        <span className="text-sm font-medium text-white/72">{t.dashboard.bio}</span>
                        <textarea value={form.bio} onChange={(event) => updateField('bio', event.target.value)} rows={4} className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm leading-6 text-white outline-none transition placeholder:text-white/32 focus:border-accent/60 focus:bg-black/30" />
                      </label>
                    </div>
                  </FormSection>

                  <FormSection title={t.admin.socialLinks} description={t.admin.socialLinksDescription}>
                    <ProfileSocialLinks endpoint={`/admin/${COMMUNITY_ID}/members/${id}/profile-links`} initialLinks={member.profileLinks ?? []} canManage={canUpdateMembers} onChange={(profileLinks) => setMember((current) => current ? { ...current, profileLinks } : current)} />
                  </FormSection>

                  <div className="flex justify-end border-t border-white/10 pt-5">
                    <LoadingButton loading={saving} loadingLabel={t.admin.updatingMember} disabled={actionPending} onClick={saveMember}>
                      {t.admin.updateMember}
                    </LoadingButton>
                  </div>
                </div>
              </Card>

              <aside className="space-y-6">
                <Card className="rounded-2xl border-white/10 bg-white/[0.035] shadow-xl shadow-black/10">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                      <UserRound size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.dashboard.profileSummary}</p>
                      <p className="text-xs text-white/45">{t.admin.profileCompletion}: {completion}% {t.admin.complete}</p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    <SummaryRow label={t.admin.memberEmailLabel} value={member.user.email} />
                    <SummaryRow label={t.admin.currentRole} value={userRoleLabel(t, member.role.key)} />
                    <SummaryRow label={t.admin.currentStatus} value={statusLabel(t, member.status)} />
                    <SummaryRow label={t.admin.memberSinceLabel} value={memberSince} />
                    <SummaryRow label={t.common.location} value={form.location || t.dashboard.noLocation} icon={<MapPin size={14} />} />
                  </div>
                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan-300" style={{ width: `${completion}%` }} />
                  </div>
                </Card>

                <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(94,210,156,0.07),rgba(255,255,255,0.026))] shadow-xl shadow-black/10">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-accent">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.admin.accessControls}</p>
                      <p className="mt-1 text-sm leading-6 text-white/50">{t.admin.roleDescription}</p>
                    </div>
                  </div>
                  <RolePicker value={form.roleKey} disabled={actionPending || !canManageRoles} options={roleOptions} onChange={(value) => updateField('roleKey', value)} />
                  <LoadingButton loading={savingRole} loadingLabel={t.admin.changingRole} disabled={actionPending || !roleChanged || !canManageRoles} onClick={saveRole} className="mt-4 w-full bg-white/10 text-white hover:bg-white/15 disabled:opacity-45">
                    {t.admin.changeRole}
                  </LoadingButton>
                </Card>

                <Card className="rounded-2xl border-white/10 bg-white/[0.035] shadow-xl shadow-black/10">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-accent">
                      <KeyRound size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.admin.resetPassword}</p>
                      <p className="mt-1 text-sm leading-6 text-white/50">{t.admin.resetPasswordDescription}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <Field label={t.admin.temporaryPassword} value={temporaryPassword} type="password" onChange={setTemporaryPassword} />
                    <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/70">
                      <input type="checkbox" checked={forcePasswordChange} onChange={(event) => setForcePasswordChange(event.target.checked)} className="h-5 w-5 accent-[#5ed29c]" />
                      <span>{t.admin.requirePasswordChangeOnNextLogin}</span>
                    </label>
                    <LoadingButton loading={resettingPassword} loadingLabel={t.admin.resettingPassword} disabled={actionPending || temporaryPassword.trim().length < 8} onClick={() => setConfirmingPasswordReset(true)} className="w-full bg-white/10 text-white hover:bg-white/15">
                      <KeyRound size={16} />
                      {t.admin.resetPassword}
                    </LoadingButton>
                  </div>
                </Card>

                <Card className="rounded-2xl border-white/10 bg-white/[0.035] shadow-xl shadow-black/10">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 text-accent">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.admin.twoFactorReset}</p>
                      <p className="mt-1 text-sm leading-6 text-white/50">{t.admin.twoFactorResetMemberDescription}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <SummaryRow label={t.security.twoFactorAuthentication} value={member.user.twoFactorEnabled ? t.security.twoFactorEnabled : t.security.twoFactorDisabled} />
                    <LoadingButton loading={resettingTwoFactor} loadingLabel={t.admin.resettingTwoFactor} disabled={actionPending || !canResetTwoFactor || !member.user.twoFactorEnabled} onClick={() => setConfirmingTwoFactorReset(true)} className="w-full bg-white/10 text-white hover:bg-white/15">
                      <ShieldCheck size={16} />
                      {t.admin.resetTwoFactorAuthentication}
                    </LoadingButton>
                    {!canResetTwoFactor && <p className="text-xs leading-5 text-white/42">{t.admin.twoFactorResetPermissionDenied}</p>}
                  </div>
                </Card>

                <Card className="rounded-2xl border-rose-300/20 bg-[linear-gradient(180deg,rgba(244,63,94,0.08),rgba(255,255,255,0.022))] shadow-xl shadow-black/10">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rose-200/20 bg-rose-300/10 text-rose-100">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{t.admin.dangerZone}</p>
                      <p className="mt-1 text-sm leading-6 text-white/50">{t.admin.dangerZoneDescription}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3">
                    {canSuspendMembers && member.status === 'ACTIVE' && <LoadingButton loading={confirmLoading && confirming === 'suspend'} loadingLabel={t.admin.suspendingMember} disabled={actionPending} onClick={() => setConfirming('suspend')} className="w-full border border-amber-200/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15">
                      <AlertTriangle size={16} />
                      {t.admin.suspendMember}
                    </LoadingButton>}
                    {canSuspendMembers && member.status === 'SUSPENDED' && <LoadingButton loading={confirmLoading && confirming === 'reactivate'} loadingLabel={t.admin.reactivatingMember} disabled={actionPending} onClick={() => setConfirming('reactivate')} className="w-full border border-emerald-200/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15">
                      <Check size={16} />
                      {t.admin.reactivateMember}
                    </LoadingButton>}
                    {canDeleteMembers && <LoadingButton loading={confirmLoading && confirming === 'remove'} loadingLabel={t.admin.removingMember} disabled={actionPending} onClick={() => setConfirming('remove')} className="w-full border border-rose-200/20 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15">
                      <Trash2 size={16} />
                      {t.admin.removeMember}
                    </LoadingButton>}
                  </div>
                </Card>
              </aside>
            </div>
          </>
        )}
        <ConfirmDialog open={Boolean(confirming)} title={confirmTitle} description={confirmDescription} confirmLabel={confirmLabel} cancelLabel={t.common.cancel} loading={confirmLoading} onConfirm={confirmAction} onCancel={() => setConfirming(null)} />
        <ConfirmDialog open={confirmingPasswordReset} title={t.admin.resetPasswordConfirmTitle} description={t.admin.resetPasswordConfirmDescription} confirmLabel={t.admin.resetPassword} cancelLabel={t.common.cancel} loading={resettingPassword} onConfirm={resetPassword} onCancel={() => setConfirmingPasswordReset(false)} />
        <ConfirmDialog open={confirmingTwoFactorReset} title={t.admin.twoFactorResetConfirmTitle} description={t.admin.twoFactorResetConfirmDescription} confirmLabel={t.admin.confirmReset} cancelLabel={t.common.cancel} loading={resettingTwoFactor} onConfirm={resetTwoFactor} onCancel={() => setConfirmingTwoFactorReset(false)} />
        {stepUp.dialog}
      </div>
    </AppShell>
  );

  function RolePicker({ value, options, disabled, onChange }: { value: string; options: string[]; disabled?: boolean; onChange: (value: string) => void }) {
    return (
      <div className="mt-4 grid gap-2">
        {options.map((roleKey) => {
          const active = value === roleKey;
          return (
            <button
              key={roleKey}
              type="button"
              disabled={disabled}
              onClick={() => onChange(roleKey)}
              className={cn(
                'flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                active ? 'border-accent/35 bg-accent/10 text-white shadow-lg shadow-accent/5' : 'border-white/10 bg-black/20 text-white/62 hover:border-white/20 hover:bg-white/[0.045] hover:text-white',
              )}
            >
              <span className="font-semibold">{userRoleLabel(t, roleKey)}</span>
              {active && <Check size={16} className="text-accent" />}
            </button>
          );
        })}
      </div>
    );
  }
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <TableSkeleton rows={2} columns={3} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TableSkeleton rows={7} columns={2} />
        <TableSkeleton rows={6} columns={1} />
      </div>
    </div>
  );
}

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/10 p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-white/45">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, description, error, placeholder, type = 'text', disabled = false, onChange }: { label: string; value: string; description?: string; error?: string; placeholder?: string; type?: string; disabled?: boolean; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-white/72">{label}</span>
      <input type={type} value={value} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-accent/60 focus:bg-black/30 disabled:cursor-not-allowed disabled:opacity-55" />
      {description && <span className="mt-1.5 block text-xs text-white/38">{description}</span>}
      {error && <span className="mt-1.5 block text-xs text-rose-200">{error}</span>}
    </label>
  );
}

function SummaryRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-white/36">{icon}{label}</span>
      <span className="min-w-0 truncate text-right text-sm text-white/72">{value}</span>
    </div>
  );
}

function profileCompletion(form: FormState, hasProfileLinks: boolean) {
  const fields = [
    form.name,
    form.title,
    form.avatarUrl,
    form.bio,
    form.birthdate,
    form.location,
    form.interests,
    form.skills,
    hasProfileLinks ? 'configured' : '',
  ];
  return Math.round((fields.filter((value) => value.trim()).length / fields.length) * 100);
}

function dateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}
