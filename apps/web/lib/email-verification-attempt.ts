export type EmailVerificationPageState = 'verifying' | 'success' | 'error';

export function getEmailVerificationPageState(status: string | null, token: string | null): EmailVerificationPageState {
  if (status === 'success') return 'success';
  if (status === 'error' || !token) return 'error';
  return 'verifying';
}

export function shouldConsumeEmailVerificationToken(status: string | null, token: string | null) {
  return status !== 'success' && status !== 'error' && Boolean(token);
}

export function createEmailVerificationAttemptCoordinator() {
  type Attempt = {
    promise: Promise<unknown>;
    cleanupTimer?: ReturnType<typeof setTimeout>;
  };
  const attempts = new Map<string, Attempt>();

  return {
    run<Result>(token: string, verify: () => Promise<Result>): Promise<Result> {
      const existing = attempts.get(token);
      if (existing) return existing.promise as Promise<Result>;

      const promise = verify();
      const attempt: Attempt = { promise };
      attempts.set(token, attempt);
      const scheduleCleanup = () => {
        attempt.cleanupTimer = setTimeout(() => {
          if (attempts.get(token) === attempt) attempts.delete(token);
        }, 30_000);
      };
      void promise.then(scheduleCleanup, scheduleCleanup);
      return promise;
    },
    release(token: string) {
      const attempt = attempts.get(token);
      if (!attempt) return;
      if (attempt.cleanupTimer) clearTimeout(attempt.cleanupTimer);
      attempts.delete(token);
    },
  };
}

export const emailVerificationAttempts = createEmailVerificationAttemptCoordinator();
