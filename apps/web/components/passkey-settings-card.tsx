'use client';

import {
  browserSupportsWebAuthn,
  startRegistration,
  WebAuthnError,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { KeyRound, Pencil, Plus, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Button, Card, LoadingButton, Spinner } from './ui';
import { isStepUpCancellation, useStepUpAuthentication } from './step-up-authentication-dialog';

type PasskeyCredential = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
};

type RegistrationOptionsResponse = {
  attemptId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
};

export function PasskeySettingsCard() {
  const { t, lang } = useI18n();
  const stepUp = useStepUpAuthentication();
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<'add' | 'rename' | 'remove' | ''>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadPasskeys() {
    setPasskeys(await apiFetch<PasskeyCredential[]>('/auth/passkeys'));
  }

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    void loadPasskeys()
      .catch(() => toast.error(t.security.passkeysLoadFailed))
      .finally(() => setLoading(false));
  }, [t.security.passkeysLoadFailed]);

  async function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !supported) return;
    setBusy('add');
    try {
      const registration = await stepUp.run(() => apiFetch<RegistrationOptionsResponse>('/auth/passkeys/registration/options', {
        method: 'POST',
      }));
      const response = await startRegistration({ optionsJSON: registration.options });
      await apiFetch('/auth/passkeys/registration/verify', {
        method: 'POST',
        body: JSON.stringify({ attemptId: registration.attemptId, response, name: newName }),
      });
      await loadPasskeys();
      setNewName('');
      setAddOpen(false);
      toast.success(t.security.passkeyAdded);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(passkeyErrorLabel(error, t.security.passkeySetupCancelled, t.security.passkeyAddFailed));
    } finally {
      setBusy('');
    }
  }

  async function renamePasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renamingId || busy) return;
    setBusy('rename');
    try {
      const updated = await apiFetch<PasskeyCredential>(`/auth/passkeys/${renamingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: renameValue }),
      });
      setPasskeys((current) => current.map((passkey) => passkey.id === updated.id ? updated : passkey));
      setRenamingId(null);
      setRenameValue('');
      toast.success(t.security.passkeyRenamed);
    } catch {
      toast.error(t.security.passkeyRenameFailed);
    } finally {
      setBusy('');
    }
  }

  async function removePasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!removingId || busy) return;
    setBusy('remove');
    try {
      await stepUp.run(() => apiFetch(`/auth/passkeys/${removingId}`, {
        method: 'DELETE',
      }));
      setPasskeys((current) => current.filter((passkey) => passkey.id !== removingId));
      setRemovingId(null);
      toast.success(t.security.passkeyRemoved);
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.security.passkeyRemoveFailed);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
    <Card className="min-w-0 overflow-hidden rounded-[1.35rem] border-white/[0.08] bg-white/[0.035] p-0 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-5 sm:flex-row sm:items-start sm:justify-between md:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <KeyRound size={18} className="text-accent" aria-hidden="true" />
            <h2 className="text-base font-semibold text-white md:text-lg">{t.security.passkeys}</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/48">{t.security.passkeysDescription}</p>
        </div>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={supported !== true || Boolean(busy)}
          className="shrink-0 gap-2"
        >
          <Plus size={16} aria-hidden="true" />
          {t.security.addPasskey}
        </Button>
      </div>

      <div className="p-5 md:p-6">
        {supported === false && (
          <p className="mb-4 rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm text-white/58">
            {t.security.passkeysUnsupported}
          </p>
        )}

        {addOpen && (
          <form onSubmit={addPasskey} className="mb-5 grid gap-4 rounded-lg border border-accent/20 bg-accent/[0.045] p-4">
            <label className="block min-w-0">
              <span className="text-sm font-medium text-white/72">{t.security.passkeyName}</span>
              <input value={newName} maxLength={80} onChange={(event) => setNewName(event.target.value)} placeholder={t.security.passkeyNamePlaceholder} className="mt-2 h-11 w-full rounded-lg border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none focus:border-accent/55 focus:ring-2 focus:ring-accent/10" />
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button type="button" onClick={() => { setAddOpen(false); setNewName(''); }} disabled={busy === 'add'} className="gap-2 bg-white/[0.07] text-white hover:bg-white/[0.11]">
                <X size={15} aria-hidden="true" /> {t.common.cancel}
              </Button>
              <LoadingButton type="submit" loading={busy === 'add'} loadingLabel={t.security.addingPasskey} disabled={Boolean(busy)}>{t.security.continuePasskeySetup}</LoadingButton>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex min-h-28 items-center justify-center text-white/45"><Spinner /></div>
        ) : passkeys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.12] px-5 py-8 text-center">
            <p className="text-sm font-semibold text-white">{t.security.noPasskeys}</p>
            <p className="mt-2 text-sm text-white/45">{t.security.noPasskeysDescription}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.08] bg-black/[0.12]">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="p-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{passkey.name}</p>
                    <p className="mt-1 text-xs leading-5 text-white/42">
                      {t.security.passkeyAddedOn(formatDate(passkey.createdAt, lang))} · {passkey.lastUsedAt ? t.security.passkeyLastUsed(formatDate(passkey.lastUsedAt, lang)) : t.security.passkeyNeverUsed}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-white/52">{deviceTypeLabel(passkey.deviceType, t.security.singleDevicePasskey, t.security.syncedPasskey)}</span>
                      {passkey.backedUp && <span className="rounded-full border border-accent/15 bg-accent/[0.08] px-2 py-1 text-[11px] text-accent/80">{t.security.backedUpPasskey}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => { setRenamingId(passkey.id); setRenameValue(passkey.name); setRemovingId(null); }} className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] text-white/55 transition hover:bg-white/[0.06] hover:text-white" aria-label={t.security.renamePasskey}><Pencil size={15} /></button>
                    <button type="button" onClick={() => { setRemovingId(passkey.id); setRenamingId(null); }} className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] text-white/55 transition hover:border-rose-300/20 hover:bg-rose-300/[0.06] hover:text-rose-200" aria-label={t.security.removePasskey}><Trash2 size={15} /></button>
                  </div>
                </div>

                {renamingId === passkey.id && (
                  <form onSubmit={renamePasskey} className="mt-4 flex flex-col gap-2 border-t border-white/[0.06] pt-4 sm:flex-row">
                    <input autoFocus required maxLength={80} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none focus:border-accent/55" />
                    <Button type="button" onClick={() => setRenamingId(null)} disabled={busy === 'rename'} className="bg-white/[0.07] text-white hover:bg-white/[0.11]">{t.common.cancel}</Button>
                    <LoadingButton type="submit" loading={busy === 'rename'} loadingLabel={t.common.save} disabled={!renameValue.trim() || Boolean(busy)}>{t.common.save}</LoadingButton>
                  </form>
                )}

                {removingId === passkey.id && (
                  <form onSubmit={removePasskey} className="mt-4 border-t border-white/[0.06] pt-4">
                    <p className="text-sm font-semibold text-white">{t.security.removePasskeyConfirmTitle}</p>
                    <p className="mt-1 text-sm leading-6 text-white/48">{passkeys.length === 1 ? t.security.removeLastPasskeyWarning : t.security.removePasskeyDescription}</p>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <Button type="button" onClick={() => setRemovingId(null)} disabled={busy === 'remove'} className="bg-white/[0.07] text-white hover:bg-white/[0.11]">{t.common.cancel}</Button>
                      <LoadingButton type="submit" loading={busy === 'remove'} loadingLabel={t.security.removingPasskey} disabled={Boolean(busy)} className="bg-rose-200 text-rose-950 hover:bg-rose-100">{t.security.removePasskey}</LoadingButton>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
    {stepUp.dialog}
    </>
  );
}

function passkeyErrorLabel(error: unknown, cancellation: string, fallback: string) {
  if (error instanceof WebAuthnError && error.code === 'ERROR_CEREMONY_ABORTED') return cancellation;
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) return cancellation;
  return fallback;
}

function formatDate(value: string, lang: 'en' | 'fr') {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function deviceTypeLabel(value: string, singleDevice: string, synced: string) {
  return value === 'multiDevice' ? synced : singleDevice;
}
