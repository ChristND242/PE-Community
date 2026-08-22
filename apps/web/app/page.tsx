import { redirect } from 'next/navigation';
import { resolveApplicationEntryDestination } from '../lib/server-auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  redirect(await resolveApplicationEntryDestination());
}
