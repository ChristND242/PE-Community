'use client';

import { browserSupportsWebAuthn, startAuthentication, WebAuthnError, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { Fingerprint, ShieldCheck, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch, isApiRequestError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Button, LoadingButton } from './ui';

type StepUpStatus = { required: boolean; expiresAt: string | null; passkeyAvailable: boolean };
type PasskeyOptions = { attemptId: string; options: PublicKeyCredentialRequestOptionsJSON };
type PendingAction = { run: () => Promise<unknown>; resolve: (value: unknown) => void; reject: (reason: unknown) => void };

class StepUpCancelledError extends Error {
  constructor() {
    super('Identity verification was cancelled.');
    this.name = 'StepUpCancelledError';
  }
}

export function isStepUpCancellation(error: unknown) {
  return error instanceof StepUpCancelledError;
}

export function useStepUpAuthentication() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'passkey' | ''>('');
  const [error, setError] = useState('');
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const pendingRef = useRef<PendingAction | null>(null);

  useEffect(() => () => pendingRef.current?.reject(new StepUpCancelledError()), []);

  async function run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (caught) {
      if (!isStepUpRequired(caught)) throw caught;
      return new Promise<T>((resolve, reject) => {
        if (pendingRef.current) {
          reject(new Error('Identity verification is already in progress.'));
          return;
        }
        pendingRef.current = {
          run: action,
          resolve: (value) => resolve(value as T),
          reject,
        };
        setPassword('');
        setError('');
        setPasskeyAvailable(false);
        setOpen(true);
        void apiFetch<StepUpStatus>('/auth/step-up/status')
          .then((status) => setPasskeyAvailable(status.passkeyAvailable && browserSupportsWebAuthn()))
          .catch(() => setPasskeyAvailable(false));
      });
    }
  }

  function cancel() {
    if (busy) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    setPassword('');
    setError('');
    pending?.reject(new StepUpCancelledError());
  }

  async function verifyPassword() {
    if (!password || busy) return;
    setBusy('password');
    setError('');
    try {
      await apiFetch('/auth/step-up/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password }),
      });
      await continuePendingAction();
    } catch (caught) {
      setError(isStepUpRequired(caught) ? t.security.stepUpExpired : t.security.stepUpFailed);
    } finally {
      setBusy('');
    }
  }

  async function verifyPasskey() {
    if (!passkeyAvailable || busy) return;
    setBusy('passkey');
    setError('');
    try {
      const authentication = await apiFetch<PasskeyOptions>('/auth/step-up/passkey/options', { method: 'POST' });
      const response = await startAuthentication({ optionsJSON: authentication.options, useBrowserAutofill: false });
      await apiFetch('/auth/step-up/passkey/verify', {
        method: 'POST',
        body: JSON.stringify({ attemptId: authentication.attemptId, response }),
      });
      await continuePendingAction();
    } catch (caught) {
      if (!isWebAuthnCancellation(caught)) setError(t.security.stepUpFailed);
    } finally {
      setBusy('');
    }
  }

  async function continuePendingAction() {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    try {
      const result = await pending.run();
      setOpen(false);
      setPassword('');
      pending.resolve(result);
    } catch (caught) {
      setOpen(false);
      pending.reject(caught);
    }
  }

  return {
    run,
    dialog: (
      <StepUpAuthenticationDialog
        open={open}
        password={password}
        busy={busy}
        error={error}
        passkeyAvailable={passkeyAvailable}
        onPasswordChange={setPassword}
        onPassword={verifyPassword}
        onPasskey={verifyPasskey}
        onCancel={cancel}
      />
    ),
  };
}

function StepUpAuthenticationDialog({
  open,
  password,
  busy,
  error,
  passkeyAvailable,
  onPasswordChange,
  onPassword,
  onPasskey,
  onCancel,
}: {
  open: boolean;
  password: string;
  busy: 'password' | 'passkey' | '';
  error: string;
  passkeyAvailable: boolean;
  onPasswordChange: (value: string) => void;
  onPassword: () => void;
  onPasskey: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onCancel();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [open, busy, onCancel]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] grid h-dvh place-items-center p-4">
      <div aria-hidden="true" onClick={onCancel} className="absolute inset-0 bg-[var(--app-overlay)]" />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="relative w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-dialog)] p-5 text-[var(--app-foreground)] shadow-2xl shadow-black/50">
        <button ref={closeRef} type="button" onClick={onCancel} disabled={Boolean(busy)} aria-label={t.common.close} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-[var(--app-muted-foreground)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-foreground)] disabled:opacity-40"><X size={17} /></button>
        <div className="pr-11">
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-300"><ShieldCheck size={19} /></div>
          <h2 id={titleId} className="text-lg font-semibold">{t.security.verifyIdentity}</h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--app-muted-foreground)]">{t.security.stepUpDescription}</p>
        </div>

        {passkeyAvailable && (
          <LoadingButton type="button" loading={busy === 'passkey'} loadingLabel={t.security.verifyingIdentity} disabled={Boolean(busy)} onClick={onPasskey} className="mt-5 w-full gap-2">
            <Fingerprint size={17} /> {t.security.continueWithPasskey}
          </LoadingButton>
        )}

        {passkeyAvailable && <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-[var(--app-border)]" /><span className="text-xs text-[var(--app-muted-foreground)]">{t.auth.orContinueWith}</span><span className="h-px flex-1 bg-[var(--app-border)]" /></div>}

        <label className={passkeyAvailable ? 'block' : 'mt-5 block'}>
          <span className="text-sm font-medium">{t.security.currentPassword}</span>
          <input autoFocus={!passkeyAvailable} type="password" autoComplete="current-password" value={password} disabled={Boolean(busy)} onChange={(event) => onPasswordChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void onPassword(); } }} className="mt-2 h-11 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm outline-none focus:border-emerald-300/50" />
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--app-border)] pt-4">
          <Button type="button" onClick={onCancel} disabled={Boolean(busy)} className="bg-[var(--app-panel-muted)] text-[var(--app-foreground)]">{t.common.cancel}</Button>
          <LoadingButton type="button" loading={busy === 'password'} loadingLabel={t.security.verifyingIdentity} disabled={!password || Boolean(busy)} onClick={onPassword}>{t.security.verify}</LoadingButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function isStepUpRequired(error: unknown) {
  return isApiRequestError(error, 403, 'STEP_UP_REQUIRED');
}

function isWebAuthnCancellation(error: unknown) {
  if (error instanceof WebAuthnError && error.code === 'ERROR_CEREMONY_ABORTED') return true;
  return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError');
}
