import { DocsPage } from '../../components/docs/docs-page';
import { createDocsMetadata } from '../../lib/docs/metadata';

export const metadata = createDocsMetadata('overview');

export default function DocsHomePage() {
  return <DocsPage pageKey="overview" />;
}
