'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppSelect } from '../../components/app-select';
import { Card, LoadingButton } from '../../components/ui';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { PublicRegistrationSecurity, RegistrationCaptcha } from '../../components/registration-captcha';
import { apiUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

export default function RegisterPage() {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [security, setSecurity] = useState<PublicRegistrationSecurity | null>(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [sex, setSex] = useState<'' | 'M' | 'F'>('');
  const [note, setNote] = useState('');
  const handleCaptchaToken = useCallback((token: string) => setCaptchaToken(token), []);
  const handleCaptchaReady = useCallback((ready: boolean) => setCaptchaReady(ready), []);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite') ?? '';
    setInviteToken(token);
    if (!token) return;
    fetch(apiUrl(`/auth/invite-status?invite=${encodeURIComponent(token)}`), { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { valid: false })
      .then((data) => setInviteValid(Boolean(data.valid)))
      .catch(() => setInviteValid(false));
  }, []);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite') ?? '';
    fetch(apiUrl(`/auth/registration-security${token ? `?invite=${encodeURIComponent(token)}` : ''}`), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('registration security unavailable');
        return response.json() as Promise<PublicRegistrationSecurity>;
      })
      .then((configuration) => {
        setSecurity(configuration);
        setCaptchaReady(!configuration.captchaRequired);
      })
      .catch(() => setError(t.auth.registrationProtectionUnavailable));
  }, [t.auth.registrationProtectionUnavailable]);
  async function submit(formData: FormData) {
    if (loading) return;
    setMessage('');
    setError('');
    if (sex !== 'M' && sex !== 'F') {
      setError(t.dashboard.sexRequired);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/auth/register'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formData.get('name'), email: formData.get('email'), password: formData.get('password'), sex, note: formData.get('note'), inviteToken, communityId: security?.communityId, captchaToken }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { code?: string } | null;
        if (payload?.code === 'CAPTCHA_VERIFICATION_FAILED') setError(t.auth.captchaFailed);
        else if (payload?.code === 'REGISTRATION_RATE_LIMITED') setError(t.auth.registrationRateLimited);
        else setError(inviteToken ? t.auth.invalidInviteLink : t.auth.invalid);
        return;
      }
      setMessage(t.auth.submitted);
    } catch {
      setError(t.auth.registrationFailed);
    } finally {
      setCaptchaToken('');
      setCaptchaResetKey((value) => value + 1);
      setLoading(false);
    }
  }
  const noteMaxLength = security?.requestNoteMaxLength ?? 500;
  return <AuthBackground><Card className="w-full max-w-md"><div className="mb-8 flex items-center justify-between"><h1 className="text-2xl font-black">{t.auth.registerTitle}</h1><AuthHeaderControls /></div><form action={submit} className="space-y-4">{inviteToken && <p className={`rounded-xl border px-3 py-2 text-sm leading-6 ${inviteValid === false ? 'border-rose-300/20 bg-rose-300/10 text-rose-100' : 'border-accent/20 bg-accent/10 text-accent'}`}>{inviteValid === false ? t.auth.invalidInviteLink : `${t.auth.registrationByInvitation}. ${t.auth.invitationRegistrationHelp}`}</p>}<Input name="name" label={t.common.name} /><Input name="email" label={t.common.email} /><Input name="password" label={t.common.password} type="password" /><input type="hidden" name="sex" value={sex} /><AppSelect value={sex} label={t.dashboard.sexLabel} placeholder={t.dashboard.selectSex} options={[{ value: 'M' as const, label: t.dashboard.sexMale }, { value: 'F' as const, label: t.dashboard.sexFemale }]} onChange={setSex} dense className="w-full" /><label className="block text-sm text-white/70">{t.auth.note}<textarea name="note" required value={note} maxLength={noteMaxLength} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-28 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-accent" /><span className="mt-1 block text-right text-xs tabular-nums text-white/40" aria-label={t.auth.noteCharacterCount(note.length, noteMaxLength)}>{note.length} / {noteMaxLength}</span></label>{security?.captchaRequired && <RegistrationCaptcha security={security} resetKey={captchaResetKey} onToken={handleCaptchaToken} onReady={handleCaptchaReady} loadingLabel={t.auth.captchaLoading} errorLabel={t.auth.captchaFailed} />}{message && <p className="text-sm text-accent">{message}</p>}{error && <p className="text-sm text-rose-300">{error}</p>}<LoadingButton loading={loading} loadingLabel={t.auth.registering} disabled={!security || (security.captchaRequired && (!captchaReady || !captchaToken))} className="w-full">{t.auth.register}</LoadingButton><Link className="block rounded-full border border-white/10 px-4 py-2 text-center text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white" href="/login">{t.auth.login}</Link></form></Card></AuthBackground>;
}
function Input(props: { label: string; name: string; type?: string }) {
  return <label className="block text-sm text-white/70">{props.label}<input required name={props.name} type={props.type ?? 'text'} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-accent" /></label>;
}
