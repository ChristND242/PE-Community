import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('notifications');

export default function NotificationsDocsPage() {
  return <DocsPage pageKey="notifications" />;
}
