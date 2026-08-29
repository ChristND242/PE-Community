'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { browserSupportsWebAuthn, startAuthentication, WebAuthnAbortService } from '@simplewebauthn/browser';
import { Copy, Download, Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import { Card, GhostLink, LoadingButton } from '../../components/ui';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { apiUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import {
  browserSupportsConditionalPasskeyAuthentication,
  isPasskeyAuthenticationCancellation,
} from '../../lib/passkey-authentication';

type MfaCodeType = 'authenticator' | 'backup';
type TwoFactorSetup = { otpauthUrl: string; qrCodeDataUrl: string; setupKey: string };
type LoginUser = { role: string; forcePasswordChange?: boolean; community?: unknown };

export default function LoginPage() {
  const { t, applyCommunityDefaults } = useI18n();
  const router = useRouter();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [mfaCodeType, setMfaCodeType] = useState<MfaCodeType>('authenticator');
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [reenrollmentToken, setReenrollmentToken] = useState('');
  const [reenrollmentSetup, setReenrollmentSetup] = useState<TwoFactorSetup | null>(null);
  const [reenrollmentCode, setReenrollmentCode] = useState('');
  const [reenrollmentBackupCodes, setReenrollmentBackupCodes] = useState<string[]>([]);
  const [reenrollmentBackupCodesSaved, setReenrollmentBackupCodesSaved] = useState(false);
  const [reenrollmentUser, setReenrollmentUser] = useState<LoginUser | null>(null);
  const [passwordResetAvailable, setPasswordResetAvailable] = useState(false);
  const conditionalAuthenticationActiveRef = useRef(false);
  const conditionalAuthenticationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get('setup') === 'complete') setMessage(t.setup.loginAfterSetup);
    else if (search.get('reason') === 'inactivity') setMessage(t.auth.sessionExpiredInactivity);
    fetch(apiUrl('/auth/password-reset/status'), { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { available: false })
      .then((data) => setPasswordResetAvailable(Boolean(data.available)))
      .catch(() => setPasswordResetAvailable(false));
  }, [t.auth.sessionExpiredInactivity, t.setup.loginAfterSetup]);

  useEffect(() => {
    const authenticationAbort = new AbortController();
    conditionalAuthenticationAbortRef.current = authenticationAbort;
    conditionalAuthenticationActiveRef.current = true;

    async function startConditionalAuthentication() {
      let assertionSelected = false;
      try {
        if (!await browserSupportsConditionalPasskeyAuthentication()) return;
        const authentication = await beginPasskeyAuthentication(true, authenticationAbort.signal);
        assertionSelected = true;
        if (!conditionalAuthenticationActiveRef.current) return;
        await finishPasskeyAuthentication(
          authentication.attemptId,
          authentication.response,
          authenticationAbort.signal,
        );
      } catch (caught) {
        if (!conditionalAuthenticationActiveRef.current || isPasskeyAuthenticationCancellation(caught)) return;
        if (assertionSelected) setError(t.security.passkeySignInFailed);
      }
    }

    void startConditionalAuthentication();
    return () => {
      conditionalAuthenticationActiveRef.current = false;
      authenticationAbort.abort();
      WebAuthnAbortService.cancelCeremony();
    };
  }, []);

  async function submit(formData: FormData) {
    if (loading) return;
    cancelConditionalAuthentication();
    setError('');
    setMessage('');
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    if (!email || !password) {
      setError(t.auth.invalid);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/login'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!response.ok) {
        setError(t.auth.invalidCredentials);
        return;
      }
      const result = await response.json();
      if (result.twoFactorRequired) {
        setChallengeToken(result.challengeToken);
        return;
      }
      if (result.twoFactorReenrollmentRequired) {
        setReenrollmentToken(result.reenrollmentToken);
        await startOwnerTwoFactorReenrollment(result.reenrollmentToken);
        return;
      }
      applyCommunityDefaults(result.user?.community);
      redirectAfterLogin(result.user);
    } catch {
      setError(t.auth.loginFailed);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithPasskey() {
    if (loading || passkeyLoading) return;
    setError('');
    setMessage('');
    if (!browserSupportsWebAuthn()) {
      setError(t.security.passkeysUnsupported);
      return;
    }
    cancelConditionalAuthentication();
    setPasskeyLoading(true);
    try {
      const authentication = await beginPasskeyAuthentication(false);
      await finishPasskeyAuthentication(authentication.attemptId, authentication.response);
    } catch (caught) {
      setError(passkeyAuthenticationErrorLabel(
        caught,
        t.security.passkeySignInCancelled,
        t.security.passkeySignInFailed,
      ));
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function beginPasskeyAuthentication(useBrowserAutofill: boolean, signal?: AbortSignal) {
    const optionsResponse = await fetch(apiUrl('/auth/passkeys/authentication/options'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!optionsResponse.ok) throw new Error('options failed');
    const { attemptId, options } = await optionsResponse.json();
    if (signal?.aborted || (useBrowserAutofill && !conditionalAuthenticationActiveRef.current)) {
      throw new DOMException('Passkey authentication cancelled.', 'AbortError');
    }
    const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill });
    return { attemptId, response };
  }

  async function finishPasskeyAuthentication(attemptId: string, response: unknown, signal?: AbortSignal) {
    const verificationResponse = await fetch(apiUrl('/auth/passkeys/authentication/verify'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, response }),
      signal,
    });
    if (!verificationResponse.ok) throw new Error('verification failed');
    const { user } = await verificationResponse.json();
    if (signal?.aborted || (signal && !conditionalAuthenticationActiveRef.current)) return;
    applyCommunityDefaults(user?.community);
    redirectAfterLogin(user);
  }

  function cancelConditionalAuthentication() {
    conditionalAuthenticationActiveRef.current = false;
    conditionalAuthenticationAbortRef.current?.abort();
    WebAuthnAbortService.cancelCeremony();
  }

  async function startOwnerTwoFactorReenrollment(token = reenrollmentToken) {
    if (!token) return;
    setError('');
    try {
      const response = await fetch(apiUrl('/auth/login/2fa/reenroll/setup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reenrollmentToken: token }),
      });
      if (!response.ok) throw new Error('setup failed');
      setReenrollmentSetup(await response.json());
    } catch {
      setError(t.security.twoFactorSetupFailed);
    }
  }

  async function completeOwnerTwoFactorReenrollment() {
    if (loading || !/^\d{6}$/.test(reenrollmentCode)) return;
    setError('');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/login/2fa/reenroll/verify'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reenrollmentToken, code: reenrollmentCode }),
      });
      if (!response.ok) {
        setError(t.security.invalidAuthenticationCode);
        return;
      }
      const result = await response.json();
      setReenrollmentBackupCodes(result.backupCodes ?? []);
      setReenrollmentUser(result.user);
      applyCommunityDefaults(result.user?.community);
    } catch {
      setError(t.auth.loginFailed);
    } finally {
      setLoading(false);
    }
  }

  async function copyReenrollmentBackupCodes() {
    await navigator.clipboard?.writeText(reenrollmentBackupCodes.join('\n'));
  }

  function downloadReenrollmentBackupCodes() {
    const blob = new Blob([reenrollmentBackupCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pe-community-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function verifyTwoFactor() {
    const code = mfaCodeType === 'authenticator' ? authenticatorCode : backupCode;
    const codeIsValid = mfaCodeType === 'authenticator' ? /^\d{6}$/.test(code) : code.trim().length >= 6;
    if (loading || !codeIsValid) return;
    setError('');
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/login/2fa'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeToken, code }) });
      if (!response.ok) {
        setError(t.security.invalidAuthenticationCode);
        return;
      }
      const { user } = await response.json();
      applyCommunityDefaults(user?.community);
      redirectAfterLogin(user);
    } catch {
      setError(t.auth.loginFailed);
    } finally {
      setLoading(false);
    }
  }

  function redirectAfterLogin(user: LoginUser) {
    if (user.forcePasswordChange) {
      router.push('/change-password');
      return;
    }
    router.push(user.role === 'owner' || user.role === 'admin' ? '/admin' : '/dashboard');
  }

  const canVerifyTwoFactor = mfaCodeType === 'authenticator' ? /^\d{6}$/.test(authenticatorCode) : backupCode.trim().length >= 6;

  return (
    <AuthFrame
      title={reenrollmentToken ? t.security.ownerMfaReenrollmentTitle : challengeToken ? t.security.enterAuthenticationCode : t.auth.loginTitle}
      compact={Boolean(challengeToken || reenrollmentToken)}
      sideControl={challengeToken ? (
        <MfaCodeTypeSelector
          value={mfaCodeType}
          onChange={(codeType) => { setMfaCodeType(codeType); setError(''); }}
          label={t.security.mfaCodeType}
          authenticatorLabel={t.security.authenticatorCode}
          backupLabel={t.security.backupCode}
          className="grid justify-items-center gap-1.5 rounded-full border border-white/10 bg-black/30 p-1.5 shadow-2xl shadow-black/30 backdrop-blur"
        />
      ) : undefined}
    >
      {reenrollmentToken ? (
        reenrollmentBackupCodes.length > 0 && reenrollmentUser ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-white">{t.security.saveBackupCodesTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-white/58">{t.security.saveBackupCodesDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyReenrollmentBackupCodes} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"><Copy size={14} />{t.security.copyBackupCodes}</button>
              <button type="button" onClick={downloadReenrollmentBackupCodes} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"><Download size={14} />{t.security.downloadBackupCodes}</button>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/25 p-4 font-mono text-sm text-white/80">
              {reenrollmentBackupCodes.map((code) => <span key={code}>{code}</span>)}
            </div>
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" checked={reenrollmentBackupCodesSaved} onChange={(event) => setReenrollmentBackupCodesSaved(event.target.checked)} className="h-5 w-5 accent-[#52d89c]" />
              {t.security.savedBackupCodes}
            </label>
            <LoadingButton disabled={!reenrollmentBackupCodesSaved} onClick={() => redirectAfterLogin(reenrollmentUser)} className="w-full">{t.security.continueAfterReenrollment}</LoadingButton>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm leading-6 text-white/58">{t.security.ownerMfaReenrollmentDescription}</p>
            {reenrollmentSetup ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                  <img src={reenrollmentSetup.qrCodeDataUrl} alt={t.security.scanQrCode} className="mx-auto h-40 w-40 rounded-xl bg-white p-2" />
                  <div className="min-w-0">
                    <p className="text-sm leading-6 text-white/58">{t.security.copySetupKeyHelp}</p>
                    <code className="mt-3 block break-all rounded-lg border border-white/10 bg-black/25 p-3 text-xs text-emerald-200">{reenrollmentSetup.setupKey}</code>
                  </div>
                </div>
                <GroupedOtpInput value={reenrollmentCode} onChange={setReenrollmentCode} disabled={loading} label={t.security.verificationCode} digitLabel={t.security.authenticationCodeDigit} />
                {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
                <LoadingButton loading={loading} loadingLabel={t.security.verifyingCode} disabled={!/^\d{6}$/.test(reenrollmentCode)} onClick={completeOwnerTwoFactorReenrollment} className="w-full">{t.security.enableTwoFactor}</LoadingButton>
              </>
            ) : (
              <>
                {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
                <LoadingButton onClick={() => startOwnerTwoFactorReenrollment()} className="w-full">{t.common.retry}</LoadingButton>
              </>
            )}
          </div>
        )
      ) : challengeToken ? (
        <div>
          <p className="text-sm leading-6 text-white/58">
            {mfaCodeType === 'authenticator' ? t.security.authenticatorCodeDescription : t.security.backupCodeDescription}
          </p>
          <MfaCodeTypeSelector
            value={mfaCodeType}
            onChange={(codeType) => { setMfaCodeType(codeType); setError(''); }}
            label={t.security.mfaCodeType}
            authenticatorLabel={t.security.authenticatorCode}
            backupLabel={t.security.backupCode}
            className="mt-4 inline-flex rounded-full border border-white/10 bg-black/25 p-1.5 shadow-inner shadow-black/20 lg:hidden"
          />

          <div className="mt-5 min-w-0 space-y-4">
            {mfaCodeType === 'authenticator' ? (
              <div role="tabpanel" aria-label={t.security.authenticatorCode}>
                <GroupedOtpInput value={authenticatorCode} onChange={setAuthenticatorCode} disabled={loading} label={t.security.verificationCode} digitLabel={t.security.authenticationCodeDigit} />
              </div>
            ) : (
              <div role="tabpanel" aria-label={t.security.backupCode}>
                <label className="block text-sm text-white/70">
                  {t.security.backupCode}
                  <input autoFocus autoComplete="one-time-code" value={backupCode} placeholder={t.security.enterBackupCode} disabled={loading} onChange={(event) => setBackupCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20))} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-60" />
                </label>
              </div>
            )}

            {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
            <LoadingButton loading={loading} loadingLabel={t.security.verifyingCode} disabled={!canVerifyTwoFactor} onClick={verifyTwoFactor} className="w-full">{t.common.submit}</LoadingButton>
            <button type="button" onClick={() => { setChallengeToken(''); setMfaCodeType('authenticator'); setAuthenticatorCode(''); setBackupCode(''); setError(''); }} className="w-full rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30">{t.common.back}</button>
          </div>
        </div>
      ) : (
        <form action={submit} className="space-y-4">
          <Input name="email" label={t.common.email} autoComplete="username webauthn" />
          <Input name="password" label={t.common.password} type="password" autoComplete="current-password" />
          {passwordResetAvailable && <Link href="/forgot-password" className="-mt-2 block text-right text-sm font-semibold text-accent transition hover:text-[#74e4b1]">{t.auth.forgotPassword}</Link>}
          {message && <p className="text-sm text-accent">{message}</p>}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <LoadingButton loading={loading} loadingLabel={t.auth.loggingIn} className="w-full">{t.auth.login}</LoadingButton>
          <div className="flex items-center gap-3 py-1" aria-hidden="true">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-medium text-white/40">{t.auth.orContinueWith}</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <LoadingButton
            type="button"
            loading={passkeyLoading}
            loadingLabel={t.security.signingInWithPasskey}
            disabled={loading}
            onClick={signInWithPasskey}
            className="w-full border border-white/12 bg-white/[0.055] text-white hover:bg-white/[0.09]"
          >
            <Fingerprint size={17} aria-hidden="true" />
            {t.security.signInWithPasskey}
          </LoadingButton>
          <GhostLink className="block text-center" href="/register">{t.auth.register}</GhostLink>
        </form>
      )}
    </AuthFrame>
  );
}

function passkeyAuthenticationErrorLabel(error: unknown, cancellation: string, fallback: string) {
  return isPasskeyAuthenticationCancellation(error) ? cancellation : fallback;
}

function MfaCodeTypeSelector({ value, onChange, label, authenticatorLabel, backupLabel, className }: { value: MfaCodeType; onChange: (value: MfaCodeType) => void; label: string; authenticatorLabel: string; backupLabel: string; className: string }) {
  const options = [
    { value: 'authenticator' as const, label: authenticatorLabel, Icon: ShieldCheck },
    { value: 'backup' as const, label: backupLabel, Icon: KeyRound },
  ];

  return (
    <div role="tablist" aria-label={label} className={className}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${active ? 'bg-accent text-background shadow-sm shadow-emerald-950/20' : 'text-white/50 hover:bg-white/[0.07] hover:text-white'}`}
          >
            <option.Icon size={18} aria-hidden="true" />
            <span className="sr-only">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function GroupedOtpInput({ value, onChange, disabled, label, digitLabel }: { value: string; onChange: (value: string) => void; disabled?: boolean; label: string; digitLabel: (position: number) => string }) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  function focusSlot(index: number) {
    inputRefs.current[Math.max(0, Math.min(index, 5))]?.focus();
  }

  function setDigit(index: number, rawValue: string) {
    const digits = rawValue.replace(/\D/g, '');
    if (!digits) {
      if (value[index]) onChange(`${value.slice(0, index)}${value.slice(index + 1)}`);
      return;
    }
    if (digits.length > 1) {
      const nextValue = digits.slice(0, 6);
      onChange(nextValue);
      focusSlot(Math.min(nextValue.length, 5));
      return;
    }
    if (index > value.length) {
      focusSlot(value.length);
      return;
    }
    const nextValue = value.split('');
    if (index === nextValue.length) nextValue.push(digits);
    else nextValue[index] = digits;
    onChange(nextValue.join('').slice(0, 6));
    focusSlot(Math.min(index + 1, 5));
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const removeIndex = value[index] ? index : Math.max(0, index - 1);
      onChange(`${value.slice(0, removeIndex)}${value.slice(removeIndex + 1)}`);
      focusSlot(removeIndex);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusSlot(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusSlot(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pastedCode = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedCode) return;
    event.preventDefault();
    onChange(pastedCode);
    focusSlot(Math.min(pastedCode.length, 5));
  }

  function renderSlot(index: number) {
    return (
      <input
        key={index}
        ref={(element) => { inputRefs.current[index] = element; }}
        autoFocus={index === 0}
        autoComplete={index === 0 ? 'one-time-code' : 'off'}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={1}
        value={value[index] ?? ''}
        disabled={disabled}
        aria-label={digitLabel(index + 1)}
        onChange={(event) => setDigit(index, event.target.value)}
        onKeyDown={(event) => handleKeyDown(index, event)}
        onPaste={handlePaste}
        className="h-10 w-7 rounded-lg border border-white/10 bg-black/25 text-center text-lg font-semibold tabular-nums text-white outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 min-[360px]:w-8 min-[380px]:h-11 min-[380px]:w-9 sm:h-12 sm:w-11"
      />
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm text-white/70">{label}</legend>
      <div className="flex items-center justify-center gap-1.5 sm:gap-2">
        <div className="flex gap-1.5">{[0, 1, 2].map(renderSlot)}</div>
        <span aria-hidden="true" className="px-0.5 text-base font-semibold text-white/28">—</span>
        <div className="flex gap-1.5">{[3, 4, 5].map(renderSlot)}</div>
      </div>
    </fieldset>
  );
}

function AuthFrame({ title, children, compact = false, sideControl }: { title: string; children: React.ReactNode; compact?: boolean; sideControl?: React.ReactNode }) {
  if (compact) {
    return (
      <AuthBackground>
        <div className="relative w-full max-w-[560px]">
          <Card className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
              <AuthHeaderControls />
            </div>
            <div className="mt-6">{children}</div>
          </Card>
          {sideControl && <div className="absolute left-full top-1/2 ml-3 hidden -translate-y-1/2 lg:block">{sideControl}</div>}
        </div>
      </AuthBackground>
    );
  }

  return <AuthBackground><Card className="w-full max-w-md"><div className="mb-8 flex items-start justify-between gap-4"><h1 className="text-2xl font-black">{title}</h1><AuthHeaderControls /></div>{children}</Card></AuthBackground>;
}
function Input(props: { label: string; name: string; type?: string; defaultValue?: string; autoComplete?: string }) {
  return <label className="block text-sm text-white/70">{props.label}<input required name={props.name} type={props.type ?? 'text'} defaultValue={props.defaultValue} autoComplete={props.autoComplete} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-accent" /></label>;
}
