import type { Metadata, Viewport } from 'next';
import './globals.css';
import { LanguageProvider } from '../lib/i18n';
import { NotificationToastReplayProvider } from '../components/notification-toast-replay-provider';
import { Toaster } from '../components/ui/sonner';
import { AppearanceProvider } from '../components/appearance-provider';

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
    { media: '(prefers-color-scheme: light)', color: '#edf2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#070b0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <AppearanceProvider>
          <LanguageProvider>
            <NotificationToastReplayProvider>{children}</NotificationToastReplayProvider>
            <Toaster />
          </LanguageProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
