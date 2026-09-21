# Architecture Decision Log

Short-form ADRs. Newest first. Each entry says what changed and why —
not a full essay, just enough for the next person (or session) to
understand why the repo looks the way it does instead of following
`ABRO_PRD.md` literally.

---

## ADR-007: Backend rewrite — Go, superseding ADR-002

**Status:** Accepted

**Context:** ADR-002 chose NestJS specifically so `apps/web` and
`apps/api` could share `packages/types` (`Money`/`SplitType`/Zod
schemas) verbatim, on the reasoning that one language across the stack
is faster for a small team and keeps client/server math from silently
drifting apart. That NestJS backend was fully built and tested (backend
plan items 1-6: auth, users, friends, groups, expenses, balances,
settlements, debt simplification, analytics, notifications, recurring
expenses, MinIO receipts — 100+ tests, CI green, merged to `dev`).

**Decision:** Rewrite the backend from scratch in Go
(`apps/api`, replacing the NestJS implementation), explicitly requested
by the user. Stack: `chi` router, `pgx/v5` + `sqlc` for typed Postgres
access (no ORM), `golang-migrate` for schema migrations (plain SQL,
translated from the Prisma schema), stdlib `crypto/sha256`+`crypto/rand`
for session/OTP hashing (same approach as ADR-004, just not
Prisma-mediated), `golang.org/x/oauth2` for Google OAuth,
`minio-go/v7` for receipt storage (still S3-protocol-compatible, so
ADR-006's "swap to real S3 later is a config change" still holds).
Every domain module is rebuilt in the same order the original backend
was built (`docs/BACKEND_PLAN.md`'s history), each with its own tests
run against a real Postgres/MinIO — no mocking library, matching the
convention the NestJS backend established.

**Why:** Explicit user decision, not driven by a discovered technical
problem with NestJS — the previous backend was working, tested, and
CI-green at the time of this rewrite.

**Consequence:**

- ADR-002's core rationale (one shared `packages/types` module across
  both sides) no longer holds for the backend. `packages/types` still
  exists and is still used by `apps/web` (Phase 4+ split-validation
  UI per `docs/WIRING_PLAN.md`), but the Go backend has its own
  independent port of the same money/split/debt-simplification logic
  (`apps/api/internal/money`), test-ported case-for-case from
  `packages/types/src/{money,split,debt-simplification}.test.ts` to
  keep both sides' behavior verified equivalent at rewrite time — but
  nothing mechanically keeps them in sync going forward. A future
  change to a split/rounding/debt-simplification rule must be applied
  in both places by hand, and reviewed as such.
- One simplification the rewrite gets for free: Go's `int64` covers
  ABRO's realistic minor-units range and serializes through
  `encoding/json` without precision loss, unlike JS `bigint` (not
  JSON-safe). The `common/bigint-json.ts` response-shape shim and its
  `toAuthProfile`-style mappers have no Go equivalent requirement —
  though the _wire format_ for amounts is kept as a numeric string on
  requests (`internal/money.ParseAmount`), matching what `apps/web`'s
  still-bigint-based `packages/types` will send once Phase 8 wires the
  frontend to this API, so the two sides don't need to renegotiate the
  contract later.
- The entire NestJS implementation (`apps/api`'s previous contents,
  Prisma schema, 100+ Jest tests) is removed from the working tree.
  Fully recoverable from git history — it shipped and was merged to
  `dev` before this rewrite (see the `feature/friends-groups-expenses`
  → `dev` PR) — but no longer live code.
- CI (`.github/workflows/ci.yml`) needs a Go job (build/vet/test against
  real Postgres/MinIO services) replacing the Node/Jest one for `apps/api`.
- `docs/BACKEND_PLAN.md` described the NestJS build order; a parallel
  tracking doc for the Go rewrite exists at `docs/GO_BACKEND_PLAN.md`.

---

## ADR-006: Receipt storage — MinIO (S3-compatible), upload-through-API, presigned reads

**Status:** Accepted

**Context:** `docs/ABRO_PRD.md` §36 specifies receipts (JPG/PNG/WebP,
authenticated access, expense-level authorization, private storage)
via Supabase Storage — superseded by ADR-001, which explicitly left
"the team picks explicitly, S3-compatible bucket" as an **Open** item.
Nothing in `Expense.receiptPath` (a placeholder string column) is
backed by an actual storage integration yet.

**Decision:**

- **MinIO**, self-hosted, added to `infra/docker/dev/compose.yml`
  alongside Postgres — matches ADR-001's self-hosted-first direction.
- Accessed via `@aws-sdk/client-s3` (AWS SDK v3) against MinIO's
  S3-compatible endpoint, not MinIO's own SDK — so swapping to real
  AWS S3, Cloudflare R2, Backblaze B2, etc. in production later is an
  endpoint/credentials change, not a code change.
- **Uploads go through the API**, not a client-presigned PUT straight
  to storage: `POST /expenses/:id/receipt` (multipart, `multer`
  memory storage, no disk write) validates auth + expense-edit
  authority + mimetype (JPG/PNG/WebP only, per §36) + a size cap
  before ever touching MinIO. Credentials never reach the client.
- **Reads use a short-lived presigned GET URL**
  (`GET /expenses/:id/receipt`, 5-minute expiry) instead of proxying
  bytes through the API — avoids the API becoming a bandwidth
  bottleneck for images, while still enforcing the same
  expense-visibility check as every other expense read before a URL
  is ever issued.
- One receipt per expense (matches the schema's singular
  `receiptPath`, not an array) — a new upload replaces the old object
  after the new one succeeds, so a failed upload never destroys the
  previous receipt.

**Why:** Mirrors the codebase's existing "server stays authoritative,
never trust the client" posture (same reasoning as ADR-003's
settlement-amount validation) — every access, read or write, is
re-checked against the same authorization rules `ExpensesService`
already enforces for the expense itself, not a separate parallel
permission system for files.

**Consequence:** New env vars (`S3_ENDPOINT`/`S3_REGION`/
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`RECEIPTS_BUCKET`) join
`apps/api/.env.example`. Dev requires `docker compose up -d` to also
bring up MinIO now, not just Postgres. Production still needs a real
bucket provisioned and credentials issued — same category of "code
is done, real infra isn't" gap as OTP email/Google OAuth (see ADR-004's
Consequence section).

---

## ADR-005: Recurring expense generation trigger — manual endpoint, not a scheduler

**Status:** Accepted (MVP), revisit before production

**Context:** `docs/ABRO_PRD.md` §35 says every generated occurrence
becomes an independent `Expense` row but doesn't say what causes
generation to run. `docs/BACKEND_PLAN.md` item 4 flagged this
explicitly as an infra decision, not something to pick silently. No
scheduler infra (`@nestjs/schedule`, an external cron hitting an
endpoint, a hosted scheduler like a Postgres `pg_cron` job) exists
anywhere in this repo yet.

**Decision:** `RecurringService.generateDue()` is the trigger-agnostic
core (finds every `enabled` `RecurringExpense` with `nextRunAt <= now`,
generates one `Expense` per due row, advances `nextRunAt`), exposed as
`POST /recurring/generate-due` behind the normal `SessionGuard` — same
authentication as every other route, no separate service/cron secret.
Nothing in this repo calls it automatically yet.

**Why:** Building real scheduler infra (in-process cron, a hosted
scheduler, or a authenticated-service-account pattern for an external
caller) is a deployment-target decision this project hasn't made yet
(see ADR-001's "Open" note on self-hosted vs. managed). Shipping a
manual/externally-triggerable endpoint now means the generation logic
itself is written, tested, and reusable regardless of which scheduling
answer comes later — swapping in a real trigger later means adding a
caller, not rewriting `generateDue()`.

**Consequence:** Recurring expenses do not generate on their own in
any deployed environment today — something (a person, a manual `curl`,
a script) has to call the endpoint. Any authenticated user can trigger
it, not just an admin or the affected users, which is a known
over-broad-access gap (harmless in effect, since it only ever
generates rows that are genuinely due) to close in a hardening pass
once a real trigger mechanism and, if needed, a service-role concept
exist. **Open:** pick a real scheduler once the deployment target
(ADR-001's "Open" note) is decided.

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

**Status:** Superseded by ADR-007 (backend rewritten in Go)

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
