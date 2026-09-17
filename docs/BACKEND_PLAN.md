# Backend Plan

The ordered backlog for `apps/api`, from here to the point every PRD
domain module exists and the production-quality gaps are closed. Each
step is its own branch off `dev`, merged via PR when its acceptance line
is met. Update the status marks (`todo` / `in progress` / `done`) as we
go — this file is the map, not a one-time plan. Mirrors how
`docs/WIRING_PLAN.md` tracks the frontend phases (see the bottom of this
file for where backend and frontend work meet).

## Done so far (context, not part of this backlog)

Auth (DB-backed sessions, Email OTP, Google OAuth), `users`, `friends`,
`groups`, `expenses`, `balances`, `settlements`, and debt simplification
(PRD §18) are implemented, tested (85 tests: 44 unit in `packages/types`,
41 integration in `apps/api`), and passing CI — see PR #2
(`feature/friends-groups-expenses` → `dev`) for the full history. This
plan starts from there.

## 1. Auth/users tests `[done]`

`auth`/`users` are the only implemented modules with zero automated
tests — everything since (friends onward) established the pattern of
pure-logic unit tests in `packages/types` + real-Postgres integration
tests per service in `apps/api/src/modules/*/*.service.spec.ts`. Close
that gap before adding more untested surface area on top.

- [x] Unit tests for anything pure-logic in `auth`/`users` (token hashing,
      OTP code generation determinism/entropy, session TTL math) —
      `crypto.util.spec.ts`, plus `google-oauth.service.spec.ts` for the
      pure `isConfigured`/`buildAuthUrl` parts.
- [x] Integration tests for `AuthService`: OTP request/verify/lockout/
      cooldown, Google sign-in linking-by-email (including the
      case-normalization fix from PR #2), session issuance/guard/
      revocation.
- [x] Integration tests for `UsersService`: profile update (get is a thin
      `toAuthProfile` pass-through in the controller, nothing to unit
      test independently).
- [x] `GoogleOAuthService.exchangeCode` calls out to Google's real API —
      design decision made: `AuthService`'s integration tests substitute
      a hand-written `FakeGoogleOAuthService` subclass overriding
      `exchangeCode()` with a canned profile (no HTTP-mocking library,
      no real network call). `exchangeCode`'s actual HTTP logic itself
      stays untested — no fetch-mocking seam exists in this repo yet;
      flagged as a known gap, not silently skipped.

**Acceptance:** `pnpm --filter @abro/api test` covers `auth`/`users` at
the same level of rigor as every other module; CI green.

## 2. Analytics `[done]`

PRD §26. Monthly/yearly spending insights: total expenses, amount paid,
personal share, amount owed, amount received, settlements, category
breakdown (monthly); yearly total, monthly trend, category distribution,
group spending, personal contribution (yearly). Pure read-side
aggregation over `Expense`/`ExpenseParticipant` — no dependency on
notifications or recurring, and doesn't require touching any existing
module. Lowest-risk pick, hence first.

- [x] Defined the exact response shapes per PRD's definitions (Total
      Spending / Your Contribution / Your Share / Net Position kept
      consistent with `BalancesService`'s existing `netBalance` formula)
      — see `apps/api/src/modules/analytics/README.md` for every field's
      definition, including the two Assumptions made where the PRD
      doesn't pin the shape down exactly (overall scope spans all of a
      user's groups, not one at a time; settlements excluded from
      general spending totals and reported separately).
- [x] `AnalyticsService` + `GET /analytics/monthly?year=&month=`,
      `GET /analytics/yearly?year=`.
- [x] Integration tests against real Postgres for both queries (11 new
      tests): contribution/share/net-position/owed math, month/year
      boundary exclusion, category breakdown, settlement separation,
      double-counting guard (payer who's also a participant), yearly
      monthly-trend/group-spending/personal-contribution aggregation,
      zero-activity groups omitted. No pure-logic extraction needed —
      the aggregation is Prisma queries, not standalone math.

**Acceptance:** matches PRD §26's field list exactly; tested; CI green.

## 3. Notifications `[done]`

PRD §34. In-app only for MVP (web push/email/Telegram are later).
Different in kind from the modules built so far: its event list (expense
added/edited/deleted, settlement, group invitation, group membership
changes, recurring expense, debt simplification changes) means this
isn't just a new module — it requires going back and adding
notification-emission calls into the **already-built** `groups` and
`expenses`/`settlements` services (not `friends` — see below).

- [x] `NotificationsService` (`notify`/`notifyMany`/`list`/`markRead`/
      `markAllRead`) + `GET /notifications`, `PATCH /notifications/:id/read`,
      `PATCH /notifications/read-all`.
- [x] Retrofit: `ExpensesService.create/update/softDelete`,
      `SettlementsService.create`, `GroupsService.create/addMember/
acceptInvite/removeMember/updateMemberRole/update` all emit now —
      full event-to-trigger mapping documented in
      `apps/api/src/modules/notifications/README.md`.
      `RECURRING_EXPENSE` is defined in the shared `NotificationType` union
      but not emitted yet — deferred to item 4, whose module doesn't exist.
      `FriendsService` is untouched: the PRD's 8-item list has no
      friend-request entry.
- [x] Integration tests: 90/90 passing, including dedicated
      "notifications (ABRO_PRD.md §34)" blocks per retrofit target
      verifying the right recipients get notified and the actor doesn't.

**Acceptance:** every PRD §34 event actually produces a notification in
practice (verified by test, not just by reading the code); CI green.

## 4. Recurring expenses `[done]`

PRD §35. Template (amount/split/participants shape) + frequency + next
execution + enabled; each generated occurrence becomes an independent
`Expense` row (immutable history — a later template edit must never
retroactively change past occurrences). Sequenced after notifications so
"recurring expense generated" can emit its event immediately instead of
leaving a TODO.

- [x] `RecurringService`: `create`/`listMine`/`setEnabled`/`generateDue`.
      The template is a real `Expense` created via
      `ExpensesService.create` (reused, not duplicated — split
      computation, friend/group authorization, currency resolution all
      come from there). `RecurringExpense` wraps its id with
      frequency/nextRunAt/enabled. `POST /recurring`, `GET /recurring`,
      `PATCH /recurring/:id/enabled`, `POST /recurring/generate-due`.
- [x] Trigger mechanism decided and documented: `docs/DECISIONS.md`
      ADR-005 — a plain `SessionGuard`-protected endpoint
      (`POST /recurring/generate-due`) for MVP, not an automatic
      scheduler (none exists in this repo yet); flagged as a known
      over-broad-access gap to close once a real trigger/service-role
      concept exists.
- [x] Integration tests (7 new): template creation computes `nextRunAt`
      correctly, visibility for participants, `setEnabled` authorization
      (payer/group-admin only), generation produces an independent
      `Expense` and advances `nextRunAt` by one period, disabled/
      not-yet-due templates don't generate, a post-generation template
      edit never touches the already-generated row's amount, and
      generation emits `RECURRING_EXPENSE` notifications to participants
      except the payer.

Two documented Assumptions (in `apps/api/src/modules/recurring/README.md`):
generation always reproduces the template's exact amounts (not its
original split weights, which aren't retained once resolved), and each
`generateDue()` call catches up at most one missed occurrence per
template, not the full backlog.

**Acceptance:** generation is deterministic and tested; trigger mechanism
decision documented in `docs/DECISIONS.md` if it has infra consequences;
CI green.

## 5. Backend hardening pass `[done]`

The known-limitations list PR #2 shipped with, closed out in one
dedicated pass once all domain modules exist, matching PRD §76's
Production Quality Gate rather than being picked at ad hoc:

- [x] Idempotency keys on financial-record-creating POSTs (expenses,
      settlements). New `IdempotencyKey` model + `IdempotencyService`
      (`apps/api/src/common/idempotency/`), reserve-then-fill: a row is
      created (response still `null`) _before_ the guarded operation
      runs, so a genuinely concurrent duplicate request fails fast on
      the `[userId, key, endpoint]` unique constraint instead of racing
      to run it twice; on failure the reservation is deleted so a
      legitimate retry isn't permanently blocked; on success the row is
      filled with the exact JSON-plain wire shape (BigInt -> string) a
      replay should return. Wired into `POST /expenses` and
      `POST /settlements` via an optional `Idempotency-Key` header — no
      key means unguarded, same as before. 6 new integration tests.
- [x] Nested `Profile` objects in all responses now go through
      `toAuthProfile` consistently — added `toAuthExpense`/`toAuthGroup`/
      `toAuthExpenseNote` mappers (`apps/api/src/common/mappers/`) for
      the spots that weren't already covered (`friends`/`auth`/`users`
      controllers already did this), wired into the expenses, groups,
      and settlements controllers.
- [x] Fixed the pre-existing duplicate-import lint warning in
      `expenses.service.ts` (merged the two `@abro/types` imports).
- [x] Fixed `groups.create`'s friend-check loop doing redundant queries
      on duplicate `memberIds` — deduped once via `Set` and reused for
      both the friend-check loop and member creation (a duplicate
      `memberId` would previously also have hit `GroupMember`'s
      `[groupId, userId]` unique constraint on create, a real latent bug
      beyond just redundant queries).
- [x] Set the OAuth state cookie's `secure` flag based on `NODE_ENV` in
      `AuthController.googleStart` (the session cookie already had this;
      the OAuth state cookie didn't).

**Acceptance:** PRD §76's checklist (TypeScript/Lint/Unit/Integration/
Build all PASS) is genuinely clean, no asterisks. 103/103 tests passing,
`tsc --noEmit` clean on both packages, `oxlint` 0 errors (9 warnings, all
pre-existing classes — intentional sequential `await`-in-loop and one
`no-extend-native`/`no-unused-vars` pair predating this pass), `nest
build` succeeds.

## Where backend meets frontend

Frontend work is tracked separately in `docs/WIRING_PLAN.md` (currently
only on `dev`/`feature/auth-screens`/`main`, not this branch — check
those if it's not present here). Phase 2 (auth screens) is code-complete
but mock-data only and never verified in a browser; Phases 3–8
(Dashboard → Expenses → Groups → Settlement → Profile/Settings →
Real-API-wiring) haven't started. The backend items above (1–5) are
sequenced first because Phases 3–6 each need their corresponding backend
module to already exist and be stable to wire against — but this isn't a
hard gate: Phase 2 (auth) could start any time in parallel, since its
backend dependency (`auth`/`users`) is already built, just not yet
tested (item 1 above).
