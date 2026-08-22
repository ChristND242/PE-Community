export type ApplicationSetupState = 'required' | 'complete' | 'error';

export type ApplicationEntrySession = {
  id: string;
  communityId: string;
  role: string;
  forcePasswordChange?: boolean;
};

export type ApplicationEntryDestination = '/setup' | '/login' | '/change-password' | '/admin' | '/dashboard';

export function destinationForApplicationEntry(
  setupState: ApplicationSetupState,
  session: ApplicationEntrySession | null,
): ApplicationEntryDestination {
  if (setupState === 'required') return '/setup';
  if (setupState === 'error' || !validSession(session)) return '/login';
  if (session.forcePasswordChange) return '/change-password';
  if (session.role === 'owner' || session.role === 'admin') return '/admin';
  if (session.role === 'member') return '/dashboard';
  return '/login';
}

function validSession(session: ApplicationEntrySession | null): session is ApplicationEntrySession {
  return Boolean(session?.id && session.communityId && session.role);
}
