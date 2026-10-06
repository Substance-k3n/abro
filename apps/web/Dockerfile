# Production image for apps/web (docs/DECISIONS.md ADR-011).
# Build context: the repo root (pnpm workspace -- apps/web needs
# packages/types and packages/ui).
#
# NEXT_PUBLIC_API_URL is inlined into the client bundle at build time,
# so the image is built for one API origin (e.g. https://api.<domain>).

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @abro/web... --filter .
COPY packages packages
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
# turbo builds @abro/types (tsc -> dist) before the Next build.
RUN pnpm turbo run build --filter=@abro/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Standalone output keeps the monorepo layout: server.js lives under
# apps/web, static assets and public/ (app icons) must sit beside it.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
