import { requireAuthenticatedSession } from '../../lib/server-auth';
import { SessionActivityProvider } from '../../components/auth/session-activity-provider';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAuthenticatedSession();
  return <SessionActivityProvider>{children}</SessionActivityProvider>;
}
