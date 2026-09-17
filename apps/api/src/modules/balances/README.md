# balances

Derived balance engine — never a stored/manually-updated balance. `docs/ABRO_PRD.md` §16, §17, §22.

`BalancesService.getPairwiseBalance(userA, userB, groupId?)` — net balance between two users, scoped to personal expenses (groupId omitted) or one group. Positive = userA owes userB. Used both for the friend-balance view and by `settlements` to validate the "settlement ≤ outstanding debt" invariant (§19/§45).

`BalancesService.getGroupSummary(groupId)` — each member's net position within a group (paid − owed), not pairwise.

Debt simplification (§18, minimum-cash-flow graph) is a deliberate follow-up, not built here — see `docs/DECISIONS.md`.
