import { requireAuthenticatedSession } from '../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ChangePasswordLayout({ children }: { children: React.ReactNode }) {
  await requireAuthenticatedSession({ allowPasswordChange: true });
  return children;
}
