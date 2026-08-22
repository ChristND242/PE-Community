import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('automation');

export default function AutomationDocsPage() {
  return <DocsPage pageKey="automation" />;
}
