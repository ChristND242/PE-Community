import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('encryptedChat');

export default function EncryptedChatDocsPage() {
  return <DocsPage pageKey="encryptedChat" />;
}
