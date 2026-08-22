'use client';

import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthBackground } from '../../components/auth-background';
import { AuthHeaderControls } from '../../components/auth-header-controls';
import { Card } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import {
  emailVerificationAttempts,
  getEmailVerificationPageState,
  shouldConsumeEmailVerificationToken,
  type EmailVerificationPageState,
} from '../../lib/email-verification-attempt';
import { useI18n } from '../../lib/i18n';

export default function VerifyEmailPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={<VerificationCard state="verifying" profileHref="/dashboard/profile?tab=email" t={t} />}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const status = searchParams.get('status');
  const destination = searchParams.get('destination');
  const [state, setState] = useState<EmailVerificationPageState>(() => getEmailVerificationPageState(status, token));
  const [profileHref, setProfileHref] = useState(
    destination === 'admin' ? '/admin/settings/profile?tab=email' : '/dashboard/profile?tab=email',
  );

  useEffect(() => {
    const initialState = getEmailVerificationPageState(status, token);
    setState(initialState);
    if (destination === 'admin') setProfileHref('/admin/settings/profile?tab=email');
    if (!shouldConsumeEmailVerificationToken(status, token) || !token) {
      return;
    }

    let cancelled = false;
    void emailVerificationAttempts.run(token, () => apiFetch<{ role: string }>('/auth/email-verification/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })).then((result) => {
      if (cancelled) return;
      void apiFetch<{ role: string; emailVerified: boolean }>('/auth/me').catch(() => null);
      const isAdmin = result.role === 'owner' || result.role === 'admin';
      if (isAdmin) setProfileHref('/admin/settings/profile?tab=email');
      setState('success');
      router.replace(`/verify-email?status=success${isAdmin ? '&destination=admin' : ''}`, { scroll: false });
      emailVerificationAttempts.release(token);
    }).catch(() => {
      if (cancelled) return;
      setState('error');
      router.replace('/verify-email?status=error', { scroll: false });
      emailVerificationAttempts.release(token);
    });
    return () => {
      cancelled = true;
    };
  }, [destination, router, status, token]);

  return <VerificationCard state={state} profileHref={profileHref} t={t} />;
}

function VerificationCard({ state, profileHref, t }: { state: EmailVerificationPageState; profileHref: string; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <AuthBackground>
      <div className="flex w-full items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md rounded-2xl border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
          <div className="flex justify-end"><AuthHeaderControls /></div>
          <div className="mt-6 text-center">
            {state === 'verifying' && <LoaderCircle className="mx-auto size-10 animate-spin text-emerald-300" aria-hidden="true" />}
            {state === 'success' && <CheckCircle2 className="mx-auto size-10 text-emerald-300" aria-hidden="true" />}
            {state === 'error' && <XCircle className="mx-auto size-10 text-rose-300" aria-hidden="true" />}
            <h1 className="mt-5 text-2xl font-semibold text-white">
              {state === 'verifying' ? t.security.verifyingEmailAddress : state === 'success' ? t.security.primaryEmailVerified : t.security.emailAddressVerificationFailed}
            </h1>
            {state === 'success' && <p className="mt-3 text-sm leading-6 text-white/55">{t.security.primaryEmailVerifiedDescription}</p>}
            {state !== 'verifying' && (
              <Link href={state === 'success' ? profileHref : '/login'} className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-emerald-300 px-5 text-sm font-semibold text-black transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-200/40">
                {state === 'success' ? t.security.returnToProfile : t.auth.login}
              </Link>
            )}
          </div>
        </Card>
      </div>
    </AuthBackground>
  );
}
