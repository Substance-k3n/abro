<<<<<<< HEAD
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
│   └── api/           NestJS — auth, financial engine, REST API
├── packages/
│   ├── types/         Shared types: Money (integer minor units), split types, DTOs
│   ├── config/        Shared tsconfig base
│   └── ui/             Reserved: design system ported from the Figma Make prototype
├── infra/
│   └── docker/dev/     Local Postgres for development
└── docs/
    ├── ABRO_PRD.md              Product requirements (source of truth for scope)
    ├── ABRO_FRONTEND_SPEC.md    42-screen frontend inventory & phased plan
    └── DECISIONS.md             Architecture decisions, incl. why NestJS not Go/Supabase
```

## Stack

| Layer       | Choice                                 |
| ----------- | -------------------------------------- |
| Frontend    | Next.js, TypeScript, Tailwind CSS, PWA |
| Backend     | NestJS, TypeScript                     |
| Database    | PostgreSQL + Prisma                    |
| Validation  | Zod (shared between web and api)       |
| Monorepo    | pnpm workspaces + Turborepo            |
| Lint/format | oxlint + Prettier                      |
| Git hooks   | Husky + lint-staged + commitlint       |

Money is always an integer in the smallest currency unit (e.g. santim
for ETB) — never a float — end to end, per `docs/ABRO_PRD.md` §28.

## Getting started

```bash
pnpm install

# start local Postgres
docker compose -f infra/docker/dev/compose.yml up -d

# generate the Prisma client + run migrations
pnpm db:generate
pnpm db:migrate

# run both apps
pnpm dev
# web  → http://localhost:3200
# api  → http://localhost:3201
```

Copy each app's `.env.example` to `.env` first (`apps/web/.env.example`,
`apps/api/.env.example`).

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
- Every module under `apps/api/src/modules` maps to a PRD feature area
  (`docs/ABRO_PRD.md` §32): auth, users, friends, groups, expenses,
  balances, settlements, analytics, notifications, recurring.
=======
# FriendLedger
A shared expense ledger for friend groups in Ethiopia — who paid, who owes whom, and how much everyone has actually spent together, month after month. Built as our own product, studying SplitPro, Spliit and similar tools as architectural reference — not forked from any of them.
>>>>>>> e4cd6d1 (Initial commit)
