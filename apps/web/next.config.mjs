import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Free-tier deploy (docs/DECISIONS.md ADR-012): web on Vercel, API on
// Render. Those are different sites, so the API's SameSite=Lax session
// cookie wouldn't be sent cross-site. Instead the browser calls this app's
// own `/api/*` (NEXT_PUBLIC_API_URL=/api) and Next forwards it to the API,
// so every request, cookie and redirect stays on one origin. Unset (dev,
// VPS compose), the web app calls the API's origin directly as before.
const apiProxyTarget = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@abro/types', '@abro/ui'],
  // Production image (apps/web/Dockerfile, ADR-011): a self-contained
  // server.js with only the node_modules it needs. Tracing starts at the
  // monorepo root so the workspace packages are included.
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  // The service worker (public/sw.js, ADR-015) must never be cached by
  // the browser or a CDN, or a fixed worker could take days to reach
  // installed apps.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [{ source: '/api/:path*', destination: `${apiProxyTarget}/:path*` }];
  },
};

export default nextConfig;
