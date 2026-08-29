'use client';

import { Copy, Download, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Card, LoadingButton } from './ui';
import { isStepUpCancellation, useStepUpAuthentication } from './step-up-authentication-dialog';

type TwoFactorStatus = {
  platformEnabled: boolean;
  enabled: boolean;
  confirmedAt?: string | null;
  backupCodesRemaining: number;
};

type TwoFactorSetup = {
  otpauthUrl: string;
  qrCodeDataUrl: string;
  setupKey: string;
};

export function TwoFactorCard({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const stepUp = useStepUpAuthentication();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedBackupCodes, setSavedBackupCodes] = useState(false);
  const [loading, setLoading] = useState<'load' | 'setup' | 'verify' | 'disable' | null>('load');
  const [regenerating, setRegenerating] = useState(false);

  async function load() {
    setLoading('load');
    try {
      setStatus(await apiFetch<TwoFactorStatus>('/me/2fa/status'));
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => { load(); }, []);

  async function startSetup() {
    if (loading) return;
    setLoading('setup');
    try {
      setSetup(await stepUp.run(() => apiFetch<TwoFactorSetup>('/me/2fa/setup', { method: 'POST' })));
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.security.twoFactorSetupFailed);
    } finally {
      setLoading(null);
    }
  }

  async function verify() {
    if (loading || code.trim().length < 6) return;
    setLoading('verify');
    try {
      const result = await stepUp.run(() => apiFetch<{ enabled: boolean; confirmedAt?: string | null; backupCodes?: string[]; backupCodesRemaining?: number }>('/me/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) }));
      setStatus((current) => current ? { ...current, ...result } : current);
      setSetup(null);
      setCode('');
      setBackupCodes(result.backupCodes ?? []);
      setSavedBackupCodes(false);
      toast.success(t.security.twoFactorEnabledSuccess);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.security.invalidAuthenticationCode);
    } finally {
      setLoading(null);
    }
  }

  async function disable() {
    if (loading || (!password.trim() && !code.trim())) return;
    setLoading('disable');
    try {
      await stepUp.run(() => apiFetch('/me/2fa/disable', { method: 'POST', body: JSON.stringify({ password, code }) }));
      setStatus((current) => current ? { ...current, enabled: false, confirmedAt: null } : current);
      setSetup(null);
      setCode('');
      setPassword('');
      setBackupCodes([]);
      setSavedBackupCodes(false);
      toast.success(t.security.twoFactorDisabledSuccess);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.security.twoFactorDisableFailed);
    } finally {
      setLoading(null);
    }
  }

  async function regenerateBackupCodes() {
    if (regenerating || (!password.trim() && !code.trim())) return;
    setRegenerating(true);
    try {
      const result = await stepUp.run(() => apiFetch<{ backupCodes: string[]; backupCodesRemaining: number }>('/me/2fa/backup-codes/regenerate', { method: 'POST', body: JSON.stringify({ password, code }) }));
      setBackupCodes(result.backupCodes);
      setSavedBackupCodes(false);
      setCode('');
      setPassword('');
      setStatus((current) => current ? { ...current, backupCodesRemaining: result.backupCodesRemaining } : current);
      toast.success(t.security.backupCodesGenerated);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.security.backupCodesGenerateFailed);
    } finally {
      setRegenerating(false);
    }
  }

  async function copyBackupCodes() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      toast.success(t.security.backupCodesCopied);
    } catch {
      toast.error(t.security.backupCodesCopyFailed);
    }
  }

  function downloadBackupCodes() {
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pe-community-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading === 'load') return null;
  if (!status?.platformEnabled) return null;

  return (
    <>
    <Card className={embedded ? 'border-0 bg-transparent p-0 shadow-none' : 'rounded-2xl border-white/10 bg-[#101715] p-4 shadow-black/20'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent"><ShieldCheck size={17} /></span>
          <div>
            <h2 className="text-base font-semibold text-white">{t.security.twoFactorAuthentication}</h2>
            <p className="mt-1 text-sm leading-6 text-white/50">{t.security.authenticatorAppDescription}</p>
          </div>
        </div>
        <span className={status.enabled ? 'rounded-full bg-emerald-300/12 px-3 py-1 text-xs font-semibold text-emerald-100' : 'rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/65'}>
          {status.enabled ? t.security.twoFactorEnabled : t.security.twoFactorDisabled}
        </span>
      </div>

      {!status.enabled && !setup && (
        <div className="mt-5 flex justify-end border-t border-white/10 pt-5">
          <LoadingButton loading={loading === 'setup'} loadingLabel={t.security.startingSetup} onClick={startSetup}>{t.security.enableTwoFactor}</LoadingButton>
        </div>
      )}

      {setup && (
        <div className="mt-5 grid gap-5 border-t border-white/10 pt-5 lg:grid-cols-[14rem_1fr]">
          <div className="rounded-2xl border border-white/10 bg-white p-3">
            <img src={setup.qrCodeDataUrl} alt={t.security.scanQrCode} className="h-full w-full rounded-lg" />
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-white">{t.security.scanQrCode}</p>
              <p className="mt-1 text-sm leading-6 text-white/50">{t.security.copySetupKeyHelp}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/40"><KeyRound size={14} />{t.security.copySetupKey}</div>
              <p className="mt-2 break-all font-mono text-sm text-white/75">{setup.setupKey}</p>
            </div>
            <CodeField label={t.security.verificationCode} value={code} onChange={setCode} />
            <LoadingButton loading={loading === 'verify'} loadingLabel={t.security.verifyingCode} onClick={verify}>{t.security.enableTwoFactor}</LoadingButton>
          </div>
        </div>
      )}

      {status.enabled && (
        <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
          <div className="rounded-xl border border-white/10 bg-black/15 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{t.security.backupCodes}</p>
                <p className="mt-1 text-xs text-white/45">{t.security.backupCodesRemaining(status.backupCodesRemaining)}</p>
              </div>
              <LoadingButton loading={regenerating} loadingLabel={t.security.generatingBackupCodes} onClick={regenerateBackupCodes} className="bg-white/10 text-white hover:bg-white/15"><RefreshCw size={15} />{t.security.regenerateBackupCodes}</LoadingButton>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <CodeField label={t.security.verificationCode} value={code} onChange={setCode} />
            <PasswordField label={t.common.password} value={password} onChange={setPassword} />
            <LoadingButton loading={loading === 'disable'} loadingLabel={t.security.disablingTwoFactor} onClick={disable} className="bg-white/10 text-white hover:bg-white/15">{t.security.disableTwoFactor}</LoadingButton>
          </div>
        </div>
      )}

      {backupCodes.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-700/25 bg-amber-50/85 p-4 dark:border-amber-200/20 dark:bg-amber-300/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{t.security.saveBackupCodesTitle}</p>
              <p className="mt-1 text-sm leading-6 text-stone-700 dark:text-amber-100/70">{t.security.saveBackupCodesDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyBackupCodes} className="inline-flex items-center gap-2 rounded-full border border-amber-800/20 bg-white/75 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-white dark:border-amber-100/20 dark:bg-black/20 dark:text-amber-50 dark:hover:bg-black/30"><Copy size={14} />{t.security.copyBackupCodes}</button>
              <button type="button" onClick={downloadBackupCodes} className="inline-flex items-center gap-2 rounded-full border border-amber-800/20 bg-white/75 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-white dark:border-amber-100/20 dark:bg-black/20 dark:text-amber-50 dark:hover:bg-black/30"><Download size={14} />{t.security.downloadBackupCodes}</button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {backupCodes.map((backupCode) => <code key={backupCode} className="select-all rounded-lg border border-amber-900/15 bg-white/70 px-3 py-2 font-mono text-sm text-stone-950 dark:border-white/10 dark:bg-black/25 dark:text-amber-50">{backupCode}</code>)}
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm text-stone-800 dark:text-amber-50/80">
            <input type="checkbox" checked={savedBackupCodes} onChange={(event) => setSavedBackupCodes(event.target.checked)} className="h-5 w-5 accent-amber-700 dark:accent-[#f5d06f]" />
            {t.security.savedBackupCodes}
          </label>
          {savedBackupCodes && <button type="button" onClick={() => setBackupCodes([])} className="mt-3 rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-950">{t.common.confirm}</button>}
        </div>
      )}
    </Card>
    {stepUp.dialog}
    </>
  );
}

function CodeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-white/72">{label}</span>
      <input inputMode="numeric" maxLength={6} value={value} onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" />
    </label>
  );
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-medium text-white/72">{label}</span>
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" />
    </label>
  );
}
