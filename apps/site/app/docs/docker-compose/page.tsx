import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('dockerCompose');

export default function DockerComposePage() {
  return <DocsPage pageKey="dockerCompose" />;
}
