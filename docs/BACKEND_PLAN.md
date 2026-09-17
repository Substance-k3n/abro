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

## 4. Recurring expenses `[todo]`

PRD §35. Template (amount/split/participants shape) + frequency + next
execution + enabled; each generated occurrence becomes an independent
`Expense` row (immutable history — a later template edit must never
retroactively change past occurrences). Sequenced after notifications so
"recurring expense generated" can emit its event immediately instead of
leaving a TODO.

- [ ] `RecurringService`: CRUD on templates, generation logic (calls
      `ExpensesService.create` under the hood — reuse, don't duplicate
      split computation).
- [ ] Decide and document the trigger mechanism (cron job / scheduled
      task runner / manual "generate due" endpoint for MVP) — this is an
      infrastructure decision, flag it rather than picking silently.
- [ ] Integration tests: generation produces a correct, independent
      `Expense`; disabling a template stops generation; editing a
      template doesn't touch past occurrences.

**Acceptance:** generation is deterministic and tested; trigger mechanism
decision documented in `docs/DECISIONS.md` if it has infra consequences;
CI green.

## 5. Backend hardening pass `[todo]`

The known-limitations list PR #2 shipped with, closed out in one
dedicated pass once all domain modules exist, matching PRD §76's
Production Quality Gate rather than being picked at ad hoc:

- [ ] Idempotency keys on financial-record-creating POSTs (expenses,
      settlements) — a request that fails at response serialization
      currently still commits its DB write, with the client seeing a 500
      and no way to know the create succeeded.
- [ ] Run nested `Profile` objects in all responses through
      `toAuthProfile` consistently.
- [ ] Fix the pre-existing duplicate-import lint warning in
      `expenses.service.ts`.
- [ ] Fix `groups.create`'s friend-check loop doing redundant queries on
      duplicate `memberIds`.
- [ ] Set the OAuth state cookie's `secure` flag based on `NODE_ENV`.

**Acceptance:** PRD §76's checklist (TypeScript/Lint/Unit/Integration/
Build all PASS) is genuinely clean, no asterisks.

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
