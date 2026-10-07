import type { MetadataRoute } from 'next';

// Web app manifest, served at /manifest.webmanifest, so ABRO can be
// installed to a phone's home screen or as a desktop app. The icons in
// public/icons are the "AB" mark from the splash screen (app/page.tsx);
// the maskable one is full-bleed with the letters inside the safe zone,
// so Android can crop it to any shape. app/icon.png and app/apple-icon.png
// are the same mark, picked up by Next as the favicon and iOS icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ABRO',
    short_name: 'ABRO',
    description: 'Remember every expense. Forget the confusion.',
    // The installed app opens on Home, not the marketing splash at "/":
    // signed-out users are sent on to /auth/signin by the API client.
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f0eff9',
    theme_color: '#6366f1',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Long-press the app icon (Android) for a direct "Add expense".
    shortcuts: [
      {
        name: 'Add expense',
        short_name: 'Add',
        url: '/expenses/new',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
