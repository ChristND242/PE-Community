import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('calendarEvents');

export default function CalendarAndEventsDocsPage() {
  return <DocsPage pageKey="calendarEvents" />;
}
