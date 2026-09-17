# expenses

Expense CRUD, participants, split validation (`sum(shares) == total`). `docs/ABRO_PRD.md` §13, §14, §45.

`ExpensesService`: `create`/`update`/`softDelete` (soft-delete only, never a
hard delete, per the schema's `deletedAt`), `findById`/`list` (personal,
group, or friend-scoped), `addNote`/`listNotes`. Split computation
(`EQUAL`/`EXACT`/`PERCENTAGE`/`SHARES`) reuses `@abro/types`'
`splitEqually`/`splitByWeights`/`assertSharesMatchTotal` — the same
functions `apps/web` will use client-side, per `docs/DECISIONS.md`
ADR-002. Emits `EXPENSE_ADDED`/`EDITED`/`DELETED` notifications (PRD §34)
to everyone involved except the actor.

## Receipts (PRD §36)

`uploadReceipt`/`getReceiptUrl`/`deleteReceipt`, backed by
`ReceiptStorageService` (`apps/api/src/common/storage/`) — MinIO/S3, see
`docs/DECISIONS.md` ADR-006 for the storage design and its rationale.

- `POST /expenses/:id/receipt` (multipart, field `file`) — JPG/PNG/WebP
  only, 10MB cap, payer/group-admin only. Replaces any existing receipt;
  the old object is deleted only after the new one uploads successfully.
- `GET /expenses/:id/receipt` — a short-lived (5 min) presigned URL, for
  anyone who can already view the expense.
- `DELETE /expenses/:id/receipt` — payer/group-admin only.

All three respond `501 Not Implemented` if `S3_ENDPOINT`/
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` aren't set, same pattern as
`GoogleOAuthService.isConfigured()`.
