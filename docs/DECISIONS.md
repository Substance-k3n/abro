# Architecture Decision Log

Short-form ADRs. Newest first. Each entry says what changed and why —
not a full essay, just enough for the next person (or session) to
understand why the repo looks the way it does instead of following
`ABRO_PRD.md` literally.

---

## ADR-004: Auth mechanism — DB-backed sessions, Email OTP + Google OAuth

**Status:** Accepted

**Context:** ADR-001 deferred this explicitly ("still to be decided —
email OTP vs. Google OAuth vs. both"). `ABRO_PRD.md` §30/§39 requires
both Email OTP and Google Sign-In at MVP, originally via Supabase
Auth; ADR-001/002 already ruled out Supabase, so both flows need a
from-scratch implementation inside `apps/api`.

**Decision:**

- **Session strategy:** DB-backed sessions, not JWT. A `Session` row
  (`apps/api/prisma/schema/auth.prisma`) stores only a SHA-256 hash of
  the session token; the raw token lives in an httpOnly cookie. A
  NestJS guard hashes the incoming cookie and looks up the row on each
  request.
- **Email OTP:** `OtpCode` table, one row per send, `codeHash` only
  (never the plaintext code), `attempts` counter for rate limiting,
  `expiresAt`/`consumedAt` for one-time use.
- **Google OAuth:** `OAuthAccount` table linking a `provider` +
  `providerAccountId` to a `Profile`. Scaffolded now against
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` env vars — real values are
  a manual step (Google Cloud Console project) outside this repo.
- **Account linking:** both methods resolve to the same `Profile` by
  matching `email` — a user who first signs in via OTP and later via
  Google (same email) lands on one account, not two.

**Why:** DB-backed sessions were chosen over stateless JWT because
revocation (logout-everywhere, banning a device) needs a server-side
record either way once you take it seriously — a JWT-plus-denylist
ends up with the same DB dependency but two token formats to reason
about instead of one. A hybrid JWT-access/refresh-token design was
considered (better fit for a future mobile client) but rejected for
now as unnecessary complexity while only a web client exists; revisit
if/when a mobile client is actually planned.

**Consequence:** `apps/api/.env.example` needs
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL` and an
OTP-email-sending config (provider undecided — dev stub logs the code
instead of sending it; picking a real provider, e.g. Resend/SES, is a
separate follow-up before this can go to production). Every
authenticated route depends on the session guard reading this table —
until the `auth` module ships, no other module's endpoints can be
wired to real authorization.

---

## ADR-003: Settlements are Expense rows with `splitType: SETTLEMENT`

**Status:** Accepted

**Context:** `ABRO_PRD.md` §29 explicitly leaves this open: "Settlements
should be represented as a specialized financial ledger event, with the
implementation chosen during architecture design."

**Decision:** No separate `Settlement` table. A settlement is an
`Expense` row with `splitType: SETTLEMENT`, `paidBy` = who paid, and
two `ExpenseParticipant` rows (the payer's share and the payee's,
summing to zero net effect on the payer). See `@abro/types`'s
`SplitType.SETTLEMENT`.

**Why:** The balance engine (§16) already has to sum every Expense +
ExpenseParticipant pair for two users. Giving settlements their own
table means the balance query unions two tables and keeps their
semantics in sync by hand. Reusing the same rows means one query, one
set of indexes, one place the "never a stored balance" rule
(§8.2/§45) has to hold.

**Consequence:** Application code must never let a client set
`splitType: SETTLEMENT` through the general "create expense" path —
settlements get their own service/endpoint that enforces §19's rule
(`settlement amount <= outstanding debt`) before writing the row.

**Implementation (added 2026-09-17, `SettlementsService`):** this ADR was
written before the balance engine existed, and "two `ExpenseParticipant`
rows... summing to zero net effect on the payer" was ambiguous between a
signed-amounts scheme and a non-negative one. Resolved in favor of
non-negative: `{ paidById: settler, amount: settlementAmount }` with
participants `[{settler, 0}, {recipient, settlementAmount}]`. This keeps
every `ExpenseParticipant.amount` non-negative system-wide (matching every
other split type), so `assertSharesMatchTotal` (`sum = total`) applies
unchanged with no settlement-specific exception, and `BalancesService`
needs exactly one netting rule — "a non-payer participant's amount is owed
to the payer" — for every split type including `SETTLEMENT`, with zero
`splitType` branches in the read path.

---

## ADR-002: NestJS over Go for the backend

**Status:** Accepted

**Context:** `ABRO_PRD.md` §33 recommends Supabase (Auth + Storage +
Edge Functions) with no separate backend service. We're deviating
from that: ABRO may ship as its own product _and_ get embedded as a
feature inside another wallet project later, which argues for a
standalone API service with a clean boundary, rather than logic
scattered across Next.js server actions and Supabase Edge Functions.
That raised the real question: Go or NestJS for that service?

**Decision:** NestJS (`apps/api`), with Prisma + a self-hosted
PostgreSQL — not Supabase-managed Postgres, not Go.

**Why:**

- Every reference artifact (SplitPro, the Figma Make prototype, the
  ABRO PRD/spec itself) is TypeScript. A NestJS backend lets
  `apps/web` and `apps/api` share `packages/types` directly — the same
  `Money`/`SplitType` definitions and Zod schemas on both sides, which
  matters for a PRD whose top rule is "never trust client-calculated
  balances."
- Financial correctness (integer minor units, deterministic splits) is
  a discipline, not a language feature — SplitPro already proves
  TypeScript handles it fine in production. Go's type system doesn't
  meaningfully raise the bar here.
- "Embeddable in another wallet project" doesn't specifically favor
  Go: a NestJS service is exposed over HTTP/gRPC exactly like a Go
  binary would be, composable regardless of the host project's
  language — unless that project is itself Go, which isn't confirmed.
- One language across the stack is faster for a small team to build
  and test 40+ screens plus a financial engine against.

**Consequence:** `docs/ABRO_PRD.md` §30 ("Supabase Architecture") is
superseded for auth/storage/scheduling — see ADR-001. Read the PRD for
product scope and financial rules, not for infra specifics.

---

## ADR-001: Self-hosted Postgres + Prisma over Supabase

**Status:** Accepted

**Context:** The PRD assumes Supabase end-to-end: Supabase Auth,
Supabase Storage, RLS as the authorization layer, Edge Functions for
business logic. Once ADR-002 puts a NestJS API in front of the
database, Supabase's client-side RLS model stops being the primary
gatekeeper — NestJS guards and services are.

**Decision:** Plain PostgreSQL (`infra/docker/dev/compose.yml` locally,
any managed Postgres in production) + Prisma in `apps/api`, following
the same pattern the team already knows from the SplitPro reference
(migrations, generated client, `db:migrate`/`db:generate` scripts).

**Why:**

- Avoids paying for two authorization layers (RLS _and_ NestJS guards)
  that have to be kept in sync; NestJS becomes the single source of
  truth for who can touch what.
- Keeps ABRO deployable anywhere Postgres runs — relevant if it's
  later vendored into another project's infra rather than run
  standalone.
- Matches tooling the team has already exercised first-hand on
  SplitPro this week (Prisma migrate, docker compose dev stack).

**Consequence:** Auth is a custom implementation inside `apps/api`, not
Supabase Auth — mechanism decided in ADR-004 (DB-backed sessions,
Email OTP + Google OAuth). Receipts need object storage the team picks
explicitly (S3-compatible bucket, not "Supabase Storage" by default).
Row-level security can still be added later in Postgres as defense in
depth; it just isn't the primary boundary.

**Open:** Revisit if the team decides ABRO should run more like a
managed product than a self-hosted/embeddable service — Supabase gets
attractive again once that's the actual deployment target.
