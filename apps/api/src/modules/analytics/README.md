# analytics

Monthly/yearly spending insight queries. `docs/ABRO_PRD.md` §26.

Read-only aggregation over `Expense`/`ExpenseParticipant` — no new
persistence, no cached/derived values, matching the project-wide rule
"expenses are facts, balances (and analytics) are derived projections."

## Scope (Assumption — not pinned down explicitly by the PRD)

Every figure is computed across the whole user: personal (`groupId: null`)
activity plus every group they belong to, not scoped to one group by
default. `docs/ABRO_PRD.md` §26's yearly "Group spending" field is a
_breakdown within_ the overall picture, which only makes sense if the
top-level query already spans groups.

## Field definitions

Shared (§26's own definitions):

- **Total Spending** — sum of relevant expense totals: each expense the
  user paid or participated in, counted once at its full amount.
- **Your Contribution** — amount actually paid by the user
  (`sum(Expense.amount)` where `paidById = user`).
- **Your Share** — amount allocated to the user
  (`sum(ExpenseParticipant.amount)` where `userId = user`).
- **Net Position** — Your Contribution minus Your Share (same formula as
  `BalancesService.getGroupSummary`'s `netBalance`).

All of the above **exclude** `splitType: SETTLEMENT` rows — a settlement
is a debt transfer, not new spending, and is reported separately under
`settlements` to avoid double-counting.

Monthly-only:

- **amountOwed** — `sum(ExpenseParticipant.amount)` where `userId = user`
  and the expense was paid by someone else (what you owe from this
  period's non-settlement activity).
- **amountReceived** / **settlements.received** — settlement amount
  received this period (the recipient's non-zero `ExpenseParticipant`
  row on a `SETTLEMENT` expense someone else paid).
- **settlements.paid** — settlement amount the user initiated
  (`sum(Expense.amount)` where `paidById = user`, `splitType: SETTLEMENT`).
- **categoryBreakdown** — non-settlement spending grouped by
  `Expense.category`.

Yearly-only:

- **monthlyTrend** — `totalSpending` per calendar month (12 entries).
- **groupSpending** — `totalSpending` per group the user is an `ACTIVE`
  member of (groups with zero activity in the period are omitted).
- **categoryDistribution** — same shape as `categoryBreakdown`, for the
  year.

## Known limitation

Sums are raw minor-unit totals with no currency conversion — an expense
in one currency and one in another are summed as if equal. No other
module in this codebase (balances, settlements) does cross-currency
netting yet either; PRD §27's "point-in-time snapshot" conversion model
isn't wired into any read path yet. Flagged, not silently ignored.
