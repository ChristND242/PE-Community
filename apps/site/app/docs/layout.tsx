import type { Metadata } from 'next';
import { DocsShell } from '../../components/docs/docs-shell';

export const metadata: Metadata = {
  title: {
    default: 'Docs | PE Community Management',
    template: '%s',
  },
  description: 'Documentation for installing and operating PE Community Management.',
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
