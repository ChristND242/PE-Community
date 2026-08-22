'use client';

import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { Card } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

type VerificationState = 'verifying' | 'success' | 'error';

export default function VerifyEmailChangePage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<VerificationCard state="verifying" profileHref="/dashboard/profile" t={t} />}>
      <VerifyEmailChangeContent />
    </Suspense>
  );
}

function VerifyEmailChangeContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<VerificationState>('verifying');
  const [profileHref, setProfileHref] = useState('/dashboard/profile');

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    let cancelled = false;
    void apiFetch<{ role: string }>('/auth/email-change/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }).then((result) => {
      if (cancelled) return;
      if (result.role === 'owner' || result.role === 'admin') setProfileHref('/admin/settings/profile');
      setState('success');
    }).catch(() => {
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return <VerificationCard state={state} profileHref={profileHref} t={t} />;
}

function VerificationCard({
  state,
  profileHref,
  t,
}: {
  state: VerificationState;
  profileHref: string;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <AuthBackground>
      <div className="flex w-full items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md rounded-2xl border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
          <div className="flex justify-end">
            <AuthHeaderControls />
          </div>
          <div className="mt-6 text-center">
            {state === 'verifying' && <LoaderCircle className="mx-auto size-10 animate-spin text-emerald-300" aria-hidden="true" />}
            {state === 'success' && <CheckCircle2 className="mx-auto size-10 text-emerald-300" aria-hidden="true" />}
            {state === 'error' && <XCircle className="mx-auto size-10 text-rose-300" aria-hidden="true" />}
            <h1 className="mt-5 text-2xl font-semibold text-white">
              {state === 'verifying'
                ? t.security.verifyingEmailAddress
                : state === 'success'
                  ? t.security.emailAddressVerified
                  : t.security.emailAddressVerificationFailed}
            </h1>
            {state === 'success' && (
              <p className="mt-3 text-sm leading-6 text-white/55">{t.security.emailAddressVerifiedDescription}</p>
            )}
            {state !== 'verifying' && (
              <Link
                href={state === 'success' ? profileHref : '/login'}
                className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-emerald-300 px-5 text-sm font-semibold text-black transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-200/40"
              >
                {state === 'success' ? t.security.returnToProfile : t.auth.login}
              </Link>
            )}
          </div>
        </Card>
      </div>
    </AuthBackground>
  );
}
