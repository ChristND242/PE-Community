'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, LoadingButton } from '../../components/ui';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { apiFetch } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { isStepUpCancellation, useStepUpAuthentication } from '../../components/step-up-authentication-dialog';

export default function ChangePasswordPage() {
  const { t } = useI18n();
  const router = useRouter();
  const stepUp = useStepUpAuthentication();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    if (newPassword.length < 8 || newPassword !== confirmPassword) {
      toast.error(t.security.passwordChangeValidation);
      return;
    }
    setLoading(true);
    try {
      await stepUp.run(() => apiFetch('/auth/change-required-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }));
      toast.success(t.security.passwordChanged);
      router.push('/dashboard');
    } catch (error) {
      if (isStepUpCancellation(error)) return;
      toast.error(t.security.passwordChangeFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackground>
      <Card className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black">{t.security.changePassword}</h1>
            <p className="mt-2 text-sm leading-6 text-white/55">{t.security.forcePasswordChangeDescription}</p>
          </div>
          <AuthHeaderControls />
        </div>
        <div className="space-y-4">
          <PasswordField label={t.security.temporaryPassword} value={currentPassword} onChange={setCurrentPassword} />
          <PasswordField label={t.security.newPassword} value={newPassword} onChange={setNewPassword} />
          <PasswordField label={t.security.confirmNewPassword} value={confirmPassword} onChange={setConfirmPassword} />
          <LoadingButton loading={loading} loadingLabel={t.security.changingPassword} onClick={submit} className="w-full">{t.security.changePassword}</LoadingButton>
        </div>
      </Card>
      {stepUp.dialog}
    </AuthBackground>
  );
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-white/70">
      {label}
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-white outline-none focus:border-accent" />
    </label>
  );
}
