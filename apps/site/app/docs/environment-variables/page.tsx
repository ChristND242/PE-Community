import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('environmentVariables');

export default function EnvironmentVariablesPage() {
  return <DocsPage pageKey="environmentVariables" />;
}
