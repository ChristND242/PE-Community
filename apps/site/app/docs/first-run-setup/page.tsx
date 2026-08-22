import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('firstRunSetup');

export default function FirstRunSetupPage() {
  return <DocsPage pageKey="firstRunSetup" />;
}
