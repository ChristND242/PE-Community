'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { useEffect } from 'react';

function AppearanceThemeColor() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!resolvedTheme) return;

    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      document.head.append(themeColor);
    }

    themeColor.content = resolvedTheme === 'dark' ? '#070b0a' : '#edf2ee';
  }, [resolvedTheme]);

  return null;
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="pe-appearance">
      <AppearanceThemeColor />
      {children}
    </ThemeProvider>
  );
}
