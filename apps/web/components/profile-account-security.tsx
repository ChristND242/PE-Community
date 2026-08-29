'use client';

import { Fingerprint, KeyRound, Mail, MonitorSmartphone, ShieldCheck, UserRound } from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiRequestError, apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import { Card, LoadingButton } from './ui';
import { isStepUpCancellation, useStepUpAuthentication } from './step-up-authentication-dialog';

export type ProfileAccountTab = 'basic' | 'email' | 'password' | 'two-factor' | 'passkeys' | 'sessions';

export function ProfileAccountTabs({ activeTab, idPrefix, onChange }: { activeTab: ProfileAccountTab; idPrefix: string; onChange: (tab: ProfileAccountTab) => void }) {
  const { t } = useI18n();
  const tabs = [
    { key: 'basic' as const, label: t.security.basicInformation, icon: UserRound },
    { key: 'email' as const, label: t.security.emailAddress, icon: Mail },
    { key: 'password' as const, label: t.common.password, icon: KeyRound },
    { key: 'two-factor' as const, label: t.security.twoFactorAuthentication, icon: ShieldCheck },
    { key: 'passkeys' as const, label: t.security.passkeys, icon: Fingerprint },
    { key: 'sessions' as const, label: t.security.sessionsAndActivity, icon: MonitorSmartphone },
  ];

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (isProfileAccountTab(requestedTab)) onChange(requestedTab);
  }, [onChange]);

  function selectTab(tab: ProfileAccountTab) {
    const url = new URL(window.location.href);
    if (tab === 'basic') url.searchParams.delete('tab');
    else url.searchParams.set('tab', tab);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    onChange(tab);
  }

  return (
    <div className="flex w-full justify-start">
      <nav role="tablist" aria-label={t.dashboard.profileTitle} className="inline-flex w-fit max-w-full min-w-0 flex-wrap gap-2 rounded-[1.35rem] border border-white/[0.08] bg-white/[0.03] p-1.5 shadow-2xl shadow-black/10">
        {tabs.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              id={`${idPrefix}-${key}-tab`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${idPrefix}-${key}-panel`}
              onClick={() => selectTab(key)}
              className={cn(
                'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/25',
                active
                  ? 'border-accent/25 bg-accent/15 text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                  : 'border-transparent text-white/58 hover:bg-white/[0.055] hover:text-white',
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

type EmailChangeStatus = {
  currentEmail: string;
  emailVerified: boolean;
  pending: {
    requestId: string;
    maskedNewEmail: string;
    expiresAt: string;
    canResendAt: string;
  } | null;
};

export function EmailChangePanel() {
  const { t } = useI18n();
  const stepUp = useStepUpAuthentication();
  const [status, setStatus] = useState<EmailChangeStatus | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState<'verify-current' | 'request' | 'resend' | 'cancel' | ''>('');
  const [now, setNow] = useState(() => Date.now());

  async function loadStatus() {
    setStatus(await apiFetch<EmailChangeStatus>('/auth/email-change/status'));
  }

  useEffect(() => {
    void loadStatus().catch(() => toast.error(t.security.emailChangeActionFailed));
  }, [t.security.emailChangeActionFailed]);

  useEffect(() => {
    if (!status?.pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [status?.pending]);

  async function requestChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!currentPassword || !newEmail || !confirmEmail) {
      toast.error(t.security.emailChangeRequestFailed);
      return;
    }
    if (newEmail.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      toast.error(t.security.emailAddressesDoNotMatch);
      return;
    }
    setBusy('request');
    try {
      await stepUp.run(() => apiFetch('/auth/email-change/request', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newEmail }),
      }));
      await loadStatus();
      setCurrentPassword('');
      setNewEmail('');
      setConfirmEmail('');
      toast.success(t.security.emailChangeRequested);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      await loadStatus().catch(() => undefined);
      toast.error(error instanceof ApiRequestError && error.status === 409
        ? t.security.emailUnavailable
        : t.security.emailChangeRequestFailed);
    } finally {
      setBusy('');
    }
  }

  async function sendPrimaryVerification() {
    if (busy || !status || status.emailVerified) return;
    setBusy('verify-current');
    try {
      await apiFetch('/auth/email-verification/send', { method: 'POST' });
      await loadStatus();
      toast.success(t.security.primaryVerificationSent);
    } catch {
      toast.error(t.security.primaryVerificationFailed);
    } finally {
      setBusy('');
    }
  }

  async function resend() {
    if (busy || !status?.pending) return;
    setBusy('resend');
    try {
      await apiFetch('/auth/email-change/resend', { method: 'POST' });
      await loadStatus();
      toast.success(t.security.verificationResent);
    } catch {
      toast.error(t.security.emailChangeActionFailed);
    } finally {
      setBusy('');
    }
  }

  async function cancel() {
    if (busy || !status?.pending) return;
    setBusy('cancel');
    try {
      await apiFetch('/auth/email-change', { method: 'DELETE' });
      await loadStatus();
      toast.success(t.security.emailChangeCancelled);
    } catch {
      toast.error(t.security.emailChangeActionFailed);
    } finally {
      setBusy('');
    }
  }

  const resendAvailable = Boolean(status?.pending && new Date(status.pending.canResendAt).getTime() <= now);

  return (
    <>
    <Card className="min-w-0 overflow-hidden rounded-[1.35rem] border-white/[0.08] bg-white/[0.035] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="border-b border-white/[0.06] px-5 py-5 md:px-6">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-white md:text-lg">{t.security.changeEmailAddress}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">{t.security.changeEmailDescription}</p>
      </div>
      <div className="space-y-5 p-5 md:p-6">
        <div className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3">
          <p className="text-xs font-medium uppercase text-white/42">{t.security.currentEmailAddress}</p>
          <p className="mt-1 break-all text-sm font-semibold text-white">{status?.currentEmail ?? t.common.loading}</p>
          {status && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
              <span className={`text-xs font-semibold ${status.emailVerified ? 'text-emerald-300' : 'text-amber-200'}`}>
                {status.emailVerified ? t.security.emailVerified : t.security.emailNotVerified}
              </span>
              {!status.emailVerified && (
                <LoadingButton
                  type="button"
                  loading={busy === 'verify-current'}
                  loadingLabel={t.security.sendingPrimaryVerification}
                  disabled={Boolean(busy)}
                  onClick={sendPrimaryVerification}
                  className="verification-heartbeat cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-200/45"
                >
                  {t.security.sendPrimaryVerification}
                </LoadingButton>
              )}
            </div>
          )}
        </div>

        {status?.pending ? (
          <div className="rounded-xl border border-emerald-300/[0.16] bg-emerald-400/[0.07] p-4">
            <p className="text-sm font-semibold text-emerald-200">{t.security.emailChangePending(status.pending.maskedNewEmail)}</p>
            <p className="mt-2 text-sm leading-6 text-white/52">{t.security.emailChangePendingHelp}</p>
            {!resendAvailable && <p className="mt-2 text-xs text-white/40">{t.security.resendAvailableSoon}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <LoadingButton
                type="button"
                loading={busy === 'resend'}
                loadingLabel={t.security.resendingVerification}
                disabled={Boolean(busy) || !resendAvailable}
                onClick={resend}
              >
                {t.security.resendVerification}
              </LoadingButton>
              <LoadingButton
                type="button"
                loading={busy === 'cancel'}
                loadingLabel={t.security.cancellingEmailChange}
                disabled={Boolean(busy)}
                onClick={cancel}
                className="bg-white/10 text-white hover:bg-white/15"
              >
                {t.security.cancelEmailChange}
              </LoadingButton>
            </div>
          </div>
        ) : (
          <form onSubmit={requestChange} className="grid gap-4 md:grid-cols-2">
            <label className="block min-w-0 md:col-span-2">
              <span className="text-sm font-medium text-white/72">{t.security.currentPassword}</span>
              <input
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none transition focus:border-accent/55 focus:ring-2 focus:ring-accent/10"
              />
            </label>
            <EmailField label={t.security.newEmailAddress} value={newEmail} autoComplete="email" onChange={setNewEmail} />
            <EmailField label={t.security.confirmNewEmailAddress} value={confirmEmail} autoComplete="email" onChange={setConfirmEmail} />
            <div className="flex justify-end border-t border-white/[0.06] pt-4 md:col-span-2">
              <LoadingButton
                type="submit"
                loading={busy === 'request'}
                loadingLabel={t.security.requestingEmailChange}
                disabled={Boolean(busy)}
              >
                {t.security.requestEmailChange}
              </LoadingButton>
            </div>
          </form>
        )}
      </div>
    </Card>
    {stepUp.dialog}
    </>
  );
}

function isProfileAccountTab(value: string | null): value is ProfileAccountTab {
  return value === 'basic' || value === 'email' || value === 'password' || value === 'two-factor' || value === 'passkeys';
}

function EmailField({ label, value, autoComplete, onChange }: { label: string; value: string; autoComplete: string; onChange: (value: string) => void }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium text-white/72">{label}</span>
      <input
        type="email"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none transition focus:border-accent/55 focus:ring-2 focus:ring-accent/10"
      />
    </label>
  );
}

export function ProfileTabPanel({ active, id, labelledBy, children }: { active: boolean; id: string; labelledBy: string; children: ReactNode }) {
  if (!active) return null;
  return <div id={id} role="tabpanel" aria-labelledby={labelledBy}>{children}</div>;
}

export function PasswordChangePanel() {
  const { t } = useI18n();
  const stepUp = useStepUpAuthentication();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t.security.passwordFieldsRequired);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t.security.passwordsDoNotMatch);
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t.security.passwordChangeValidation);
      return;
    }

    setLoading(true);
    try {
      await stepUp.run(() => apiFetch('/auth/change-required-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t.security.passwordUpdated);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.security.passwordUpdateFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <Card className="min-w-0 overflow-hidden rounded-[1.35rem] border-white/[0.08] bg-white/[0.035] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="border-b border-white/[0.06] px-5 py-5 md:px-6">
        <h2 className="text-base font-semibold tracking-[-0.02em] text-white md:text-lg">{t.security.changePassword}</h2>
      </div>
      <form onSubmit={submit} className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
        <PasswordField label={t.security.currentPassword} value={currentPassword} autoComplete="current-password" onChange={setCurrentPassword} className="md:col-span-2" />
        <PasswordField label={t.security.newPassword} value={newPassword} autoComplete="new-password" onChange={setNewPassword} />
        <PasswordField label={t.security.confirmNewPassword} value={confirmPassword} autoComplete="new-password" onChange={setConfirmPassword} />
        <div className="flex justify-end border-t border-white/[0.06] pt-4 md:col-span-2">
          <LoadingButton type="submit" loading={loading} loadingLabel={t.security.changingPassword} disabled={loading}>{t.security.changePassword}</LoadingButton>
        </div>
      </form>
    </Card>
    {stepUp.dialog}
    </>
  );
}

function PasswordField({ label, value, autoComplete, className, onChange }: { label: string; value: string; autoComplete: string; className?: string; onChange: (value: string) => void }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="text-sm font-medium text-white/72">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none transition focus:border-accent/55 focus:ring-2 focus:ring-accent/10"
      />
    </label>
  );
}
