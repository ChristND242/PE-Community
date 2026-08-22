import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('configuration');

export default function ConfigurationPage() {
  return <DocsPage pageKey="configuration" />;
}
