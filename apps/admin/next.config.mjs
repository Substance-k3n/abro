// The ABRO admin portal (ADR-028): a separate site from the PWA, on its
// own Vercel project. The browser only ever calls this site's /api/*,
// which Next forwards to apps/api, so the session cookie belongs to the
// admin site alone -- signing in here doesn't sign you in to the PWA, and
// the API needs no CORS entry for it. Locally the target is the dev API.
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? 'http://localhost:3201').replace(
  /\/+$/,
  '',
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@abro/types'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Never framed (clickjacking), never indexed, never sniffed.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiProxyTarget}/:path*` }];
  },
};

export default nextConfig;
