import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import './globals.css';

// Self-hosted (OFL, licences beside the files in ./fonts) instead of
// next/font/google: the Google loader fetched these at build time, and a
// bad response from Google failed CI, image and Vercel builds. Each file
// is the variable-weight latin subset, so one file covers every weight.
const outfit = localFont({
  src: './fonts/outfit-latin-variable.woff2',
  weight: '300 800',
  variable: '--font-display',
  display: 'swap',
});

const dmSans = localFont({
  src: './fonts/dm-sans-latin-variable.woff2',
  weight: '300 600',
  variable: '--font-body',
  display: 'swap',
});

const jetBrainsMono = localFont({
  src: './fonts/jetbrains-mono-latin-variable.woff2',
  weight: '400 600',
  variable: '--font-mono',
  display: 'swap',
  // Arial-based fallback metrics would be wrong for a monospace face.
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'monospace'],
});

export const metadata: Metadata = {
  title: 'ABRO',
  description: 'Remember every expense. Forget the confusion.',
  // Home-screen name on iOS; the icon itself comes from app/apple-icon.png.
  appleWebApp: { title: 'ABRO' },
};

// Tints the mobile browser bar in the accent color, matching the
// manifest's theme_color (app/manifest.ts).
export const viewport: Viewport = {
  themeColor: '#6366f1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable} ${jetBrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
