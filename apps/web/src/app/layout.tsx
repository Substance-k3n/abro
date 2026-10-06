import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import { PwaSetup } from '~/components/PwaSetup';
import { ThemeSync } from '~/components/ThemeSync';
import { THEME_SCRIPT } from '~/lib/theme';

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
  // Absolute base for link-preview images (e.g. /guide shared in
  // Telegram). Vercel sets VERCEL_PROJECT_PRODUCTION_URL at build time.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3200',
  ),
  title: 'ABRO',
  description: 'Remember every expense. Forget the confusion.',
  // Home-screen name on iOS; the icon itself comes from app/apple-icon.png.
  // statusBarStyle 'default': the iPhone status bar takes the page colour
  // (theme-color, kept in step with Light/Dark by lib/theme.ts).
  appleWebApp: { title: 'ABRO', statusBarStyle: 'default' },
};

// Tints the mobile browser bar in the accent color, matching the
// manifest's theme_color (app/manifest.ts).
// No `themeColor` here on purpose: Next emits that tag more than once and
// React re-adds its own copy when it hydrates <head>, so a dark theme
// couldn't reliably recolour it. THEME_SCRIPT creates the one tag itself,
// outside React, and lib/theme.ts keeps it in step.
export const viewport: Viewport = {
  // Edge to edge on notched phones; globals.css adds the safe-area insets.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: THEME_SCRIPT stamps data-theme on <html>
    // before React hydrates, so the server's markup never has it.
    <html
      lang="en"
      className={`${outfit.variable} ${dmSans.variable} ${jetBrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <PwaSetup />
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
