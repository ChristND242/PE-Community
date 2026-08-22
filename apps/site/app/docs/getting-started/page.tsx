import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('gettingStarted');

export default function GettingStartedPage() {
  return <DocsPage pageKey="gettingStarted" />;
}
