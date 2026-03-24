import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Providers } from './providers';
import { ServiceWorkerRegister } from './sw-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevCollab Hub',
  description: 'Engineering operations, done together.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
