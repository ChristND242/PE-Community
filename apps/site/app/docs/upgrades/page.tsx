import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('upgrades');

export default function UpgradesPage() {
  return <DocsPage pageKey="upgrades" />;
}
