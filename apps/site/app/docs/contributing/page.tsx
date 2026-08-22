import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('contributing');

export default function ContributingPage() {
  return <DocsPage pageKey="contributing" />;
}
