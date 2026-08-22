import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('streaksEngagement');

export default function StreaksAndEngagementDocsPage() {
  return <DocsPage pageKey="streaksEngagement" />;
}
