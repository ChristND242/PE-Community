import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('registrations');

export default function RegistrationsDocsPage() {
  return <DocsPage pageKey="registrations" />;
}
