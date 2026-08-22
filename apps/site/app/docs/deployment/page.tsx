import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('deployment');

export default function DeploymentPage() {
  return <DocsPage pageKey="deployment" />;
}
