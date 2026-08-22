import { DocsPage } from '../../../components/docs/docs-page';
import { createDocsMetadata } from '../../../lib/docs/metadata';

export const metadata = createDocsMetadata('rolesPermissions');

export default function RolesAndPermissionsDocsPage() {
  return <DocsPage pageKey="rolesPermissions" />;
}
