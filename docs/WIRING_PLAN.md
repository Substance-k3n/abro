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

## Phase 2 — Auth flow `[done, merged into main]`

Branch: `feature/auth-screens` (merged into `main`)

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

**Verified:** `pnpm lint`/`typecheck`/`build` all pass for every route.
Click-through in a real browser (Splash → Onboarding → Sign in → OTP →
Profile setup) confirmed working with no console errors, including
dynamic email display and OTP auto-advance/auto-submit. Caught and
fixed one desktop-width bug in this pass: the onboarding CTA button
(`Next`/`Get Started`) was missing the `max-w-[340px]` constraint every
other screen's action button has, so it stretched edge-to-edge instead
of forming a card — now consistent with splash/sign-in/verify-email/
setup-profile. Desktop-width verification was done directly; true
mobile-width (~390px) verification was blocked by a window-resize
tooling limitation in this environment (window manager didn't honor
resize requests) — worth a follow-up pass with working resize/device
emulation before Phase 3 ships, though nothing here suggests a
mobile-specific issue exists (every screen's mobile-first Tailwind
classes are unchanged from the original port).

**Acceptance:** every AUTH-0x route exists and the click-through
Splash → Onboarding → Sign in → OTP → Profile setup works with mock
data, on mobile width and desktop width. Met for desktop; mobile width
assumed fine (unchanged mobile-first styles) but not tool-verified.

## Phase 3 — Core dashboard `[done]`

Branch: `feature/dashboard-screens`

`DASH-01`…`DASH-08`: Home, Activity, Friends, Friend Detail, Groups,
Balances, Notifications, Search. This is where `packages/ui`'s
financial components earn their keep — `MoneyDisplay`, `AmountBadge`,
`BalanceCard`, `ActivityItem`, `PersonRow`, `EmptyState`, `Avatar`,
`SectionLabel`, `BackButton`, `CategoryIcon`/`GroupIcon`
(`ABRO_FRONTEND_SPEC.md` §12) were built for real here, all backed by
`@abro/types`' `formatMoney` and `MinorUnits` (bigint) — no money value
anywhere in this phase is a `Number`.

Routes shipped, all under `apps/web/src/app/(dashboard)/`:

- [x] `/home` — DASH-01. Balance card, quick actions, owed-to-you/
      you-owe split, group summary, recent activity.
- [x] `/activity` — DASH-02. Search + All/Expenses/Settlements/Groups
      filter tabs over `ACTIVITIES`' real `type: 'expense'|'settlement'`
      field; infinite scroll and date-range filter deferred (mock data
      is a small fixed array with relative-time strings, not real
      dates).
- [x] `/friends` — DASH-03. Owed-to-you/you-owe/settled-up (collapsed
      by default) sections, search.
- [x] `/friends/[friendId]` — DASH-04. Balance card, Expenses/
      Settlements tabs (split via `ACTIVITIES`' `type` field, matched
      to the friend by name since mock `Activity` rows carry no
      `friendId`), inline actions (add expense, settle up, view
      all-time spending); remove-friend is a disabled placeholder
      pending a confirm-dialog pattern and a real DELETE endpoint.
- [x] `/groups` — DASH-05. Active/settled split, type badge, member
      count, balance.
- [x] `/balances` — DASH-06. No prototype reference (spec-only screen)
      — total balance card combining friends + groups, All/Friends
      only/Groups only filter, per-row quick-settle links. Currency
      breakdown and per-currency filter omitted (app is ETB-only
      today).
- [x] `/notifications` — DASH-07. Mark-all-read/mark-read actually
      mutate local state (an improvement over the prototype's inert
      buttons).
- [x] `/search` — DASH-08. No prototype reference (spec-only screen) —
      auto-focused input, All/Expenses/People/Groups tabs, searches
      across `FRIENDS`, `SEARCH_RESULTS`, `GROUPS`, `ACTIVITIES`.
      Settlements category and recent-searches/suggestions omitted
      (need a persistence layer that doesn't exist yet).

Every tappable list row (`PersonRow`, `ActivityItem`) navigates via its
own `onClick` + `useRouter().push(...)`, not by wrapping the component
in a `<Link>` — both render internally as a `<button>`, and a `<Link>`
wrapper would nest a button inside an anchor.

**Verified:** `pnpm typecheck`/`lint`/`build` all pass clean across all
8 routes (confirmed in `next build`'s route list). Click-through in a
real browser (desktop width) confirmed: Groups' active/settled split
and balance coloring, Activity's search + filter tabs, Friends' three
sections, Friends→Friend Detail navigation and its Expenses/Settlements
tabs, Balances' combined friends+groups total (owed 4,470 − owed
6,080 = -1,610 "you owe", correct), and Search's live filtering and
People-result→Friend Detail navigation — no console errors or React
warnings on any of them.

**Acceptance met:** all 8 routes render against mock data matching the
prototype's `FRIENDS`/`GROUPS`/`ACTIVITIES` shape closely enough to
swap for real API data later without a UI rewrite (Phase 8).

## Phase 4 — Expense management `[done]`

Branches: `feature/expense-wizard-foundation`, `feature/expense-payer-
participants`, `feature/expense-split-methods`, `feature/expense-
review`, `feature/expense-detail-edit` (five PRs, #6-#10, each merged
into `dev` — this phase was split up per-PR rather than one branch, per
the new `abro-git-workflow` skill).

`EXP-01`…`EXP-10`: the add-expense wizard (basic details → payer →
participants → split method → exact/percentage/shares → review),
expense detail, edit. This is the first screen set that actually calls
`@abro/types`' `assertSharesMatchTotal`/`splitEqually`/`splitByWeights`
client-side for live validation — the same functions `apps/api` uses
server-side, per `docs/DECISIONS.md` ADR-002's whole reason for sharing
`packages/types`.

Routes shipped, all under `apps/web/src/app/`:

- [x] `expenses/new` (EXP-01, Details), `expenses/new/payer` (EXP-02),
      `expenses/new/participants` (EXP-03), `expenses/new/split`
      (EXP-04) + `.../exact`/`.../percentage`/`.../shares` (EXP-05/06/
      07), `expenses/new/review` (EXP-08) — a routed multi-step wizard
      (not the prototype's single collapsed screen — see
      `expense-draft.tsx`'s header comment) sharing state via
      `ExpenseDraftProvider`, outside the `(dashboard)` chrome per the
      spec's "modal/sheet" framing for this flow.
- [x] `(dashboard)/expenses/[id]` (EXP-09, Detail view) and
      `expenses/[id]/edit` (EXP-10, Edit) — added in the last PR, along
      with a new `EXPENSES` mock array (`~/lib/mock-data.ts`) and the
      first real navigation from Home/Activity/Friend Detail/Search's
      activity rows into a per-expense detail page (previously
      display-only). EXP-10 is deliberately scoped down from a full
      pre-filled wizard re-run — see its header comment for why.

**Verified:** `pnpm typecheck`/`lint`/`build` all pass clean across all
10 screens. Manual browser click-through of the full create flow
(Details → Payer → Participants → Split → Review → Create, including a
group expense with pre-selected members) and the detail/edit flow
(opening a real expense, editing its amount and participants, and
confirming the recalculated split persists) — both confirmed correct
arithmetic and no console errors. Split-method math specifically
verified with real numbers: Equal (333 ETB ÷ 3 → 111.00 each exactly),
Exact (3-state balanced/over/under badge), Percentage (50/30/20 of 333
→ 166.50/99.90/66.60, summing back to exactly 333.00), Shares (weights
1/3/1 of 333 → 66.60/199.80/66.60, summing back to exactly 333.00).

**Acceptance met:** all four split methods validate correctly against
the shared money utilities; the review step's total always matches
`sum(participant shares)` (enforced via `isSplitValid`, which itself
calls `assertSharesMatchTotal` for the Exact method).

## Phase 5 — Groups `[done]`

Branches: `feature/group-create-wizard`, `feature/group-detail`,
`feature/group-expenses-balances`, `feature/group-members-settings`,
`feature/group-simplified-debts` (five PRs, #11-#15, each merged into
`dev` -- same per-PR pattern Phase 4 established).

`GRP-01`…`GRP-08`: create group, add members, group detail/expenses/
balances/members/settings, simplified debt view.

Routes shipped, all under `apps/web/src/app/`:

- [x] `groups/new` (GRP-01, Basic Info) + `groups/new/members` (GRP-02)
      -- a routed 2-step wizard sharing state via `GroupDraftProvider`,
      same pattern as the expense wizard. No separate review step,
      unlike the prototype's 3-step flow -- the spec only describes two
      screens.
- [x] `(dashboard)/groups/[id]` (GRP-03, Detail) with Expenses/
      Balances/Members tabs, correctly scoped to the real group (the
      prototype hardcodes `GROUPS[0]` and scopes every tab to _all_ of
      `FRIENDS` regardless of real membership -- fixed here).
- [x] `groups/[id]/expenses` (GRP-04) and `groups/[id]/balances`
      (GRP-05) -- full-page expansions of GRP-03's tab previews, with
      filtering (GRP-04) and an Individual/Simplified toggle (GRP-05).
      GRP-05's Simplified view is the first UI in this app to call
      `@abro/types`' `simplifyDebts()` -- the same tested function
      `apps/api` already uses server-side (`ABRO_PRD.md` §18).
- [x] `groups/[id]/members` (GRP-06) -- includes a real (not
      placeholder) Add Member flow backed by a new `addGroupMember()`
      mock-data helper.
- [x] `groups/[id]/settings` (GRP-07) -- Basic Info, Financial Settings
      (including a real "currency locked once expenses exist"
      validation and a Simplify-debts toggle that actually gates
      GRP-05/GRP-08), Notifications (local UI state only, no real
      event system to wire to), Danger Zone (disabled placeholders).
- [x] `groups/[id]/simplified` (GRP-08) -- the standalone version of
      GRP-05's Simplified view, with an inline algorithm-explanation
      panel.

Consistently deviated from spec in one way across GRP-05/GRP-08:
"who owes whom (full network)" / "N payments instead of M" both
assume a real pairwise expense/settlement graph this app doesn't
model (only aggregate net positions, `GROUP_BALANCES` in
`~/lib/mock-data.ts`) -- fabricating one just to fill those spec
bullets would be invented data, which this project's workflow
explicitly avoids. Both screens show the honest subset instead (net
positions; the real simplified payment count with no "instead of"
comparison).

**Verified:** `pnpm typecheck`/`lint`/`build` all pass clean across
all 16 screens. Manual browser click-through confirmed: the full
create-group → real detail page → back-to-list loop (closing a gap
PR1 couldn't verify on its own, since the detail page didn't exist
yet); `GROUP_BALANCES` summing to exactly zero across every group;
`simplifyDebts()` producing correct results on real group data;
Group Expenses' category filter; a real Add Member mutation (caught
and fixed one bug here -- a missing re-render trigger after a
module-level mutation, see PR4); and Settings' currency-lock
validation (disabled with expenses present, enabled without) plus its
Save flow actually persisting via `updateGroup()`. No console errors
on any screen.

**Acceptance met:** all 8 screens work against mock data, scoped
correctly to the group they belong to (not the prototype's
hardcoded-first-group shortcut); the shared debt-simplification code
`apps/api` already ships with is now exercised by the frontend too.

## Phase 6 — Settlement `[done]`

Branches: `feature/settlement-foundation` (PR #16), `feature/settlement-
amount-confirm` (PR #18, opened after #17 was auto-closed by GitHub
when its base branch was deleted post-merge of #16 -- same commits,
retargeted at `dev` directly), `feature/settlement-history` (this PR).

`BAL-01`/`BAL-02`, `STL-01`…`STL-05`. Depended on Phase 4's split
utilities and the balance-derivation rules in `ABRO_PRD.md` §16.

- [x] `BAL-01` (Balance Detail, Friend) -- the spec itself marks this
      "already covered in DASH-04 Friend Detail" (`ABRO_FRONTEND_SPEC.md`
      line 1507); no separate route built, matching the spec's own note.
- [x] `BAL-02` (Balance Detail, Group) -- no separate `/balances/
group/[id]` route built. Unlike BAL-01, the spec doesn't call this
      one out as covered elsewhere, but its full content -- "Your
      Balance Card" (amount + direction), member-by-member breakdown,
      contributing expenses, Settle Up / View simplified debts actions
      -- is already exactly what Phase 5's `groups/[id]` (GRP-03, the
      balance card) + `groups/[id]/expenses` (GRP-04, contributing
      expenses) + `groups/[id]/balances` (GRP-05, member breakdown +
      simplified view + Settle links) provide together. Building a
      fourth route that re-renders the same data would duplicate an
      existing screen rather than fill a gap -- same reasoning the spec
      applied to BAL-01.
- [x] `settle/page.tsx` (STL-01, Choose Person) + `settle/layout.tsx`
      (shared `SettleDraftProvider` wizard state, same pattern as the
      expense wizard) -- outstanding balances by friend and by group,
      search, select → amount.
- [x] `settle/amount/page.tsx` (STL-02, Enter Amount) -- current
      balance display, amount input with Full/Half quick actions,
      validation against the real outstanding amount (`getOutstanding`
      in `~/lib/mock-data.ts`).
- [x] `settle/confirm/page.tsx` (STL-03, Confirm) -- summary, optional
      method/note fields, the required "ABRO does not process payments"
      notice, Confirm → the one real mutation in this flow
      (`createSettlement`).
- [x] `settle/success/page.tsx` (STL-04, Settlement Success) -- landed
      in the same PR as STL-02/03 rather than separately, since
      STL-03's Confirm button is the create flow's only real side
      effect and needs a real destination to be verifiable end to end
      (see the file's own header comment for the full reasoning, plus
      the snapshot-not-live-draft pattern that avoids a state-reset
      race with its own "Back to Home" action).
- [x] `settlements/page.tsx` (STL-05, Settlement History) -- reads
      `SETTLEMENTS` (not `ACTIVITIES`; see `~/lib/mock-data.ts`'s own
      header comment earmarking that array for this screen). All/You
      paid/You received filter pills + a search-by-person box, reached
      via STL-04's "View balance history" link (built ahead of this
      route in the earlier PR, same phased-landing pattern as every
      other cross-phase link in this app).

Deviations from spec (Confirmed, all following patterns already
established in Phase 3/5): STL-05's "by date range" filter omitted --
`SETTLEMENTS.date` is a display string ("Yesterday", "Sat"), not a
real `Date`, same gap Activity's (DASH-02) date-range omission already
documented; "by person" filter folded into the search box rather than
a separate control; header "Filter button" → inline `.neo-tab` pills;
"tap settlement → Detail view" → navigates to the settlement's real
context (the group, or the counterparty's friend page) instead of a
nonexistent STL-0x detail screen, since the spec's own screen list
stops at STL-05.

**Verified:** `pnpm typecheck`/`lint`/`build` pass clean.

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
