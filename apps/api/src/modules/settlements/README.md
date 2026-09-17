# settlements

Settlement recording, validated against the live outstanding balance. `docs/ABRO_PRD.md` §19, §45. See `docs/DECISIONS.md` ADR-003 for why this is an `Expense` row (`splitType: SETTLEMENT`) rather than a separate table, and the addendum there for the exact `ExpenseParticipant` amount shape.

`POST /settlements` — the only entry point that may ever write `splitType: SETTLEMENT`; the general expense-create path structurally cannot (see `@abro/types`'s `createExpenseSchema`).
