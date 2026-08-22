import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('architecture');

export default function ArchitecturePage() {
  return <DocsPage pageKey="architecture" />;
}
