import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono, Outfit } from 'next/font/google';

import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
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
