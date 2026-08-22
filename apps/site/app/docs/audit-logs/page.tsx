import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('auditLogs');

export default function AuditLogsDocsPage() {
  return <DocsPage pageKey="auditLogs" />;
}
