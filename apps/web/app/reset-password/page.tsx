'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Card, LoadingButton } from '../../components/ui';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { apiUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

export default function ResetPasswordPage() {
  return <Suspense fallback={null}><ResetPasswordForm /></Suspense>;
}

function ResetPasswordForm() {
  const { t } = useI18n();
  const token = useSearchParams().get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (loading) return;
    if (!token || newPassword.length < 8 || newPassword !== confirmPassword) {
      setError(t.auth.passwordResetValidation);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/auth/reset-password'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword }) });
      if (!response.ok) throw new Error('failed');
      setDone(true);
    } catch {
      setError(t.auth.invalidOrExpiredResetLink);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackground>
      <Card className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between"><h1 className="text-2xl font-black">{t.auth.resetPassword}</h1><AuthHeaderControls /></div>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-white/60">{t.auth.passwordResetComplete}</p>
            <Link href="/login" className="block rounded-full bg-accent px-4 py-2 text-center text-sm font-bold text-background transition hover:bg-[#74e4b1]">{t.auth.login}</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm text-white/70">{t.security.newPassword}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-accent" /></label>
            <label className="block text-sm text-white/70">{t.security.confirmNewPassword}<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-accent" /></label>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <LoadingButton loading={loading} loadingLabel={t.auth.resettingPassword} onClick={submit} className="w-full">{t.auth.resetPassword}</LoadingButton>
          </div>
        )}
      </Card>
    </AuthBackground>
  );
}
