# ABRO

> Remember every expense. Forget the confusion.

A social financial ledger for shared expenses, personal IOUs, group
debts, and settlements. ETB-first, internationally-ready. Independently
implemented — SplitPro and similar tools were studied for architecture
only, nothing is forked. See [`docs/ABRO_PRD.md`](docs/ABRO_PRD.md) for
the full product spec and [`docs/DECISIONS.md`](docs/DECISIONS.md) for
where this repo deviates from it.

## Structure

```text
abro/
├── apps/
│   ├── web/          Next.js (App Router) — the ABRO frontend, PWA
│   └── api/           Go — auth, financial engine, REST API
├── packages/
│   ├── types/         Shared types: Money (integer minor units), split types, DTOs
│   ├── config/        Shared tsconfig base
│   └── ui/             Reserved: design system ported from the Figma Make prototype
├── infra/
│   └── docker/dev/     Local Postgres + RustFS (S3) for development
└── docs/
    ├── ABRO_PRD.md              Product requirements (source of truth for scope)
    ├── ABRO_FRONTEND_SPEC.md    42-screen frontend inventory & phased plan
    └── DECISIONS.md             Architecture decisions, incl. ADR-007 (Go rewrite)
```

`apps/api`'s original TypeScript/NestJS/Prisma implementation (the
first full backend build, merged to `dev`) was rewritten in Go per
`docs/DECISIONS.md` ADR-007 — recoverable from git history if ever
needed, just no longer the live implementation.

## Stack

| Layer       | Choice                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| Frontend    | Next.js, TypeScript, Tailwind CSS, PWA                                 |
| Backend     | Go, `chi`, `pgx`/`sqlc`, `golang-migrate`                              |
| Database    | PostgreSQL                                                             |
| Storage     | RustFS in dev (S3-compatible, ADR-008), `minio-go` client              |
| Monorepo    | pnpm workspaces + Turborepo (JS side); `apps/api` is a plain Go module |
| Lint/format | oxlint + Prettier (JS); `gofmt`/`go vet` (Go)                          |
| Git hooks   | Husky + lint-staged + commitlint                                       |

Money is always an integer in the smallest currency unit (e.g. santim
for ETB) — never a float — end to end, per `docs/ABRO_PRD.md` §28.

## Getting started

```bash
pnpm install

# start local Postgres + RustFS (S3-compatible receipt storage)
docker compose -f infra/docker/dev/compose.yml up -d

# apply Go backend migrations (golang-migrate; install once with
# `go install -tags postgres github.com/golang-migrate/migrate/v4/cmd/migrate@latest`)
migrate -database "$DATABASE_URL" -path apps/api/migrations up

# run the frontend
pnpm dev
# web  → http://localhost:3200

# run the backend, separately -- it's a plain Go module, not a pnpm workspace member
cd apps/api && go run ./cmd/api
# api  → http://localhost:3201
```

Copy `apps/web/.env.example` to `apps/web/.env` and
`apps/api/.env.example` to `apps/api/.env` first — the Go binary loads
`apps/api/.env` automatically in dev (see `internal/config`).

## Where the design comes from

The UI prototype (`~/Downloads/Design Ultra Modern UI (1)`) is a
single-file Figma Make export covering most of the 42 screens in
`docs/ABRO_FRONTEND_SPEC.md`. It's a reference to port screen-by-screen
into `apps/web`, not something to import wholesale — `packages/ui` is
reserved for the design system that comes out of that porting work.

## Conventions

- Conventional commits, enforced by commitlint (`feat(api): ...`,
  `fix(web): ...` — scopes: `web`, `api`, `types`, `ui`, `config`,
  `infra`, `docs`, `repo`).
- Husky runs lint-staged (oxlint + Prettier) on every commit.
- Every package under `apps/api/internal` maps to a PRD feature area
  (`docs/ABRO_PRD.md` §32): auth, users, friends, groups, expenses,
  balances, settlements, analytics, notifications, recurring.
