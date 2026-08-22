'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Card, LoadingButton } from '../../components/ui';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { apiUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (loading || !email.trim()) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/auth/forgot-password'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error('failed');
      setDone(true);
    } catch {
      setError(t.auth.passwordResetRequestFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackground>
      <Card className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between"><h1 className="text-2xl font-black">{t.auth.forgotPassword}</h1><AuthHeaderControls /></div>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-white/60">{t.auth.passwordResetEmailSent}</p>
            <Link href="/login" className="block rounded-full border border-white/10 px-4 py-2 text-center text-sm font-semibold text-white/70 transition hover:bg-white/10">{t.auth.login}</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-white/55">{t.auth.forgotPasswordDescription}</p>
            <label className="block text-sm text-white/70">{t.common.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-accent" /></label>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <LoadingButton loading={loading} loadingLabel={t.auth.sendingResetEmail} onClick={submit} className="w-full">{t.auth.sendResetEmail}</LoadingButton>
            <Link href="/login" className="block text-center text-sm font-semibold text-white/55 transition hover:text-accent">{t.common.back}</Link>
          </div>
        )}
      </Card>
    </AuthBackground>
  );
}
