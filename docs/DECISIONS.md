# Architecture Decision Log

Short-form ADRs. Newest first. Each entry says what changed and why —
not a full essay, just enough for the next person (or session) to
understand why the repo looks the way it does instead of following
`ABRO_PRD.md` literally.

---

## ADR-021: Phone notifications are Web Push of the in-app ones

**Status:** Accepted (user request, 2026-10-08).

**Context:** People only learned about a new expense, a payment to
confirm or a friend request by opening ABRO. ABRO_PRD.md lists web push
as Phase 2; the trial made it the next thing people wanted.

**Decision (chosen with the user):** Standard **Web Push** with VAPID
keys, sent by the API itself (`internal/push`, `webpush-go`) -- no
Firebase project or other paid service. Every notification the API
stores is also pushed to the recipient's devices, after the row is
written, in the background; a failed push never fails the action and the
notification is still in the app. **Which types arrive is the same list
as in-app** (the Settings switches); push is one extra on/off switch per
device, not a second switch per type. Permission is only asked after a
tap -- the switch in Settings -> Notifications, or a one-time, dismissible
card on Home -- never as an automatic popup. Tapping a push marks it read
and opens its `link` (or the notifications list).

Devices live in `push_subscriptions` (already in migration 0007, unused
until now). An endpoint belongs to one browser profile: subscribing it
again moves it to whoever is signed in, and signing out switches push off
on that device first, so the next person never gets someone else's
notifications. Endpoints the push service reports gone (404/410) are
deleted. The API only accepts endpoints on the browsers' push services
(FCM, Mozilla, Apple, Windows), so it can't be told to post elsewhere.

**Alternatives considered:** a separate push switch per type (more
control, a busier screen); asking for permission right after sign-in
(more reach, but many people tap Block and browsers penalise it);
Telegram bot messages (popular here, but needs everyone to link a
Telegram account; still possible later); Firebase Cloud Messaging SDK
(a Google project and SDK for what the browser already does).

**Consequences:**

- iPhone only gets push in the installed app (iOS 16.4+); Safari itself
  can't. The switch says so and points to Install.
- The service worker only runs in production builds, so push can't be
  tried under `pnpm dev`; use `pnpm build && pnpm start`.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` must stay the same for the
  life of an environment: new keys silently orphan every device until
  people switch it on again. Without them the API answers 501 on
  `/push/public-key` and the app hides the switch.
- Group-wide notifications (`NotifyMany`) carry no link, so their push
  opens the notifications list.

---

## ADR-020: Expense disputes flag a share; only the payer changes it

**Status:** Accepted (phone-trial feedback, 2026-10-07).

**Context:** Someone can be added to an expense they weren't part of
(X adds Y and Z to a dinner Z skipped), and Z then owes money with no
way to object inside the app.

**Decision (chosen with the user):** Z taps **"I wasn't part of this"**
on the expense. That sets `expense_participants.disputed_at` on Z's share
(migration 0017), shows a "Disputed" badge and banner to everyone on it,
and notifies the payer with a link to the expense. **Nothing about the
amounts changes:** the expense counts exactly as entered until the payer
(or a group admin, the same people who may edit it) either **edits** it
-- editing rewrites the participant rows, which clears every dispute -- or
taps **Keep as is**, which clears it and tells Z. Z can take it back.
Settlements can't be disputed; they're confirmed or rejected instead
(ADR-019).

The same migration adds `notifications.link`, so a notification can open
the exact thing it's about (`/expenses/<id>`); older ones fall back to a
screen per type.

**Alternatives considered:** Z removes themselves and the rest is
re-split automatically (changes other people's amounts without the
payer agreeing, and turns an unequal split into an equal one); every
expense needs everyone's approval before it counts (safest, but a tap
from every person on every expense).

**Consequences:**

- Balances stay a pure function of expenses: a dispute is information,
  not a ledger change.
- A payer who ignores a dispute leaves it showing; the badge and banner
  keep it visible to everyone on the expense.

---

## ADR-019: Payments are confirmed by the person paid

**Status:** Accepted (phone-trial feedback, 2026-10-07).

**Context:** Until now, when the person who owed recorded "I paid X", it
settled the debt immediately (ADR-003). Trial users found that too
trusting: the person paid should be the one to agree it happened, see
proof if there is any, and be able to say "I didn't get this".

**Decision:**

- **The payer records it → a request.** `POST /settlements` now creates
  a row in the new `settlement_requests` table (migration 0016) with
  status `PENDING`. A request is a _claim_, not a fact: no balance query
  reads this table, so it moves nothing. It's capped by what the payer
  owes **minus what they already have pending** with that person.
- **The person paid confirms or rejects.** Confirming re-checks the live
  debt, then writes the `SETTLEMENT` expense exactly as ADR-003 always
  has, and links it to the request. Only then do balances change. A
  part-payment takes off only what was paid. Rejecting changes nothing
  and tells the payer.
- **The payer can cancel** while it's pending, and attach a **proof
  photo** (same rules as expense receipts) that the other person sees
  before confirming; on confirm it carries over to the settlement.
- **The person paid can record it themselves** (`POST
/settlements/received`, "They paid me"). That counts at once: they're
  the one who'd lose out if it were wrong.
- Confirming **claims the request first** with one atomic `UPDATE …
WHERE status = 'PENDING'`, then writes the settlement, so two taps (or
  two devices) can never settle twice. If writing fails, the request
  goes back to pending.
- Existing settlements are untouched: they're already expenses.

**Alternatives considered:** a `status` column on `expenses` for
SETTLEMENT rows (every balance, analytics and group-integrity query
would need a new filter, and missing one would silently count unconfirmed
money); confirming by editing the expense in place (same problem).

**Consequences:**

- ADR-003 still holds: a settlement is still an expense, and still the
  only thing that moves a balance.
- Debts stay on the books until the other person confirms, so someone
  who never opens the app delays settling. They get a notification and
  a Home banner; the payer can see it's waiting on Payments.
- `POST /settlements` returns a request, not an expense, so the web app
  ships with this change in the same deploy.

---

## ADR-018: Payment reminders — admin-only, owes-only, once per 24 hours

**Status:** Accepted (roadmap Phase 6, 2026-10-07).

**Context:** The group admin dashboard (P6) should let an admin nudge
members who owe the group. PRD §34's notification list has no reminder
event, and the frontend spec only lists "Payment reminder (future)".
Without a limit, a reminder button becomes a way to spam someone.

**Decision:** `POST /groups/{id}/members/{userId}/remind` sends an
in-app notification of the new type `PAYMENT_REMINDER` ("Ana reminded
you that you owe 1234.50 ETB in \"Trip\"."). Rules:

- Only an **active admin** can send one, and only to an **active**
  member whose net in the group is **negative** (they owe). Never to
  yourself.
- **One reminder per member per group every 24 hours**, whoever sends
  it. Too soon → `429 REMINDER_TOO_SOON` with `details.nextAllowedAt`.
- Each reminder is a row in the new `payment_reminders` table (group,
  sender, recipient, created_at; migration 0014). That's the audit
  trail and what the 24-hour check reads. **No amount is stored**: the
  amount in the message is the member's net at that moment, derived
  from expenses like every other balance.
- `PAYMENT_REMINDER` can be turned off in notification settings. The
  admin gets the same success either way, and the reminder still
  counts toward the 24 hours, so a reminder never reveals that setting.
- `GET /groups/{id}/reminders` (admins) lists the latest reminder per
  member, so the dashboard can show "Reminded 3h ago" after a reload.

**Alternatives considered:** checking the notifications table for a
recent reminder instead of a new table (a notification doesn't record
its group or sender, and isn't written at all for someone who opted
out, which would let the limit be bypassed); letting any member remind
(the dashboard is an admin tool, and members can already see who owes);
a lock to make the limit exact under concurrent taps (two admins
reminding at the same instant can both get through — the cost is one
extra notification, not worth a lock).

**Consequences:**

- Reminders are in-app only, like every notification (no push or email
  yet, PRD "Later").
- The table grows by at most one row per member per group per day.

---

## ADR-017: Profile and group photos, served through the API at versioned URLs

**Status:** Accepted (roadmap Phase 4, 2026-10-06).

**Context:** People wanted a profile photo (at sign-up and in their
profile) and group photos. Photos show next to names all over the app,
so they must load fast and cache well, but the storage bucket is private
(receipts, PRD §36) and the free-tier deploy has no CDN.

**Decision:** Store photos in the existing private bucket under
`avatars/<user>/` and `group-photos/<group>/`, with a random file name
per upload, and serve them **through the API**:
`GET /users/{id}/avatar/{version}` and `GET /groups/{id}/photo/{version}`,
where the version is that file name. A new photo means a new URL, so
responses carry `Cache-Control: private, max-age=31536000, immutable`.
Any signed-in user may load a profile photo; a group photo needs active
membership. Uploads (`POST /users/me/avatar`, `POST /groups/{id}/photo`,
admins only) are typed by their bytes (JPG/PNG/WebP, as in #60) and
capped at 2 MB; the app shrinks photos before uploading. The profile's
displayed photo stays in `profiles.avatar_url` (the versioned path, or a
Google picture URL), and the stored key goes in the new
`profiles.avatar_path` / `groups.photo_path` (migration 0013). Code:
`internal/photos`, added onto the `/users` and `/groups` routers.

**Alternatives considered:** presigned bucket URLs in every response
(they expire after minutes and change on every request, so browsers
could never cache a photo); a public bucket (every photo world-readable
by URL); a new column per response shape (`avatar_url` already flows
through every profile embedded in friends, members and participants).

**Consequences:**

- Photos appear everywhere a profile is embedded with no other API
  change, and each one downloads once per device.
- Photo bytes pass through the API server. They're small (resized
  client-side), but a CDN in front of the API would help at scale.
- Replacing or removing a photo deletes the old object, and its old URL
  stops working (404).

---

## ADR-016: Light theme by default, with a Light / Dark / Match-phone switch

**Status:** Accepted (user decision, 2026-10-06).

**Context:** The app followed the phone's theme, so on a dark phone people
saw dark mode first, and its secondary text (`--t-dim`, about 2.6:1) was
hard to read. Several component overrides only matched an explicit
`data-theme="dark"` stamp that nothing ever set, so on a dark phone some
buttons and badges kept their light styling. The user likes the soft 3D
(neo-morphic) look and asked to keep it; the complaint was the dark
default and the contrast.

**Decision:** Keep the neo-morphic style. Light is the default whatever
the phone's setting: a near-white background with a faint lavender tint,
so the brand purple belongs to the page. Dark mode keeps its look with
brighter text tokens (`--t-dim` about 4.6:1) and a stronger card
highlight. People choose Light, Dark or Match phone in Settings ->
Appearance (a per-device choice in localStorage). An inline script in the
root layout's `<head>` (`THEME_SCRIPT`, `lib/theme.ts`) always stamps
`data-theme` before the first paint, so there's no flash and the dark
component overrides now always apply.

**Alternatives considered:** a flat "bank app" redesign (rejected by the
user); keeping "follow the phone" as the default (the original problem).

**Consequences:**

- Everyone sees the same light look first; dark is one tap away.
- The choice is per device, not per account (no API change needed).
- The offline page (`public/offline.html`) reads the same choice.

---

## ADR-015: The app is an installable web app (PWA), not a store app

**Status:** Accepted (user decision, 2026-10-06).

**Context:** ABRO should be usable as a phone app. The web app already
had a manifest and install icons (#52) but no service worker, so Chrome
on Android wouldn't offer a proper install, and the installed app opened
on the marketing splash.

**Decision:** Finish it as a Progressive Web App. A hand-written
`apps/web/public/sw.js` caches only Next's content-hashed build files and
the icons (cache-first), sends every page navigation to the network
first with a cached, self-contained `offline.html` as the fallback, and leaves the API
(`/api/*`) and other origins alone, so balances are never cached. The
manifest opens on `/home` and adds an "Add expense" shortcut. An
"Install ABRO" button (Home banner, Settings → App) uses Chrome's install
prompt, or shows Safari's "Add to Home Screen" steps on iPhone.

**Alternatives considered:** Play Store listing via a Trusted Web
Activity (needs a $25 Google Play account and review; can be added later
on top of this PWA); a React Native rewrite (two codebases, App Store
also needs $99/year and a Mac); `next-pwa`/Serwist (a build plugin and
dependency for what is about 80 lines of worker code).

**Consequences:**

- Free, no store account, works on Android and iPhone, and updates ship
  with every web deploy.
- Not listed in app stores; people install from the site.
- No offline use beyond the "you're offline" page: every screen needs
  the API, by design.
- `sw.js` is served with `Cache-Control: no-cache` (next.config.mjs) so a
  fixed worker reaches installed apps on their next open. Bump `VERSION`
  in it to drop old caches.

---

## ADR-014: Self-hosted fonts via next/font/local

**Status:** Accepted (2026-10-06).

**Context:** `next/font/google` downloads Outfit, DM Sans and JetBrains
Mono from Google during every web build (CI, the Docker image build and
Vercel). Google sometimes returns a response the loader can't parse
(`TypeError: Cannot read properties of null (reading '1')`), which
failed the `images` CI job until it was rerun.

**Decision:** Commit each font's variable-weight latin woff2 to
`apps/web/src/app/fonts/` (with its OFL licence) and load it with
`next/font/local` in `layout.tsx`. The CSS variables (`--font-display`,
`--font-body`, `--font-mono`) and weight ranges are unchanged.

**Alternatives considered:** Retrying the build in CI (hides the flake
but keeps the network dependency, and Vercel builds can still fail);
`@fontsource` packages imported as CSS (no build fetch, but loses
next/font's preload and fallback-metric adjustment).

**Consequences:**

- Builds no longer need to reach Google, so the font flake is gone.
- About 100 KB of font files are committed. Upgrading a font means
  replacing its file by hand.
- Only the latin subset is shipped, the same as before
  (`subsets: ['latin']`).

---

## ADR-013: OTP email without a domain — Brevo, alongside Resend

**Status:** Accepted (user decision, 2026-10-05).

**Context:** On the free-tier deploy (ADR-012) OTP codes were only
written to the API log, so nobody but the owner could sign in by email.
Resend (ADR-004) needs a verified domain to email anyone but the account
owner, and there's no domain yet. Sending through Gmail over SMTP isn't
possible either: Render's free plan blocks outbound ports 25/465/587.

**Decision:** Add `BrevoOTPMailer` (`apps/api/internal/auth/otp_mailer.go`),
one JSON POST to Brevo's transactional API (HTTPS, so not blocked). Brevo
lets a single verified sender address (e.g. a Gmail address) send to any
recipient on its free plan (300 emails/day). Selection in
`cmd/api/main.go`: Resend if configured, else Brevo, else the console
mailer. The startup log names the mailer in use.

**Alternatives considered:** Gmail SMTP with an app password (blocked on
Render free); SendGrid/Mailjet (similar idea, but Brevo's free plan and
single-sender verification were the simplest fit); buying a domain for
Resend (the right long-term fix, blocked on payment for now).

**Consequences:**

- Anyone can sign in by email on the free tier.
- Mail "from" a Gmail address sent through a third party can land in
  spam. A verified domain (Resend or Brevo) removes that.
- One more env-configured provider. Resend stays first, so adding a
  domain later only needs `RESEND_*` set.

---

## ADR-012: Free-tier deployment — Vercel (web) + Render (api) + Neon (Postgres)

**Status:** Accepted (user decision, 2026-10-05). An alternative to
ADR-011, not a replacement. ADR-011's VPS stack stays the target once a
server and domain are available.

**Context:** ADR-011's VPS deploy is blocked: the card payment for a VPS
didn't go through, and there's no domain yet. The user wants ABRO
online now at no cost. Vercel only runs the Next.js app, so the Go API
and Postgres need other homes. The session cookie is `SameSite=Lax`
with no `Domain`, and `*.vercel.app` / `*.onrender.com` are different
sites (both on the Public Suffix List), so a browser on the web app
would not send the cookie on credentialed cross-site fetches to the API.

**Decision:**

- **Web on Vercel** (`apps/web/vercel.json`, root dir `apps/web`,
  built through turbo). **API on Render's free plan** from the existing
  `apps/api/Dockerfile` (`render.yaml`). **Postgres on Neon's free plan.**
- **Same-origin proxy:** with `API_PROXY_TARGET` set, `next.config.mjs`
  rewrites `/api/*` to the API. `NEXT_PUBLIC_API_URL=/api`, so every
  call, `Set-Cookie` and OAuth redirect happens on the Vercel origin. The
  API code and cookie policy are unchanged. Google's callback URL is the
  proxied `https://<project>.vercel.app/api/auth/google/callback`.
- **Migrations at container start:** Render's free plan has no
  pre-deploy step, so `apps/api/start.sh` runs the image's own
  `migrate up` when `RUN_MIGRATIONS=true`, then execs the API. This keeps
  ADR-011's "schema comes from the same image" rule. The compose stack
  leaves the flag unset and keeps its `migrate` service.
- **No S3 for now.** The API already runs without it (receipt endpoints
  report "not configured"), and there's no receipt UI (shipped later, on
  2026-10-06; it shows a "not available" note until S3 is set). This avoids adding
  a storage vendor (e.g. Supabase Storage, which ADR-001 steered away
  from) before it's needed.

**Alternatives considered:**

- _`SameSite=None` cookie + cross-site CORS_: works today, but third-party
  cookies are increasingly blocked (Safari ITP, Chrome settings), and
  it weakens the CSRF posture for every deploy, not just this one.
- _Fly.io / Railway / Koyeb for the API_: these need a card or have
  time-limited trials.
- _Self-host at home behind a tunnel_: depends on a machine staying on.

**Consequences:**

- Three dashboards instead of one server. Every piece is replaceable,
  since the API is still the same Docker image and the DB is plain Postgres.
- Render free cold starts (~30-60 s after ~15 min idle), and Neon free
  storage and compute caps. There's no automated off-site backup.
- Each request takes an extra hop (browser → Vercel → Render).
- OTP email to arbitrary users still needs a domain verified with Resend.
  Until then, Google sign-in is the way for others to log in.

---

## ADR-011: Production deployment — one VPS running Docker Compose

**Status:** Accepted (user decision, 2026-09-30). Artifacts built; the
first real deploy is still pending (it needs the server and the domain
name).

**Context:** With Phase 8 done, every screen runs on apps/api, but
nothing could be deployed: no production images, no production config,
no runbook. The stack is a Go API plus its migrations, a Next.js app,
Postgres, an S3-compatible bucket (ADR-008), and Resend for OTP email
(ADR-004). The session is an `HttpOnly` cookie set by the API with
`SameSite=Lax`, and the web app calls the API cross-origin with
credentials.

**Decision:** Run everything on one VPS with Docker Compose
(`infra/docker/prod/`):

- **Caddy** terminates TLS (automatic Let's Encrypt) and routes
  `APP_DOMAIN` to web and `API_DOMAIN` to the API. Web and API are
  sibling subdomains of one domain (e.g. `app.` and `api.`), so they're
  the same _site_: the Lax cookie is sent on the web app's fetches, and
  CORS stays locked to `WEB_ORIGIN`.
- **The API image** (`apps/api/Dockerfile`) contains the server, the
  golang-migrate CLI and the migrations. A one-shot `migrate` service
  runs `migrate up` from that same image before the API starts, so the
  schema always matches the code.
- **The web image** (`apps/web/Dockerfile`) is Next.js `standalone`
  output. `NEXT_PUBLIC_API_URL` is inlined at build time, so the image
  is built for one API origin.
- **Postgres 17 and RustFS** stay on the private network with no
  published ports.
- **A backup service** writes a daily `pg_dump` to `./backups`, keeping
  14 days. Copying those off the server is part of the runbook.
- **Images** can be built on the server (`docker compose up --build`)
  or pulled prebuilt (`WEB_IMAGE`/`API_IMAGE`). CI builds both images
  on every PR, so a broken Dockerfile fails early.

**Alternatives considered:** managed platforms (Fly.io/Railway/Render +
managed Postgres + R2). Less server upkeep, but more vendors and a
higher monthly cost, and it moves away from ADR-001's "runs anywhere
Postgres runs". Kept as the fallback if server upkeep becomes a burden,
since the images work there too.

**Consequences:**

- One server is a single point of failure, and you apply OS updates
  yourself. Backups are the recovery path, and restoring one is
  documented in docs/DEPLOY.md.
- Two known gaps, now tied to this deployment:
  - Receipt downloads use presigned URLs pointing at the internal
    `http://s3:9000`. There's no receipt UI yet (added 2026-10-06), but when there is, S3
    needs a public hostname via Caddy.
  - Recurring expenses still have no scheduler (ADR-005). A cron on the
    server can call the generate endpoint once that endpoint is
    protected.
- `next/font/google` fetches fonts during the web build, so a build
  needs internet access (the CI font flake can also hit it). Resolved
  by ADR-014: fonts are now self-hosted.

---

## ADR-010: Group settlements are validated against group nets

**Status:** Accepted (user decision, 2026-09-29)

**Context:** `POST /settlements` capped a group settlement at the
_pairwise_ debt, meaning what the settler owes the recipient through
their shared expenses in that group. Every group screen shows _nets_
instead (paid − owed per member, `GET /balances/groups/{id}`), and the
simplified plan (`/simplified`, ABRO_PRD.md §18) routes payments
between nets. So a plan payment could exceed the pair's shared debt and
be refused.

Example: C pays 900 for A, B and C, and B pays 99 for all three. The
nets are A −333, B −234, C +567. The plan says A → C 333, but A's
pairwise debt to C is only 300, and pairwise also let A pay B, whom the
group view shows as owing.

**Decision:** Inside a group, a settlement is allowed when the settler's
net is below 0 (`NO_OUTSTANDING_DEBT` otherwise) and the recipient's is
above 0 (`RECIPIENT_NOT_OWED` otherwise). The amount is capped at
`min(−settlerNet, recipientNet)` (`EXCEEDS_OUTSTANDING_DEBT`).
Personal settlements keep the pairwise check.

**Alternatives considered:** keep pairwise and make the simplified view
informational only. Rejected: the app would show two different answers
to "who do I owe in this group", and the plan couldn't be acted on.

**Consequences:**

- Every simplified-plan payment is payable. A settlement moves only the
  settler's and recipient's nets, each toward 0.
- The pair's pairwise balance inside the group can go "backwards"
  (e.g. C now owes A 33 pairwise). Nothing displays pairwise group
  balances, and friend balances count personal expenses only
  (`GetSummary`), so no screen changes.
- Settlements stay plain expense rows (ADR-003); only the validation
  changed.

---

## ADR-009: Group integrity rules — settled-only leave/remove/delete, soft-deleted groups, locked currency

**Status:** Accepted (user decisions, 2026-09-29)

**Context:** Wiring the group screens (Phase 8 slice 8) showed three
gaps in apps/api's group rules:

- A member could leave, or be removed, while owing or being owed money.
  Balances stay correct because they're calculated from expenses, but a
  departed member can no longer open the group, so they can't see or
  settle that debt.
- There was no way to delete a group. GRP-07 asks for one (creator
  only, not while balances are outstanding).
- `PATCH /groups/{id}` accepted a currency change after expenses
  existed. Amounts are stored as bare minor units, so 1000 ETB would
  silently become 1000 USD.

**Decision:**

- **Leave/remove** (`DELETE /groups/{id}/members/{userId}`) is refused
  with `409 OUTSTANDING_BALANCE` while the target's net in the group
  (paid − owed over non-deleted expenses, settlements included, the
  same figure as `GET /balances/groups/{id}`) isn't 0.
- **Delete** (`DELETE /groups/{id}`) is a soft delete: migration
  `0011_group_soft_delete` adds `groups.deleted_at`/`deleted_by_id`,
  the same shape as expenses. It's allowed for the creator only (who
  must still be an active member), and only when every member's net is 0.
  The group's expenses stay in place as facts. From then on the group
  reads as not found everywhere:
  - `GetGroupByID` and `GetGroupMember` filter on `deleted_at IS NULL`,
    so every membership check in groups, expenses, balances, settlements
    and recurring inherits it.
  - The group, invite, expense, recurring and analytics list queries
    filter deleted groups out.
  - An expense in a deleted group can't be edited or deleted
    (`GROUP_NOT_FOUND`), because that would reopen a balance nobody can
    see.
  - Recurring templates in a deleted group are skipped by
    `ListDueRecurringExpenses`. Otherwise `GenerateDue`, which stops at
    its first error, would stall every user's recurring expenses.
- **Currency** changes are refused with `409 CURRENCY_LOCKED` once the
  group has any non-deleted expense. Resending the current currency is
  fine.

**Alternatives considered:** allowing leave with a UI warning only
(rejected: it strands the debt from the debtor's view); a hard delete
of the group (rejected: it destroys expense history, against
"expenses are facts"); converting the currency on change (rejected:
needs exchange rates ABRO doesn't have).

**Consequences:** A group can only be deleted, or left, after settling
up, which is the Settle flow's job (slice 9). A soft-deleted group has
no restore path yet. A personal-expense participant can still open a
deleted group's expense by direct link (read-only), since visibility
for payers and participants doesn't depend on the group.

---

## ADR-008: Receipt storage server — RustFS, superseding ADR-006's MinIO choice

**Status:** Accepted

**Context:** MinIO stopped being distributable as open source in
practice: its Docker Hub images were removed earlier (already worked
around by moving to `quay.io/minio/*`), and by September 2026 both
`quay.io/minio/minio` and `quay.io/minio/mc` require authentication
(HTTP 401) while the `minio/minio` GitHub repo is archived (last
release October 2025). Every CI run's `api` job failed at "Start
MinIO" before running any code, and a fresh clone couldn't
`docker compose up` either — only machines with the image already
cached still worked.

**Decision:** Replace the MinIO _server_ with **RustFS**
(`rustfs/rustfs`, Apache-2.0, pinned to `1.0.0`) in
`infra/docker/dev/compose.yml` and CI. Everything else in ADR-006
stands: upload-through-API, presigned reads, one receipt per expense.

- apps/api keeps `minio-go/v7` — despite the name it's a generic S3
  client, and switching server needed zero Go code changes.
- Bucket provisioning uses the AWS CLI (`amazon/aws-cli` in compose,
  the runner's preinstalled `aws` in CI), since `mc` is gone too.
- Same ports (9460 API / 9461 console) and same default credentials
  (`abro-minio` / `password123`), so existing `apps/api/.env` files
  keep working; the key name is now just a legacy label.
- RustFS runs as UID/GID 10001: compose chowns its named volume with a
  one-shot helper (as RustFS's own example compose does); CI uses a
  tmpfs owned by that UID.

**Alternatives considered:** SeaweedFS (mature, but more setup — S3
config file, different startup model — and far more system than ABRO
needs); Garage (lightweight, but cluster layout and key creation are
imperative CLI steps, awkward in compose/CI); mirroring the last
cached MinIO image into our own registry (zero change, but frozen on
an archived, unmaintained version).

**Consequences:** RustFS is a young project (1.0.0 released September 2026) — acceptable for a dev/CI dependency, re-evaluate before
self-hosting it in production (a managed S3/R2/B2 bucket stays a
config-only change either way). Local dev: the compose service is now
`s3` (container `abro-s3`) with a new `s3-data` volume — run
`docker compose -f infra/docker/dev/compose.yml up -d --remove-orphans`
once to drop the old `minio` containers. Receipts stored in the old
local MinIO volume aren't migrated (dev data only).

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

**Status:** Accepted — storage _server_ choice (MinIO) superseded by
ADR-008 (RustFS); the upload/read design below still stands.

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
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL`. Every
authenticated route depends on the session guard reading this table —
until the `auth` module ships, no other module's endpoints can be
wired to real authorization.

**OTP provider follow-up (resolved 2026-09-21):** Resend, via a plain
HTTP POST (`internal/auth.ResendOTPMailer`, no SDK). Selected over SMTP
(would need a relay/account already in hand) and SES (needs a verified
AWS sending domain — more setup) for being the lowest-friction to get
working in dev. Gated the same way as Google OAuth and MinIO —
`RESEND_API_KEY`/`RESEND_FROM_EMAIL` unset means
`internal/auth.ConsoleOTPMailer` stays in use (logs the code instead of
emailing it), so dev/CI never needs a real Resend account.

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
