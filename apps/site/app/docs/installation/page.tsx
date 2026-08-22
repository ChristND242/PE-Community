import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('installation');

export default function InstallationPage() {
  return <DocsPage pageKey="installation" />;
}
