import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('messageTemplates');

export default function MessageTemplatesDocsPage() {
  return <DocsPage pageKey="messageTemplates" />;
}
