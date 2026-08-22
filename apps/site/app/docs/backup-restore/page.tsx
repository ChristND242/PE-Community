import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('backupRestore');

export default function BackupRestorePage() {
  return <DocsPage pageKey="backupRestore" />;
}
