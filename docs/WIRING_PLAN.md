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

## Phase 7 — Profile & settings `[done]`

Branch: `feature/profile-settings-screens`

`PRF-01`, `SET-01`…`SET-03`. Shipped as one PR rather than split further
-- unlike Phase 5/6's per-sub-feature branches, Profile and Settings
link to each other in both directions (PRF-01's "App settings" row,
SET-01's "Profile" row) and edit the same underlying state
(`CURRENT_USER.currency`/`language`), so splitting them across two PRs
would mean one PR's screen linked to a route that didn't exist yet
_and_ both PRs touching the same `mock-data.ts` fields -- a real
coupling, not an arbitrary bundling choice.

- [x] `/profile` (PRF-01) -- editable display name/avatar-color/phone,
      email with a verified badge, Preferences (currency, language,
      a Notifications summary row linking to SET-02), Statistics (4
      cards computed live from `getCurrentUserStats()` -- expenses
      tracked, amount managed, groups joined, friends -- never invented
      figures), and Account Actions.
- [x] `/settings` (SET-01) -- Account (links to Profile, and to SET-03
      for both "Privacy" and "Security", matching the spec's single
      combined route), Preferences (currency/language mirror PRF-01's
      own fields; date/number format are local-only, nothing in this
      app reads a configurable format yet), Notifications (channel
      master toggles + a link into SET-02), Data, About, and a real
      Sign out action.
- [x] `/settings/notifications` (SET-02) -- channel toggles, one toggle
      per notification type (not a full per-type-per-channel matrix --
      see `~/lib/mock-data.ts`'s `NotificationPrefs` header comment),
      quiet hours.
- [x] `/settings/privacy` (SET-03) -- password (disabled placeholder,
      no fabricated "last changed" date), a real local 2FA toggle,
      privacy selectors (profile visibility, who can add you, who can
      see your expenses), Connected Accounts (Google: "Not connected"),
      and Active Sessions showing only the one session that's actually
      real ("This device") -- no invented device/location list.

New `~/lib/mock-data.ts` state backing this phase: `CURRENT_USER` grew
email/phone/currency/language/memberSince fields plus
`updateCurrentUser`; `getCurrentUserStats()` (derived, not stored, same
"expenses are facts" rule this project applies to money); and two new
mock-state + mutator pairs, `NOTIFICATION_PREFS`/`updateNotificationPrefs`
and `PRIVACY_SETTINGS`/`updatePrivacySettings`, both module-level
mutations via `Object.assign` (same pattern as `updateGroup`).

Deviations from spec (Confirmed, all following patterns already
established in earlier phases): every destructive or otherwise
unbuildable action (change password, export data, delete account,
disconnect Google, 2FA setup) is a disabled placeholder, same class as
every prior phase's Remove friend/Delete group/etc; Data's "Storage
usage" is omitted entirely rather than showing an invented number, and
Active Sessions shows no fabricated device list -- both follow this
project's standing rule against presenting made-up figures as real
data (see GRP-05's equivalent omission of a fake pairwise-debt
network).

**Verified:** `pnpm typecheck`/`lint`/`format:check` all pass clean;
`pnpm --filter web build` includes all four new routes in its static
route list. Manual browser click-through confirmed: Profile's avatar-
color picker and Save flow, Statistics cards showing real computed
values, the Profile → Settings → Notifications → Privacy navigation
chain (and back), notification channel/type toggles and quiet-hours
expand/collapse mutating `NOTIFICATION_PREFS` live, and the 2FA toggle
correctly revealing/hiding its "Set up 2FA" placeholder. No console
errors on any screen.

**Acceptance met:** all 4 screens work against mock data; Profile and
Settings are mutually reachable from within the app (not dead-end
routes), closing the gap left by Phase 3's `nav-items.ts`, whose
"Profile" tab and Home's settings-gear icon both pointed at `/profile`
before this phase existed.

## Phase 8 — Wire to the real API `[in progress]`

Replace every phase's mock data with real calls into `apps/api`, screen
set by screen set, in the same order they were built (auth first, then
dashboard, then expenses...). `apps/api`'s modules have been real (not
`README.md` stubs) since the Go rewrite (ADR-007); this phase is about
the frontend actually calling them instead of `~/lib/mock-data.ts`.

### Slice 1 — Infrastructure + auth `[done]`

Branches: `feature/api-username-cors` (PR #21, backend), `feature/auth-api-integration` (this PR, frontend).

Two real gaps found before any screen could be wired, both closed in
PR #21: `apps/api` had no CORS handling at all (blocking every future
slice, not just this one -- the session cookie can't cross :3200/:3201
without it), and the mock AUTH-06 (setup-profile) assumed a username
system the real `Profile` model never had a field for (added on
request rather than dropping the screen -- `profiles.username`,
nullable + unique, migration `0010_username`).

- [x] `~/lib/api-client.ts` -- shared fetch wrapper (`credentials:
'include'`, apps/api's `{statusCode, code, message}` error
      envelope mapped to a typed `ApiError`). Every later slice's
      `~/lib/*-api.ts` builds on this same client.
- [x] `~/lib/auth-api.ts` -- typed calls for `/auth/otp/*`, `/auth/me`,
      `/auth/logout`, `/users/username-available`, `PATCH /users/me`,
      plus `postSignInPath()`: the one place "route to setup-profile
      vs. home" is decided, from `AuthProfile.username === null`.
- [x] `/auth/signin` (AUTH-03/04) -- password field and "Forgot
      password?" removed entirely (apps/api has no password auth to
      match them); submit calls the real `POST /auth/otp/request`,
      Google is a real page navigation to `GET /auth/google`.
- [x] `/auth/verify-email` (AUTH-05) -- auto-submit calls the real
      `POST /auth/otp/verify` and routes via `postSignInPath()`
      instead of always landing on setup-profile. Resend calls the
      real endpoint too, with a client-side 60s cooldown matching
      apps/api's own `OTP_COOLDOWN`.
- [x] `/auth/setup-profile` (AUTH-06) -- the hardcoded `TAKEN_USERNAMES`
      list + fake 600ms check replaced by a real, 400ms-debounced call
      to `GET /users/username-available`; Continue calls the real
      `PATCH /users/me`. Avatar color picker stays cosmetic-only (no
      image upload/storage exists) -- same deviation as PRF-01.
- [x] `/auth/callback` -- new, not an `ABRO_FRONTEND_SPEC.md` screen.
      Google's OAuth redirect can't carry "is this profile new" as
      data the way the OTP path's client-side response can, so it
      always lands here, which calls `GET /auth/me` and applies the
      same `postSignInPath()` rule from an already-established
      session. Also fixed two apps/api redirect targets that pointed
      at routes this Next.js app doesn't have (`/dashboard` -> here,
      `/sign-in` -> `/auth/signin`).

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` all clean.
Manual end-to-end browser click-through against a real local
Postgres+API: sign-up email -> real OTP (read from the dev-mode
console log, no mailer configured locally) -> verify -> setup-profile
with a live availability check -> `/home`; a second sign-in for the
same (now-onboarded) email skips straight to `/home`; a wrong code
shows apps/api's real `OTP_INCORRECT` message and clears the boxes.
Google sign-in itself isn't end-to-end testable without real OAuth
credentials (none configured in any environment yet, tracked
separately) -- confirmed instead that hitting `/auth/google` returns
the expected `GOOGLE_OAUTH_NOT_CONFIGURED` error rather than crashing.

**Known limitation carried forward:** clicking "Continue with Google"
today lands on apps/api's raw JSON error response (no Google
credentials configured anywhere yet), not a friendly in-app message --
acceptable for now since this mirrors a pre-existing, already-tracked
gap (real Google OAuth credentials are still an outstanding manual
setup step), not something this slice regressed.

### Slice 2 — Home (DASH-01) `[done]`

Branches: `feature/balances-summary-endpoint` (PR #23, backend),
`feature/home-api-integration` (this PR, frontend).

No aggregate "all my balances" endpoint existed -- only per-friend
(`GET /balances/friends/{id}`) and per-group (`GET /balances/groups/
{id}`) lookups, which would have forced Home into an N+1 fan-out (one
request per friendship/membership). Decided with the user to add a
real aggregate endpoint instead (`GET /balances/summary`, PR #23)
rather than accept that fan-out.

- [x] `~/lib/friends-api.ts`, `~/lib/groups-api.ts`, `~/lib/
balances-api.ts`, `~/lib/notifications-api.ts`, `~/lib/
expenses-api.ts` -- typed calls into their respective apps/api
      modules, following `~/lib/auth-api.ts`'s pattern from slice 1.
      Each later slice that needs one of these modules extends its
      existing file rather than starting a new one.
- [x] `~/lib/identity.ts` -- `initialsOf`/`colorForId`, shared by every
      screen rendering a real person's avatar (no stored color field
      exists -- AUTH-06/PRF-01's picker is cosmetic-only).
- [x] `~/lib/balances-api.ts`'s `friendOweSplit()` -- documents and
      centralizes a real gotcha: apps/api's friend and group balances
      use **opposite sign conventions** (friend: positive = "I owe
      them"; group: positive = "they/the group owe me", matching this
      app's existing mock `Group.balance` convention already). Every
      later slice showing a friend balance must go through this
      function rather than re-deriving the sign logic.
- [x] `/home` (DASH-01) -- first dashboard screen off mock data. Five
      parallel requests on mount (profile, friends, groups, balances
      summary, unread notifications, 5 most recent expenses); a real
      loading spinner and error-with-retry state, both new to this app
      (every mock-data screen before this was synchronous). This is
      the reference pattern for every later Phase 8 dashboard slice.

Deviations (Confirmed): Recent Activity rows are not clickable --
they'd link to `/expenses/[id]`, still mock-data-only until Phase 8
reaches expenses, and would show "not found" for a real id. Group
icon/color still come from `~/lib/mock-data.ts`'s `GROUP_TYPES` lookup
(client-side reference data, not mock _facts_), matched
case-insensitively against apps/api's UPPERCASE `type` enum. Activity
row timestamps are an absolute short date, not relative ("2h ago") --
no relative-time formatter exists yet, out of scope for this slice.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` all clean;
`go build`/`vet`/`gofmt -l`/`go test ./...` (backend) all clean.
Manual end-to-end browser verification with two real signed-up users,
a real friendship, a real personal expense, and a real group + group
expense: friend balance (red, "you owe", correct amount and sign),
group balance (green, "the group owes you", correct amount and
opposite sign convention correctly _not_ flipped), Recent Activity
rows for both showing correct title/sub/amount/direction, unread
notification badge. Confirms the friend/group sign-convention split is
implemented correctly in both directions, not just one.

### Slice 3 — Friends, Balances Overview, Notifications `[done]`

Branch: `feature/friends-balances-notifications-api-integration`.

No new backend work needed -- unlike slices 1 and 2, every endpoint
these three screens need already existed (`GET /friends/`, `GET
/groups/`, `GET /balances/summary`, `GET /notifications`, `PATCH
/notifications/read-all`, `PATCH /notifications/{id}/read`). Purely a
frontend slice, reusing slice 2's `~/lib/*-api.ts` modules.

- [x] `~/lib/balances-api.ts`'s `deriveFriendRows()`/`deriveGroupRows()`
      -- extracted from Home's (DASH-01) inline logic into shared
      helpers once a second and third screen needed the identical
      `listFriends()`/`listGroups()` + `getBalancesSummary()` join.
      Home itself was refactored to call these too, so all three
      screens can't drift apart on how a balance is computed.
- [x] `~/lib/format.ts`'s `formatShortDate()` -- same extraction, for
      the absolute-short-date formatting Home's `toActivityDisplay()`
      introduced and Notifications now also needs.
- [x] `/friends` (DASH-03) -- "Settled up" (spec's third section) is
      new here; Home never needed it (it hides zero-balance friends
      entirely). Search filters the same real rows.
- [x] `/balances` (DASH-06) -- All/Friends only/Groups only filter tabs
      over the same `deriveFriendRows()`/`deriveGroupRows()` data Home
      and Friends use; a real loading state (the spec's own "loading
      state" item, previously marked not-applicable-yet against mock
      data).
- [x] `/notifications` (DASH-07) -- real `type` enum
      (`apps/api/internal/notifications/service.go`) mapped to the same
      four lucide icons the mock version hardcoded per seed row. Mark-
      read/mark-all-read apply optimistically to local state and roll
      back on failure, rather than waiting on the round trip.

Deviation (Confirmed): a friend row on both `/friends` and `/balances`
still navigates to `/friends/[friendId]`, still mock-data-only until
Friend Detail (DASH-04) is wired in a later slice -- verified this
degrades gracefully (the page's own "Friend not found" empty state for
an unmatched real id), not a crash.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` all clean.
Manual end-to-end browser verification with two real signed-up users,
a real friendship, and a real personal expense between them: `/friends`
correctly sections the friend under "People you owe" with the right
signed amount; `/balances` shows the identical amount and total, and
its Groups-only filter correctly empties out for a user with no
groups; `/notifications` shows a real `EXPENSE_ADDED` notification with
the right icon/title/body, marking it read updates the UI instantly
and persists (confirmed via a direct API call after the click) with
the unread badge/"Mark all read" button correctly disappearing.

### Slice 4 — Activity, Friend Detail, Groups `[done]`

Branches: `feature/groups-list-stats` (PR #26, backend),
`feature/activity-friend-detail-groups-api-integration` (this PR,
frontend).

DASH-05's cards show "N members · last activity", but `GET /groups/`
always returned `members: []` and no timestamp -- the only frontend
option was one `GET /groups/{id}` per card. Decided with the user to add
list-only `memberCount` (ACTIVE members) and `lastActivityAt` (latest
non-deleted expense's `created_at`, falling back to the group's own)
fields to `GET /groups/` instead (PR #26), same call as slice 2's
`/balances/summary`. Activity and Friend Detail needed no backend work.

- [x] `~/components/LoadStates.tsx` -- `LoadingState`/`ErrorState`,
      extracted from the private copies Home/Friends/Balances/
      Notifications each grew in slices 2-3 before three more screens
      added their own. Those four pages now use it too.
- [x] `~/lib/groups-api.ts`'s `GroupListItem` + `groupTypeFor()` -- the
      `GROUP_TYPES` icon/color lookup Home and Balances each inlined,
      now shared by all three group-showing screens. `GroupRow`
      (`deriveGroupRows()`) carries `type` for it.
- [x] `/activity` (DASH-02) -- real paginated `GET /expenses` (30 per
      page, explicit "Load more" rather than infinite scroll). Filters
      are now exact instead of heuristic (Settlements = `splitType
SETTLEMENT`, Groups = has `groupId`), applied client-side over
      loaded rows along with search.
- [x] `/friends/[friendId]` (DASH-04) -- replaces the mock "does the
      activity text mention their first name" heuristic with the real
      `GET /expenses?friendId=` relation. That list is personal-scope
      only, exactly what the pairwise balance above it is computed
      from, so the two reconcile; group expenses with the friend live
      in each group's balance instead. Closes slice 3's "friend rows
      link to a mock-only page" gap.
- [x] `/groups` (DASH-05) -- real groups + balances via
      `deriveGroupRows()`, member count and last activity from PR #26.

Deviations (Confirmed): expense rows on all three screens are still not
clickable (EXP-09 is mock-only, same as Home); group cards still link to
mock-only GRP-03, which degrades to its own "Group not found" state;
Friend Detail's "View all-time spending" `?friendId=` link isn't read by
Activity yet; Activity's date-range filter is still unbuilt.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean;
`go build`/`vet`/`gofmt -l`/`go test ./...` clean (backend PR). Manual
browser verification against real Postgres + the PR #26 API, with two
real users, 39 personal/group expenses and one settlement, amounts
hand-computed beforehand (Bekele owes Alice 150 - 45 + 35x5 - 50 = 230
ETB; the trip group owes Alice 300): Activity loads 30 rows then 9 more
on "Load more" with no duplicates and the button disappearing at the
end; each filter tab and search return exactly the expected rows;
Friend Detail shows "owes you 230.00 ETB" from Alice's side and "you owe
230.00 ETB" + Settle Up from Bekele's, with the settlement alone under
Settlements and the group expense correctly absent; an unknown friend id
shows "Friend not found"; Groups shows "2 members"/"1 member", type
badges, +300 / Settled for Alice and -300 for Bekele (who correctly
doesn't see Alice's solo group). Home/Friends/Balances/Notifications
re-checked after the shared-component refactor, no console errors.

### Slice 5 — Search (DASH-08) `[done]`

Branches: `feature/expenses-text-search` (PR #31, backend),
`feature/search-api-integration` (this PR, frontend).

Expenses had no server-side text search, and paging through
`GET /expenses` in the browser can't honestly search a user's whole
history -- same "fix the backend" call as slices 2 and 4: `GET
/expenses` gained an optional `q` (PR #31: case-insensitive substring
over name/category/notes, `%`/`_` matched literally, max 100 chars,
combinable with `groupId`/`friendId` and paging).

- [x] `~/lib/expenses-api.ts`'s `listExpenses({ search })` -> `q`.
- [x] `/search` (DASH-08) -- People = your friends (client-side name
      match, real balances via `deriveFriendRows()`), Groups = your
      groups (client-side, type + real `memberCount`), Expenses =
      debounced (300ms) server-side `q` search, first 30 matches with
      a "30+" label and a refine hint beyond that; stale responses are
      dropped. Settlements are covered by the expense search (they're
      expense rows named "Settlement", ADR-003). Recent searches (last 5) persist in `localStorage`, recorded on Enter or opening a
      result.

Deviations (Confirmed): non-friends are deliberately not searchable --
apps/api's `GET /friends/search` is exact email/phone match by design
(no browsing the user directory); adding people stays Add Friend's
job. Suggestions (spec) not built -- no data source yet. Expense rows
not clickable and group rows land on mock-only GRP-03, same as slice 4.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean;
`go vet`/`gofmt -l`/`go test ./...` clean (backend, with a test proven
to fail if the LIKE escaping is removed). Browser, real API from PR #31
with slice 4's two-user data: "lalibela" -> the group (Trip · 2
members) + the hotel expense; "coffee" -> "Expenses (30+)" and the
refine hint on the Expenses tab (35 real matches); "alice" -> Alice
with the correct red 230.00 ETB, opening it lands on her real Friend
Detail and records the search; "settle" -> the settlement; "%" -> No
results; recent searches persist across reloads, newest first, and
Clear empties them; no console errors.

### Slice 6 — Friend requests `[done]`

Branch: `feature/friend-requests-api-integration`.

Found while auditing what blocks a new user: DASH-03's "Add Friend"
button linked to `/friends/add`, a route that never existed (404), and
the frontend had no way to send or accept a friend request -- so a
fresh account could never get a friend, and so never split anything.
apps/api's friends module already had every endpoint needed; frontend
only.

- [x] `~/lib/friends-api.ts` -- `searchUsers`, `listIncomingRequests`,
      `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`
      (plus `api.delete` on the shared client). `searchUsers` lowercases
      email queries: `profiles.email` is stored normalized but
      `GET /friends/search` compares the raw query case-sensitively.
- [x] `/friends/add` -- exact email/phone lookup (apps/api deliberately
      never fuzzy-searches the directory), then "Add" sends the request.
- [x] `/friends` -- a "Friend requests" section with Accept/Decline;
      accepting reloads so the new friend appears through the same
      `deriveFriendRows()` path as everyone else.

Deviations (Confirmed): no outgoing/sent-requests list (no apps/api
endpoint for it); no unfriend UI yet; searching by username isn't
supported (apps/api matches email/phone only).

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean.
Manual browser verification against a live API still pending (local
Docker wasn't reachable from the session).

### Slice 7 — Expenses (EXP-01…EXP-10) `[done]`

Frontend only -- apps/api's `/expenses` routes already cover create,
read, edit, delete, notes and receipts. Three PRs, one per concern:

**7a — Add-expense wizard (EXP-01…08) `[done]`.** Branch:
`feature/expense-create-api-integration`.

- [x] `~/lib/expense-directory.tsx` -- loads me/friends/groups once for
      the wizard (layout shows the shared loading/error states), and a
      group's ACTIVE members when the draft has a group. Mirrors
      apps/api's `prepareWrite` rule for who can be on an expense:
      friends for a personal expense, group members (friends or not)
      for a group one. Picking a different group resets payer +
      participants.
- [x] The draft keeps the `ME` sentinel; `~/lib/expense-split.ts`'s
      `toCreateExpenseInput` swaps in the real id at submit and sends
      only the chosen method's inputs (apps/api recomputes every
      share -- the wizard's math is preview only).
- [x] Review → `POST /expenses` with a per-draft `Idempotency-Key`
      (double-submit safe; apps/api releases the key on failure, so a
      retry after an error works). Server errors show above the button
      and the draft is kept.
- [x] Percentage validation now matches apps/api exactly: whole basis
      points totalling 10000 (it used to accept 99.99–100.01%, which
      the server rejects). "Split remaining equally" hands out the
      leftover basis points (33.34/33.33/33.33, not 33.3 × 3).

Deviations (Confirmed): categories stay the static `CATEGORIES` list
(apps/api takes any 1–60 char string). Success still has no toast --
the wizard returns to `/home`, where the expense shows in Recent
Activity.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean.
Browser, real API, three seeded users (Alice friends with Bob and
Carol; Bob and Carol not friends; all three in "Lalibela Trip"):
group PERCENTAGE 1000 ETB paid by Carol → stored 333.40/333.30/333.30
(sums to 100000 minor); 99.99% shows "0.01% left" and blocks Next;
personal EXACT 250.50 (100.25/150.25), Create clicked twice → one
expense; group SHARES 1:3 of 333 → 83.25/249.75; removing Bob from the
group before Create → "Not an active member of this group." shown,
nothing stored, retry with the same key after re-adding him →
created once. As Bob: the group payer list offers Alice and Carol
(not his friend), the personal one only Alice.

**7b — Expense detail (EXP-09) `[done]`.** Branch:
`feature/expense-detail-api-integration`.

- [x] `(dashboard)/expenses/[id]` reads `GET /expenses/{id}`
      (`getExpense`); unknown, deleted or not-visible ids (404/403,
      or a malformed id's 400) all show "Expense not found".
- [x] Delete: in-page confirmation, then `DELETE /expenses/{id}`
      (soft delete) and back to Activity. The actions menu shows only
      when you paid or it's a group expense (a group admin may delete);
      apps/api's `requireEditAuthority` decides, and its message shows
      inline when it refuses.
- [x] Participant rows link to Friend Detail only for your friends (a
      group expense can include people who aren't).
- [x] Activity rows on Home, Activity, Friend Detail and Search now
      open this page (Search also records the query, like its other
      results).

Deviations (Confirmed): "Edit expense" was hidden until slice 7c
wired EXP-10; settlements never get Edit. apps/api
stores no creator/editor on an expense, so the activity log shows
created/updated dates only. Receipt and notes-thread UI still not built.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean.
Browser, real API (slice 7a's seeded users): as Bob, "Hotel" (group,
Carol paid) shows the stored 333.40/333.30/333.30 split with only Alice
linked; Delete → "Only the payer or a group admin can edit this
expense." inline, nothing deleted; Alice's personal "Coffee beans" shows
no menu; a random uuid and `not-a-uuid` → "Expense not found". As Alice
(payer) deleting "Coffee beans" → back on Activity, row gone,
Alice↔Bob balance −15025 → 0, `GET` → 404. Rows open the detail page
from Home, Friend Detail and Search (query saved to recent searches).

**7c — Edit (EXP-10) `[done]`.** Branch:
`feature/expense-edit-api-integration`.

- [x] `/expenses/[id]/edit` loads `GET /expenses/{id}` and saves with
      `PATCH /expenses/{id}` (`updateExpense`), then returns to the
      detail page. Unknown/deleted/not-visible ids show "Expense not
      found"; a settlement shows "Settlements can't be edited".
- [x] Editable: name, category, amount, date, note, participants.
      Payer and group are resent unchanged. If you paid, your row is
      locked in (as in EXP-03).
- [x] Addable people mirror apps/api's `prepareWrite`: your friends
      (personal) or the group's ACTIVE members (group). Current
      participants always show so they can be removed.
- [x] Split on save is `~/lib/expense-split.ts`'s `editedSplit`.
      apps/api stores only final amounts, not percentages or share
      weights. Decided (user, 2026-09-29): if amount and participants
      are unchanged, resend the stored amounts -- an EQUAL expense
      stays EQUAL (participants sent largest share first, since
      apps/api gives the remainder to the first ones and returns them
      unordered), anything else goes as EXACT (so PERCENTAGE/SHARES
      then read "Exact split"). If either changes, recalculate as
      EQUAL, with the spec's warning copy and a preview.
- [x] Server refusals (`NOT_EDIT_AUTHORIZED`, `NOT_FRIENDS`, membership)
      show above Update and the form keeps your edits.
- [x] EXP-09's actions menu has "Edit expense" again (not for
      settlements).

Deviations (Confirmed): no per-method re-editing (exact/percentage/
shares inputs) -- the wizard's split screens aren't reused here.
Category is still the static `CATEGORIES` list.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean.
`editedSplit` checked by hand against six cases (unchanged EQUAL with
the remainder on a non-first participant, unchanged PERCENTAGE,
inconsistent EQUAL → EXACT, amount changed, participant removed,
participant swapped). Browser, real API, the 7a seed (Alice friends with
Bob and Carol; all three in "Lalibela Trip"): as Alice, personal EQUAL
"Dinner" 1000 (Carol stored 333.34) renamed only → still Equal,
333.33/333.34/333.33 unchanged; group PERCENTAGE "Hotel" (Carol paid,
Alice admin) date-only edit → "Exact", 333.40/333.30/333.30, Carol
still payer; Hotel amount → 900 shows both warnings and saves Equal
300 × 3; Bob removed from Dinner → 500/500, Alice↔Bob balance 0,
clicking your own payer row does nothing; settlement and random-uuid
edit URLs show their empty states. As Bob (not admin, not payer),
editing Hotel → "Only the payer or a group admin can edit this
expense." inline, form kept, nothing stored; his participant list
includes Carol (group member, not his friend).

### Slice 8 — Groups (GRP-01…GRP-08) `[done]`

Four PRs: backend rules first, then the screens.

**8a — Group integrity rules (backend) `[done]`.** Branch:
`feature/groups-integrity-rules`. See ADR-009.

- [x] Leave/remove refused with `OUTSTANDING_BALANCE` while the
      member's group net isn't 0.
- [x] `DELETE /groups/{id}`: creator only, everyone settled, soft
      delete (`0011_group_soft_delete`); the group then reads as not
      found everywhere, its expenses are frozen, and its recurring
      templates are skipped.
- [x] Currency change refused with `CURRENCY_LOCKED` once the group
      has expenses.

**Verified:** `go vet` clean, full `go test ./...` passes against the
local DB with the new migration. New integration tests cover leave and
remove blocked, then allowed after a settlement; currency before vs.
after an expense; delete as non-creator, delete while unsettled, then
the group gone from lookups and lists with its expenses intact; an
invite to a deleted group disappearing; a deleted group's expense
frozen and dropped from the list; and the recurring due-list skipping
it.

**8b — Group detail + read-only tabs (GRP-03/04/05/08) `[done]`.**
Branch: `feature/group-detail-api-integration`. Frontend only.

- [x] `~/lib/group-view.tsx`: one loader for every `/groups/[id]`
      screen -- you, the group with members, and each person's net from
      `GET /balances/groups/{id}` -- plus the shared loading / "Group
      not found" (404/403/400) / error states. `getGroupBalances` and
      `getSimplifiedPayments` live in `~/lib/balances-api.ts`.
- [x] GRP-03 detail: real type, member count, description, your net
      (Settle Up only when you owe), the latest 5 expenses, balances
      for everyone (a member who left with a balance shows "(left)"),
      and real Admin/Member roles. The settings icon shows for admins
      only.
- [x] GRP-04 expenses: `GET /expenses?groupId=` with "Load more" (30
      per page), filters over what's loaded; your position per row is
      what others owe you (you paid) or your share. Settlements are
      labelled.
- [x] GRP-05/GRP-08: nets and apps/api's simplified plan
      (`/balances/groups/{id}/simplified`) -- no client-side
      recomputation. Shared `~/components/PaymentRow.tsx`; only your
      own payments link to /settle (ADR-003).
- [x] `groupTypeFor()` now returns a `tint` (color-mix), fixing the
      invalid `${color}22` background for CSS-variable colors (Trip) on
      Home, Groups, Balances and Search.

Deviations (Confirmed): no pairwise "full network" view (apps/api
exposes nets and the plan only); the "N instead of M payments" count
shows N only. /settle, GRP-06 members and GRP-07 settings still read
mock data (8d, slice 9).

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean.
Browser, real API, the slice 7 seed plus a Bob-paid Taxi 100 (A 33.34,
B 33.33, C 33.33) and a 150 settlement Bob→Carol. Hand check:
Carol +416.67, Bob −83.33, Alice −333.34, which sums to 0. As Bob:

- Detail shows −83.33 with Settle Up, those three balances, real
  roles, and no settings icon.
- Expenses: Taxi +66.67, Hotel −300, the settlement labelled; the
  "Your expenses" and category filters work.
- Balances/Simplified: Alice→Carol 333.34 and Bob→Carol 83.33,
  matching apps/api; only Bob's own payment links to /settle.
- A random uuid and `not-a-uuid` both show "Group not found".
- After Carol left (the pre-8a API still allowed it), she's listed
  "Carol Test (left) +416.67".

**8c — Create group + invites (GRP-01/02, DASH-05) `[done]`.** Branch:
`feature/group-create-invites-api-integration`. Frontend only.

- [x] GRP-02 lists your real friends (with balances, via
      `deriveFriendRows`) and "Create Group" / "Skip" call
      `POST /groups/` (`createGroup`) with the UPPERCASE type,
      currency and description. Picked friends are invited, not
      added, and the screen says so. Errors show inline and the button
      is disabled while the request runs (groups have no idempotency
      key). Opening the step without a draft goes back to GRP-01.
- [x] Groups (DASH-05) lists pending invites (`GET /groups/invites`)
      above the groups, with Join (`POST /groups/{id}/invite/accept`,
      then reload) and Decline (`DELETE /groups/{id}/members/{you}`,
      since apps/api has no decline route; it marks the invite LEFT).
- [x] GRP-01's name is capped at apps/api's 80 characters, and the
      selected type tile uses `tintOf` (8b's color-mix fix).

Deviations (Confirmed): no email/phone invites (apps/api invites
friends only).

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean.
Browser, real API:

- As Bob, GRP-01 "Bob Flat" (Household, description "Bole apartment")
  → GRP-02 inviting Alice → Create. Stored as HOUSEHOLD/ETB with the
  description; Bob ADMIN ACTIVE, Alice MEMBER INVITED.
- A second invite ("Bob Gym") was added via the API. As Alice, Groups
  showed "Group invites (2)":
  - Decline on Bob Gym → gone, and her membership is LEFT.
  - Join on Bob Flat → it appears under Settled with 2 members.
- Opening /groups/new/members directly → redirected to /groups/new.

**8d — Members + settings (GRP-06/07) `[done]`.** Branch:
`feature/group-members-settings-api-integration`. Frontend only, on 8a's
rules (ADR-009).

- [x] GRP-06: active members with their group balance and real roles,
      then pending invites. Admins get: invite a friend
      (`POST /groups/{id}/members`), Make/Remove admin
      (`PATCH .../members/{userId}`), Remove from group and Cancel
      invite (`DELETE .../members/{userId}`, confirmed inline).
      apps/api's refusals (`OUTSTANDING_BALANCE`, `LAST_ADMIN`) show
      above the list.
- [x] GRP-07: open to every member (Leave lives here) but editable by
      admins only. It saves name, description, type, currency and
      simplify debts with `PATCH /groups/{id}`, and sends the currency
      only when it changed. Currency is locked in the UI once the group
      has an expense (apps/api: `CURRENCY_LOCKED`).
- [x] Danger Zone: Leave (anyone) and Delete (creator only), both
      confirmed inline and then back to /groups. Up-front hints for
      "settle your X balance first" / "everyone must be settled"; the
      server's message shows if it refuses.
- [x] GRP-03's settings icon now shows for every member.

Deviations (Confirmed, user decision 2026-09-29): "Default split method"
and the notification toggles are hidden (no backend field). No
email/phone invites.

**Verified:** `pnpm typecheck`/`lint`/`format:check`/`build` clean.
Browser, real API, as Alice.

In Lalibela Trip (admin and creator; nets A −333.34, B −83.33,
C +416.67):

- Make admin on Bob → Bob shows Admin; Remove admin reverts it.
- Remove Bob → "This member has an unsettled balance…".
- Rename to "Lalibela 2026" → "Saved ✓" and the header updates.
- The currency is locked with its note.
- Leave → "Promote another member to admin…" (LAST_ADMIN is checked
  before balances).
- Delete → "Everyone must be settled up…".

In a new "Temp" group (no expenses):

- Cancel Carol's invite, then invite Bob from the panel.
- Currency → USD saved (stored as USD).
- Delete → /groups, Temp gone, and `GET` → 403.

In "Bob Flat" (Alice is a plain member): "Only admins can change these
settings.", the fields are disabled, there's no Save or Delete, and
Leave → /groups with Bob Flat gone.

### Slice 9 — Settle up (STL-01…STL-05) `[in progress]`

**9a — Group settlements by net (backend) `[done]`.** Branch:
`feature/group-settlements-by-net`. See ADR-010.

- [x] `settlements.Service.outstanding`: personal settlements stay
      pairwise. Inside a group the settler's net must be below 0 and the
      recipient's above 0, capped at `min(−settlerNet, recipientNet)`.
      New code `RECIPIENT_NOT_OWED`.

**Verified:** full `go test ./...` passes. A new integration test
(nets A −333, B −234, C +567) checks:

- the three refusals;
- A → C 333 accepted (pairwise would cap it at 300);
- only A's and C's nets move;
- B → C 234 then brings every net to 0.

The test fails against the old pairwise code.

**9b — Settle flow + history (frontend) `[todo]`.** User decision
(2026-09-29): drop the payment-method picker (the API stores no method).

### Later slices `[todo]`

Groups (`GRP-0x`), settlement
(`STL-0x`/`BAL-0x`), profile/settings preferences beyond auth
(`PRF-01`'s stats/currency/language, `SET-0x`) -- each replaces its own
slice of `~/lib/mock-data.ts`, reusing the `~/lib/*-api.ts` modules
slice 2 already built wherever they apply.

**Acceptance:** the "MVP Acceptance Criteria" checklist in
`ABRO_PRD.md` §54 passes end to end against a real database, not mocks.
