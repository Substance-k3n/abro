---
name: abro-workflow
description: How ABRO is built — the full-stack monorepo layout (Go API in apps/api, Next.js PWA in apps/web, shared packages), which layer owns what, the context → plan → small PRs → verify → deploy loop, money rules, docs to keep current, and the checks to run. Load before any ABRO feature, roadmap phase, bug fix, tester feedback, migration, or deploy task — not just when the user says "workflow" or "continue". Pair with abro-git-workflow for anything that commits, pushes, or opens a PR.
---

# ABRO — how we build it

ABRO is a Splitwise-style shared-expense app (friends, groups, IOUs,
settlements), ETB-first, live at **abro-pi.vercel.app** and being trialled with
friends and family. This skill is the project-specific layer on top of the
user-level `ship-with-care` skill: follow both; where they differ, this one wins
for ABRO.

The aim is not just working code. Every change should be understood, planned,
small, verified for real, documented, and actually deployed.

---

## 1. The repo at a glance

```
abro/                          pnpm workspace + Turborepo (pnpm-workspace.yaml, turbo.json)
├── apps/
│   ├── api/                   Go 1.23 API (chi router, pgx, sqlc, golang-migrate)
│   │   ├── cmd/api/main.go    wiring: services, handlers, routes, /health
│   │   ├── internal/<module>/ one package per domain: router.go (HTTP), service.go
│   │   │                      (rules), mapper.go, *_integration_test.go
│   │   │                      modules: auth users friends groups expenses balances
│   │   │                      settlements analytics notifications recurring photos
│   │   ├── internal/apitypes/ request validation + response shapes (wire format)
│   │   ├── internal/db/       sqlc-GENERATED code — never edit by hand
│   │   ├── internal/money/    minor units, splitting, debt simplification, Format
│   │   ├── internal/httpx/    error envelope, JSON helpers, CORS, recoverer
│   │   ├── queries/*.sql      sqlc queries (one file per module)
│   │   ├── migrations/        NNNN_name.up.sql / .down.sql (golang-migrate)
│   │   ├── Dockerfile, start.sh   start.sh runs migrations when RUN_MIGRATIONS=true
│   │   └── sqlc.yaml
│   └── web/                   Next.js App Router PWA (Tailwind v4)
│       └── src/
│           ├── app/           routes; app/(dashboard)/ = signed-in screens with the
│           │                  bottom bar/sidebar (AppShell); app/settle, app/expenses/new
│           │                  = multi-step flows with their own layouts
│           ├── components/    app-level components (AppShell, PaymentRow, PullToRefresh…)
│           ├── lib/           <module>-api.ts typed API calls (one per API module),
│           │                  api-client.ts (fetch + 30s read cache), drafts, helpers
│           └── app/globals.css design tokens, neo-* classes, themes
├── packages/
│   ├── types/                 shared TS: money (minor units), split, debt simplification,
│   │                          notification types, zod schemas (with unit tests)
│   ├── ui/                    shared React components (Avatar, BalanceCard, PersonRow…)
│   └── config/                shared tsconfig
├── infra/docker/{dev,prod}/   local Postgres compose; prod VPS compose + Caddy (ADR-011)
├── docs/                      PRD, FRONTEND_SPEC, DECISIONS (ADRs), DEPLOY, plans, DEVLOG
├── render.yaml                Render Blueprint for the API (free plan)
├── .github/workflows/         ci.yml (web, api, images jobs), keep-awake.yml
├── .husky/ + commitlint + lint-staged   commit hooks (see abro-git-workflow)
└── .claude/skills/            this skill + abro-git-workflow
```

**Hosting (ADR-012):** web on **Vercel** (auto from `dev`), API on **Render**
free (Docker, from `dev` — check it really auto-deploys), Postgres on **Neon**,
receipts/photos in a private **Backblaze B2** bucket. The web proxies `/api/*` to
the API so the session cookie is first-party.

## 2. Which layer owns what

| Concern                                | Owner               | Where                                                         |
| -------------------------------------- | ------------------- | ------------------------------------------------------------- |
| Auth, sessions, permissions            | API                 | `internal/auth`, `require…` helpers in each service           |
| Business rules, validation, money math | API (authoritative) | `internal/<module>/service.go`, `internal/money`              |
| Wire shapes                            | API                 | `internal/apitypes` ↔ mirrored in `apps/web/src/lib/*-api.ts` |
| Persistence                            | Postgres            | `migrations/` + `queries/` (sqlc)                             |
| Shared pure logic & types              | packages            | `packages/types`                                              |
| Presentation, client checks for UX     | web                 | `apps/web/src`                                                |

The web may pre-check for a nicer UX (e.g. "that's more than they owe"), but the
API always re-checks. Never put a rule only in the frontend.

## 3. How a full-stack feature flows through the folders

1. **Migration** `apps/api/migrations/00NN_name.{up,down}.sql` — explain _why_
   in a comment at the top. Round-trip it: `migrate up`, `down 1`, `up`.
2. **Queries** in `apps/api/queries/<module>.sql`, then `sqlc generate`.
3. **Service** method in `internal/<module>/service.go` (rules, notifications).
4. **Types** in `internal/apitypes` (input `Validate()`, response struct).
5. **Route** in `internal/<module>/router.go` (+ wiring in `cmd/api/main.go`).
6. **Integration tests** `internal/<module>/*_integration_test.go` against the
   local Postgres, with hand-checked numbers.
7. **Web API module** `apps/web/src/lib/<module>-api.ts` (strings → `bigint`).
8. **Screen/components** under `apps/web/src/app/...` and `components/`.
9. **Shared types** in `packages/types` if both sides need them (e.g. a new
   notification type goes in `notificationTypes` + settings labels + icons).
10. **Docs**: ADR for real decisions; PR description for the rest.

API-only and UI-only changes can be separate PRs. If an API change would make
the live UI wrong (e.g. "Settled!" for something now pending), ship both in one PR.

## 4. The loop (summary — details in ship-with-care)

1. **Context**: `git status`, branch, open PRs, project memory, plan docs, and
   the code itself (it's the source of truth over docs and specs).
2. **Plan reply** (keep it short): Current understanding → What we need to
   verify / decide → Architecture impact (which folders) → Proposed PRs in order →
   Docs to update.
3. **Decisions** go to the user with `AskUserQuestion`, recommended option first —
   especially money, permissions and privacy rules. Don't ask about conventions.
4. **Implement** in the order of §3, checking each step.
5. **Verify** (§7), **PR** (abro-git-workflow), **merge on his say-so**, **confirm
   it's live**, update memory.
6. **Report**: what's done (PR #s), what was verified and how, what wasn't, what
   he needs to do or decide.

If the user says "continue" and a roadmap or plan doc names the next item, do it
without re-asking.

## 5. Money rules (non-negotiable)

- **Expenses are facts; balances are derived.** Never store or increment a
  balance. Every figure is computed from expenses + participants.
- Amounts are integer **minor units**; strings on the wire; `bigint` in the web.
  Shares must sum to the expense amount (server-checked). Remainders distribute
  deterministically (100/3 → 33/33/34).
- **Settlements are expenses** with `split_type = SETTLEMENT` (ADR-003) — the
  only thing that moves a debt. Only `internal/settlements` writes them.
- **A payment the payer records is a claim** in `settlement_requests`, not a
  fact, until the person paid confirms it (ADR-019). Confirm = atomic claim
  (`UPDATE … WHERE status='PENDING'`), re-check the live debt, then write the
  SETTLEMENT expense. The receiver can record "they paid me" directly.
- **Disputes flag a share, never change it** (ADR-020); only the payer/admin
  edits.
- Sign conventions: friend balance positive = "I owe them"; group net positive =
  "the group owes me". Convert through the existing helpers
  (`friendOweSplit`, balance-breakdown), not ad hoc.
- Group rules (ADR-009/010): settled-only leave/remove/delete, locked currency
  once it has expenses, group settlements checked against group nets.
- Show money with `formatMoney` (web) / `money.Format` (API, also for
  notification text): `1,234.50 ETB`. Never print raw minor units.
- For any money feature, write the data flow in the plan (fact → shares → ledger
  effect → net balance → simplification → settlement → history) and include
  equal/unequal/remainder/partial/settled/deleted cases in tests.

## 6. Conventions worth knowing

- API errors: `httpx.Conflict/Forbidden/NotFound/BadRequest/TooManyRequests`
  with a SCREAMING_SNAKE code and a plain-English message the UI can show as-is.
  Rate limits return 429 with `details.nextAllowedAt`.
- Notifications: `notifications.Notify` / `NotifyLink` (with an in-app link like
  `/expenses/<id>`); every type is opt-out-able in settings; don't reveal a
  recipient's opt-outs to the sender.
- `/health` must never touch the database (keeps Neon asleep when idle).
- Web screens: shared max width + `md:mx-auto`, grid lists on desktop, check
  phone width and both themes. Keep the soft **neumorphic** style (`neo-*`
  classes), light theme default with a faint purple tint.
- `.neo-*` component classes live in `@layer components` so Tailwind utilities
  on an element win (an unlayered class once hid search text under the icon).
- Comments explain _why_ and link ADRs/roadmap items; match the file's density.

## 7. Verification — commands and checks

Go (needs the local DB: Docker `abro-db` on :5460; if it's down ask the user to
run `! sudo docker start abro-db`):

```
export PATH="$HOME/.local/go/bin:$HOME/go/bin:$PATH"
go -C apps/api vet ./...  &&  (cd apps/api && sqlc diff)
go -C apps/api test -count=1 ./...
migrate -database "postgres://abro:password@localhost:5460/abro_go?sslmode=disable" -path apps/api/migrations up
```

Web / packages:

```
pnpm typecheck && pnpm lint && pnpm exec prettier --check <changed files>
pnpm --filter @abro/types test      # when packages/types changed
pnpm --filter web build             # for big UI changes
```

Browser (for anything user-facing): run the API binary from the scratchpad
against the `abro_acceptance` DB (test users alice/bob/carol/dave@abro.test; OTP
codes appear in the API log), `pnpm dev` in apps/web, then walk the flow as each
user involved. See ship-with-care's `references/verification.md` for workarounds
when browser automation is flaky.

After merge: confirm the API really deployed (`curl …/api/health` → 200; routes
behind auth answer 401 whether or not they exist, so they prove nothing).

## 8. Documentation that must follow the code

| Doc                                             | Update when                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/DECISIONS.md`                             | a real decision (new table/approach, business rule, hosting) — newest ADR first: Context / Decision / Alternatives / Consequences / Status |
| `docs/DEPLOY.md`, `render.yaml`                 | env vars, hosting, deploy steps change                                                                                                     |
| plan docs (`WIRING_PLAN.md`, `BACKEND_PLAN.md`) | scope or order changes                                                                                                                     |
| code comments at the top of a screen/module     | its behaviour or deviations from the spec change                                                                                           |
| project memory                                  | anything merged/open/next, and gotchas                                                                                                     |

Never let a doc describe something that no longer exists. If a PR description
turns out wrong, edit it with a visible "Correction:".

## 9. Label uncertainty, and when to stop

Say Confirmed / Inferred / Assumption / Unknown rather than turning a guess into
a fact. Stop and ask when specs conflict, a money or permission rule is unclear,
a migration could damage existing data, or a decision has long-term
consequences.

## 10. Done means

- [ ] Plan agreed; decisions made by the user where needed
- [ ] Code in the right layers (§2), following §3's order
- [ ] Tests for rules and money math, with hand-checked numbers
- [ ] vet / test / sqlc diff / typecheck / lint / format pass; migrations round-trip
- [ ] Checked in a browser as each user involved; desktop + phone; light + dark
- [ ] ADR/docs updated; PR written per abro-git-workflow
- [ ] All CI checks green; merged only when the user said so
- [ ] Confirmed live (web on Vercel, API `/health` on Render)
- [ ] Memory updated; known limitations reported
