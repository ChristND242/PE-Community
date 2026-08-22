import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('security');

export default function SecurityPage() {
  return <DocsPage pageKey="security" />;
}
