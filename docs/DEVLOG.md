# Dev Log

One dated entry per work session. Newest first. This is a record of
what happened and why — not a changelog of file diffs (git already has
that); read `git log` for the literal history.

---

## 2026-09-15 — Repo stood up, GitHub wired, UI foundation started

**Started from:** a shared ChatGPT conversation proposing a Splitwise-style
app for Ethiopia, plus a UI designer's export at
`~/Downloads/Design Ultra Modern UI (1)/` — which turned out to already
contain a full PRD (`abro-prd.md`) and a 42-screen frontend spec
(`abro-mvp-spec.md`) under a settled product name: **ABRO**.

**Decided:**

- Product is **ABRO**, not the earlier "FriendLedger" working title.
- Backend is **NestJS**, not Go and not Supabase-as-backend — see
  `DECISIONS.md` ADR-001/002/003 for the full reasoning.
- Settlements are `Expense` rows with `splitType: SETTLEMENT`, not a
  separate table — ADR-003.

**Built:** the `abro` monorepo scaffold — `apps/web` (Next.js),
`apps/api` (NestJS + Prisma, schema translated from PRD §29),
`packages/types` (shared `Money`/`SplitType`, integer-minor-units
throughout, no floats), `packages/config`, `packages/ui` (placeholder).
Husky + lint-staged + commitlint wired and verified with a real commit.
Local Postgres via `infra/docker/dev/compose.yml`. Verified `pnpm lint`,
`pnpm typecheck`, and `pnpm build` all pass for both apps before
anything got pushed anywhere.

**GitHub:** connected `github.com/Substance-k3n/abro` (renamed from an
earlier `FriendLedger`, which already had a Copilot-authored PRD draft
on its `main` — read from `~/Documents/Projects/Custom/abro`'s own
`FriendLedger PRD` artifact from earlier in the session). That old
content wasn't discarded: it's preserved at
`archive/friendledger-readme-draft`; our scaffold became the new `main`
via a proper merge (`--allow-unrelated-histories`), not a force-push
over it. A dedicated SSH key (`id_ed25519_personal`, comment
`substance-k3n-github`, aliased as `github-personal` in
`~/.ssh/config`) was set up so this personal account's key doesn't
carry a work email. Commit `Co-Authored-By: Claude`/`Claude-Session`
trailers were rewritten out of the one commit that had them — this
repo's commits are Kidus Ezra's alone going forward, no attribution
trailers added by default.

**Started (this branch, `feature/ui-foundation`):** wiring the actual
UI. The Figma Make export at `~/Downloads/Design Ultra Modern UI (1)/`
is a single 6,500-line `App.tsx` implementing ~25 screens as one
client-state machine, wrapped in a fake phone-bezel/status-bar (Figma
Make preview chrome — not real product UI, not ported). Its design
system (neomorphic light/dark tokens, Outfit/DM Sans/JetBrains Mono
type system) is real and worth keeping faithfully. See
`docs/WIRING_PLAN.md` for the phased approach to porting it properly
into `apps/web` + `packages/ui` instead of copying the file wholesale.
