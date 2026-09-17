# balances

Derived balance engine — never a stored/manually-updated balance. `docs/ABRO_PRD.md` §16, §17, §18, §22.

`BalancesService.getPairwiseBalance(userA, userB, groupId?)` — net balance between two users, scoped to personal expenses (groupId omitted) or one group. Positive = userA owes userB. Used both for the friend-balance view and by `settlements` to validate the "settlement ≤ outstanding debt" invariant (§19/§45).

`BalancesService.getGroupSummary(groupId)` — each member's net position within a group (paid − owed), not pairwise.

`BalancesService.getSimplifiedGroupDebts(groupId)` — the pairwise minimum-transaction settlement plan for a group (§18), derived from `getGroupSummary`'s net positions via `@abro/types`' `simplifyDebts()` (greedy repeated-match, deterministic tie-break, documented optimality caveats). `Group.simplifyDebts` is a frontend display preference (itemized vs. simplified) — the API exposes both `getGroupSummary` and this endpoint and lets the client pick.
