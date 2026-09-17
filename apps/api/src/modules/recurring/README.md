# recurring

Recurring expense templates and scheduled generation. `docs/ABRO_PRD.md` §35.

## Design

The "template" is a real `Expense` row, created through the normal
`ExpensesService.create` path (reusing its split computation, friend/group
authorization, and currency resolution rather than duplicating any of it).
`RecurringExpense` wraps that Expense's id with `frequency`/`nextRunAt`/
`enabled`.

Each generated occurrence is an **independent** `Expense` row, a full copy
of the template's values at generation time — never a reference back to
the template. Editing the template afterward (via the normal
`PATCH /expenses/:id`) can never retroactively change a past occurrence,
because past rows don't point at it.

**Known limitation, by design:** generation always reproduces the
template's exact participant _amounts_, not its original split _weights_.
A `PERCENTAGE`/`SHARES` template's weights are gone once resolved into
fixed `ExpenseParticipant.amount`s — there's nothing left to re-derive a
split from. Generation always submits `splitType: EXACT` with the
template's stored amounts. This matches PRD §35's own examples (rent,
internet, subscriptions — fixed recurring bills); changing a recurring
amount means editing the template `Expense` first.

**Known limitation:** each `generateDue()` call generates at most one
occurrence per due template, even if several periods were missed (e.g. the
trigger wasn't called for two months on a monthly template). `nextRunAt`
only advances by one period per call, so a backlog catches up one
occurrence per subsequent call rather than all at once. Acceptable given
ADR-005's "nothing calls this automatically yet" — becomes a real design
question once a real scheduler is wired up.

## Trigger mechanism — see `docs/DECISIONS.md` ADR-005

`generateDue()` is exposed as `POST /recurring/generate-due`, a plain
`SessionGuard`-protected endpoint, not an automatic cron job — no
scheduler infra exists in this repo yet. Nothing calls it automatically.
