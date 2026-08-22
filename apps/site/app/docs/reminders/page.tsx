import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('reminders');

export default function RemindersDocsPage() {
  return <DocsPage pageKey="reminders" />;
}
