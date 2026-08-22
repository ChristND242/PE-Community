import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('administration');

export default function AdministrationDocsPage() {
  return <DocsPage pageKey="administration" />;
}
