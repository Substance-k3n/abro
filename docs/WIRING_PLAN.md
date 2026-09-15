# Wiring Plan

How the Figma Make prototype (`~/Downloads/Design Ultra Modern UI (1)/`)
becomes real product code in `apps/web` + `packages/ui`, and in what
order. Each phase is its own branch off `main`, merged via PR when its
acceptance line is met. Update the status marks (`todo` / `in progress`
/ `done`) as we go — this file is the map, not a one-time plan.

## What we're porting vs. what we're not

The prototype is a single 6,500-line `App.tsx`: ~25 screens as one
client-side state machine (`useState<Screen>`), wrapped in a fake
phone-bezel with a fake status bar (`9:41`, fake signal dots) — that
frame is Figma Make preview chrome, not product UI, and is **not**
ported.

What **is** worth keeping, faithfully:

- The token system in `src/index.css`: light/dark neomorphic CSS
  variables (`--neo-bg`, `--t-primary`, `--c-green`/`--c-red`, etc.)
  and the `.neo-*` utility classes (raised/inset/flat surfaces, inputs,
  toggles, badges, category pills).
- The type system: **Outfit** (display), **DM Sans** (body),
  **JetBrains Mono** (mono/data).
- Each screen's actual layout and copy, read out of its component
  function one at a time — not copy-pasted, since the prototype's
  `Screen`/`setScreen` state-machine navigation gets replaced by real
  Next.js App Router routes (the routes are already specified per
  screen in `ABRO_FRONTEND_SPEC.md`).

## Phase 1 — Foundation `[done, merged into main]`

- [x] Port the token system into `apps/web/src/app/globals.css`
      (light + dark, matching the prototype's `[data-theme="dark"]`
      pattern — same mechanism `artifact-design` conventions use).
- [x] Wire Outfit/DM Sans/JetBrains Mono via `next/font/google` feeding
      the same `--font-display`/`--font-body`/`--font-mono` variables.
- [x] Port the real Splash screen (`AUTH-01`) as proof the foundation
      works end to end, replacing the placeholder at `apps/web/src/app/page.tsx`.
- [ ] Extract the first shared primitives into `packages/ui`
      (`NeoSurface`, `NeoButton`) once a second screen needs them —
      one screen alone doesn't justify the package boundary yet.
- [ ] `AppShell` + `BottomNav` (mobile) / sidebar (desktop), per
      `ABRO_FRONTEND_SPEC.md` §11 responsive requirements — real
      layout, no phone bezel.

**Acceptance:** `pnpm build` passes; splash screen renders with the
correct fonts/tokens in both light and dark; no fake status bar
anywhere in the DOM.

## Phase 2 — Auth flow `[built, awaiting review]`

Branch: `feature/auth-screens` (pushed, not yet merged)

Screens (`ABRO_FRONTEND_SPEC.md` §2, `AUTH-01`…`AUTH-06`):

- [x] `/` — Splash (Phase 1)
- [x] `/onboarding` — 3-slide carousel
- [x] `/auth/signin` — also stands in for sign-up (prototype converges
      both into one screen; no separate `/auth/signup` route exists
      because the design doesn't have one)
- [x] `/auth/verify-email` — 6-digit OTP, auto-advance + auto-submit
- [x] `/auth/setup-profile` — avatar picker + mock username check

Wired against **mock state only** — real auth depends on
`apps/api`'s `auth` module, which is still a stub. Uses the
prototype's own placeholder data/copy so the flow is clickable end to
end before any backend exists.

**Verified so far:** `pnpm lint`/`typecheck`/`build` all pass for every
route. **Not yet verified:** an actual click-through in a browser — no
browser tooling was connected this session, so "does it look and feel
right" still needs a human (or a later session with browser access)
before merging to `main`.

**Acceptance:** every AUTH-0x route exists and the click-through
Splash → Onboarding → Sign in → OTP → Profile setup works with mock
data, on mobile width and desktop width.

## Phase 3 — Core dashboard `[todo]`

Branch: `feature/dashboard-screens`

`DASH-01`…`DASH-08`: Home, Activity, Friends, Friend Detail, Groups,
Balances, Notifications, Search. This is where `packages/ui`'s
financial components earn their keep — `MoneyDisplay`, `BalanceCard`,
`ActivityItem`, `EmptyState` (`ABRO_FRONTEND_SPEC.md` §12) get built
for real here, backing them with `@abro/types`' `formatMoney`.

**Acceptance:** all 8 routes render against mock data matching the
prototype's `FRIENDS`/`GROUPS`/`ACTIVITIES` shape closely enough to
swap for real API data later without a UI rewrite.

## Phase 4 — Expense management `[todo]`

Branch: `feature/expense-screens`

`EXP-01`…`EXP-10`: the add-expense wizard (basic details → payer →
participants → split method → exact/percentage/shares → review),
expense detail, edit. This is the first screen set that actually calls
`@abro/types`' `assertSharesMatchTotal`/`splitEqually` client-side for
live validation — the same functions `apps/api` uses server-side, per
`docs/DECISIONS.md` ADR-002's whole reason for sharing `packages/types`.

**Acceptance:** all four split methods validate correctly against the
shared money utilities; the review step's total always matches
`sum(participant shares)`.

## Phase 5 — Groups `[todo]`

Branch: `feature/group-screens`

`GRP-01`…`GRP-08`: create group, add members, group detail/expenses/
balances/members/settings, simplified debt view.

## Phase 6 — Settlement `[todo]`

Branch: `feature/settlement-screens`

`BAL-01`/`BAL-02`, `STL-01`…`STL-05`. Depends on Phase 4's split
utilities and the balance-derivation rules in `ABRO_PRD.md` §16.

## Phase 7 — Profile & settings `[todo]`

Branch: `feature/profile-settings-screens`

`PRF-01`, `SET-01`…`SET-03`.

## Phase 8 — Wire to the real API `[todo]`

Branch: `feature/api-integration`

Replace every phase's mock data with real calls into `apps/api`, screen
set by screen set, in the same order they were built (auth first, then
dashboard, then expenses...). This is also when `apps/api`'s modules
(`auth`, `users`, `friends`, `groups`, `expenses`, `balances`,
`settlements`) stop being empty `README.md` stubs.

**Acceptance:** the "MVP Acceptance Criteria" checklist in
`ABRO_PRD.md` §54 passes end to end against a real database, not mocks.
