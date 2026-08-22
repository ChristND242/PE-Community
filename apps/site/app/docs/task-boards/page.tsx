import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('taskBoards');

export default function TaskBoardsDocsPage() {
  return <DocsPage pageKey="taskBoards" />;
}
