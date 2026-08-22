import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('announcementsFeed');

export default function AnnouncementsAndFeedDocsPage() {
  return <DocsPage pageKey="announcementsFeed" />;
}
