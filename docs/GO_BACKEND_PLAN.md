# Go Backend Rewrite Plan

Tracks the rewrite of `apps/api` from NestJS/Prisma to Go, per
`docs/DECISIONS.md` ADR-007. Mirrors the module order the original
NestJS backend was built in (`docs/BACKEND_PLAN.md`'s history), since
that order already reflects real dependencies (auth before everything;
expenses before balances; balances before settlements/analytics).

Each module: schema/migration → domain logic → handler → tests, run
against a real Postgres/MinIO (no mocking), matching the convention the
NestJS backend established. Branch: `feature/go-backend-rewrite` off
`dev`, merged to `dev` when complete — not `main`, which stays reserved
for a final production-readiness merge per the user's explicit direction.

## 0. Foundations `[done]`

- [x] Go toolchain + `sqlc`/`golang-migrate` CLIs installed locally.
- [x] `apps/api-go` module scaffolded (`go.mod` as
      `github.com/Substance-k3n/abro/apps/api` — final import path,
      even though the directory is temporarily `api-go` until the
      NestJS implementation is removed and this is renamed to `apps/api`).
- [x] `internal/money`: port of `packages/types/src/{money,split,debt-simplification}.ts`
      — `MinorUnits` as `int64` (not a bigint shim), `SplitEqually`/
      `SplitByWeights`/`AssertSharesMatchTotal`/`SimplifyDebts`/
      `ParseAmount`. 32 test cases ported 1:1 from the TS suite, all
      passing.
- [x] SQL schema + `golang-migrate` migrations translated from
      `apps/api/prisma/schema/*.prisma`. Verified: `migrate ... up`
      applies all 9 cleanly against a real dev Postgres.
- [x] `sqlc` config + generated typed queries wired to a real dev
      Postgres.
- [x] `internal/httpx`: session-auth middleware, JSON error-response
      helper (mirrors `common/filters/http-exception.filter.ts`),
      request-scoped user context (mirrors `@CurrentUser()`).
- [x] `cmd/api/main.go`: router wiring, graceful shutdown, config from
      env.

**Dev DB note:** the shared dev Postgres container (`abro-db`, port 5460) already holds the NestJS backend's Prisma-managed `abro`
database. Rather than collide with it mid-rewrite, this work uses a
separate database, `abro_go`, on the same Postgres instance
(`CREATE DATABASE abro_go;`) — `DATABASE_URL` for all Go dev/test work
points at `abro_go`, not `abro`. Revisit at cutover (§11): once the
NestJS implementation and its Prisma tables are actually removed, the
Go backend can either take over the `abro` database name or `abro_go`
can just be renamed — a decision for that step, not now.

## 1. Auth `[done]`

DB-backed sessions, Email OTP, Google OAuth — same mechanism as
ADR-004, re-implemented without Prisma. `Session`/`OtpCode`/
`OAuthAccount` tables port directly from `auth.prisma`. 16 integration
test cases + 11 unit test cases, all passing against real Postgres.

## 2. Users `[done]`

`GET/PATCH /users/me`. 3 integration test cases passing.

## 3. Friends `[done]`

Friend search, requests, accept, unfriend. 7 integration test cases
passing against real Postgres.

## 4. Groups `[done]`

Create/list/detail/update, members, invites. 13 integration test cases
(including all 4 notification-emission tests) passing against real
Postgres.

## 5. Expenses `[done]`

Create/list/detail/update/soft-delete, notes, receipt upload/read/delete
(MinIO via `minio-go/v7`), idempotency keys on the create POST. Also
shipped `internal/idempotency` (reserve-then-fill, same as the NestJS
version but replaying raw JSON bytes instead of a BigInt-aware
JSON-plain shim — Go's `int64` needs no such shim) and
`internal/storage` (MinIO receipt storage) as dependencies.

17 expenses integration test cases (personal + group expenses,
notifications, receipts against real MinIO) + 6 idempotency + 4 receipt
storage test cases, all passing against real Postgres/MinIO.

## 6. Balances `[done]`

Pairwise + group summary + simplified group debts
(`internal/money.SimplifyDebts`). Added `internal/money.NetBalance`
(port of `packages/types/src/balances.ts`) alongside. 7 integration
test cases (personal, group, conservation invariant, chain
simplification) passing against real Postgres.

## 7. Settlements `[todo]`

`POST /settlements` — the only path allowed to write `SplitType.SETTLEMENT`.

## 8. Analytics `[todo]`

Monthly/yearly spending insights.

## 9. Notifications `[todo]`

List, mark-read, mark-all-read; retrofit into expenses/settlements/groups.

## 10. Recurring expenses `[todo]`

Create/list/toggle, `POST /recurring/generate-due`.

## 11. Cutover `[todo]`

- [ ] Remove NestJS `apps/api` (Prisma schema, Jest tests, NestJS
      deps) — fully recoverable from git history, already merged to
      `dev` before this rewrite.
- [ ] Rename `apps/api-go` → `apps/api`.
- [ ] Update `.github/workflows/ci.yml`: Go build/vet/test job against
      real Postgres/MinIO services, replacing the Node/Jest job for
      `apps/api`.
- [ ] Update `infra/docker/dev/compose.yml` if any Go-specific dev
      dependency is needed (unlikely — same Postgres/MinIO services).
- [ ] Update `pnpm-workspace.yaml`/root `package.json` scripts that
      currently assume `apps/api` is a pnpm workspace member.
- [ ] Update root `README.md` / any doc referencing NestJS/Prisma for
      the backend.

**Acceptance:** every endpoint the NestJS backend had is re-implemented
with equivalent behavior and test coverage; `go build`/`go vet`/
`go test ./...` all pass; CI green on the Go job; merged to `dev`.
