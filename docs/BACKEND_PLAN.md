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

## 1. Auth/users tests `[todo]`

`auth`/`users` are the only implemented modules with zero automated
tests — everything since (friends onward) established the pattern of
pure-logic unit tests in `packages/types` + real-Postgres integration
tests per service in `apps/api/src/modules/*/*.service.spec.ts`. Close
that gap before adding more untested surface area on top.

- [ ] Unit tests for anything pure-logic in `auth`/`users` (token hashing,
      OTP code generation determinism/entropy, session TTL math).
- [ ] Integration tests for `AuthService`: OTP request/verify/lockout/
      cooldown, Google sign-in linking-by-email (including the
      case-normalization fix from PR #2), session issuance/guard/
      revocation.
- [ ] Integration tests for `UsersService`: profile get/update.
- [ ] `GoogleOAuthService.exchangeCode` calls out to Google's real API —
      needs a decision on how to test it (mock the HTTP call vs. skip;
      no existing pattern in this repo for mocking external HTTP, so
      this is a small design choice of its own, not just "add tests").

**Acceptance:** `pnpm --filter @abro/api test` covers `auth`/`users` at
the same level of rigor as every other module; CI green.

## 2. Analytics `[todo]`

PRD §26. Monthly/yearly spending insights: total expenses, amount paid,
personal share, amount owed, amount received, settlements, category
breakdown (monthly); yearly total, monthly trend, category distribution,
group spending, personal contribution (yearly). Pure read-side
aggregation over `Expense`/`ExpenseParticipant` — no dependency on
notifications or recurring, and doesn't require touching any existing
module. Lowest-risk pick, hence first.

- [ ] Define the exact response shapes per PRD's definitions (Total
      Spending / Your Contribution / Your Share / Net Position must stay
      consistent with how `balances` already defines these).
- [ ] `AnalyticsService` + `GET /analytics/monthly`, `GET /analytics/yearly`
      (exact routes TBD at implementation time).
- [ ] Unit tests for any extracted pure aggregation logic; integration
      tests against real Postgres for the full queries.

**Acceptance:** matches PRD §26's field list exactly; tested; CI green.

## 3. Notifications `[todo]`

PRD §34. In-app only for MVP (web push/email/Telegram are later).
Different in kind from the modules built so far: its event list (expense
added/edited/deleted, settlement, group invitation, group membership
changes, recurring expense, debt simplification changes) means this
isn't just a new module — it requires going back and adding
notification-emission calls into the **already-built** `friends`,
`groups`, `expenses`, and `settlements` services. Do this as one
deliberate pass, not picked at piecemeal later.

- [ ] `NotificationsService` (list, mark-read) + `GET /notifications`,
      `PATCH /notifications/:id/read` (or similar).
- [ ] Retrofit: each event in the PRD's list gets a notification created
      at the point it happens — audit every existing service method
      that PRD §34 says should notify.
- [ ] Integration tests: creating an expense/settlement/etc. produces the
      expected notification row for the expected recipient(s).

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
