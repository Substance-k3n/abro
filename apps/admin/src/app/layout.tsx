import type { Metadata } from 'next';
import localFont from 'next/font/local';

import './globals.css';

// The PWA's self-hosted fonts (OFL, licences beside the files), so the
// portal reads as ABRO without a build-time fetch from Google.
const outfit = localFont({
  src: './fonts/outfit-latin-variable.woff2',
  weight: '300 800',
  variable: '--ff-display',
  display: 'swap',
});
const dmSans = localFont({
  src: './fonts/dm-sans-latin-variable.woff2',
  weight: '300 600',
  variable: '--ff-body',
  display: 'swap',
});
const mono = localFont({
  src: './fonts/jetbrains-mono-latin-variable.woff2',
  weight: '400 600',
  variable: '--ff-mono',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'monospace'],
});

export const metadata: Metadata = {
  title: { default: 'ABRO Admin', template: '%s · ABRO Admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
