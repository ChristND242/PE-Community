import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteAppearanceProvider } from '../components/appearance-provider';
import { SiteSkipLink } from '../components/site-skip-link';
import { LanguageProvider } from '../lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'PE Community Management',
  description: 'Member-first community operations for small and medium communities.',
  icons: {
    icon: '/pona-ekolo.svg',
    shortcut: '/pona-ekolo.svg',
    apple: '/pona-ekolo.svg',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f7f4' },
    { media: '(prefers-color-scheme: dark)', color: '#070b0a' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <SiteAppearanceProvider>
          <LanguageProvider>
            <SiteSkipLink />
            {children}
          </LanguageProvider>
        </SiteAppearanceProvider>
      </body>
    </html>
  );
}
