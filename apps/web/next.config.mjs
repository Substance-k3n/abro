import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@abro/types', '@abro/ui'],
  // Production image (apps/web/Dockerfile, ADR-011): a self-contained
  // server.js with only the node_modules it needs. Tracing starts at the
  // monorepo root so the workspace packages are included.
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
