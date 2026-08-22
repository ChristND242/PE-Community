import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('troubleshooting');

export default function TroubleshootingPage() {
  return <DocsPage pageKey="troubleshooting" />;
}
