'use client';

import { ThemeProvider } from 'next-themes';
import { ReactNode } from 'react';
import { useEffect } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const dir = localStorage.getItem('dc_dir');
    if (dir === 'rtl') document.documentElement.dir = 'rtl';
    if (dir === 'ltr') document.documentElement.dir = 'ltr';
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={true} disableTransitionOnChange={true}>
      {children}
    </ThemeProvider>
  );
}
