# notifications

In-app notifications (MVP); push/email are Phase 2. `docs/ABRO_PRD.md` §34.

`NotificationsService` is a leaf module (list/markRead/markAllRead/notify)
with no knowledge of _why_ a notification exists — every other module that
owns a PRD §34 event calls into it directly (`GroupsModule`,
`ExpensesModule`, `SettlementsModule` all import `NotificationsModule`).

## Event coverage

| PRD §34 event               | Emitted from                                                                           | Recipients                                             |
| --------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Expense added               | `ExpensesService.create`                                                               | payer + participants, except the actor                 |
| Expense edited              | `ExpensesService.update`                                                               | payer + participants (post-edit set), except the actor |
| Expense deleted             | `ExpensesService.softDelete`                                                           | payer + participants, except the actor                 |
| Settlement                  | `SettlementsService.create`                                                            | the recipient (`toUserId`) only                        |
| Group invitation            | `GroupsService.create` (initial `memberIds`) and `GroupsService.addMember`             | the invited user(s)                                    |
| Group membership changes    | `GroupsService.acceptInvite` / `removeMember`                                          | every other `ACTIVE` member, except the actor          |
| Recurring expense           | _(deferred — `recurring` module doesn't exist yet; see `docs/BACKEND_PLAN.md` item 4)_ | —                                                      |
| Debt simplification changes | `GroupsService.update`, only when `simplifyDebts` actually flips                       | every other `ACTIVE` member, except the actor          |

Two deliberate Assumptions, since the PRD doesn't spell these out:

- **Role changes** (`GroupsService.updateMemberRole`) notify only the
  affected member, not the whole group — narrower than join/leave, which
  are genuinely group-wide news.
- **Friend-request events are not emitted.** PRD §34's event list has no
  friend-request entry; `FriendsService` is deliberately untouched.
- **"Debt simplification changes"** has no natural discrete trigger in
  this codebase (`getSimplifiedGroupDebts` is a computed view, not stored
  data) — the only concrete event is a group admin toggling
  `Group.simplifyDebts`.

## Known limitation

Notification creation is awaited inline with the triggering write (not
queued, not best-effort) — if it throws, the whole request fails, which is
wrong for a side-effect that shouldn't be able to block an expense from
saving. Acceptable for now given the DB-direct, no-queue architecture
everywhere else in this codebase; revisit in a hardening pass if it proves
flaky in practice.
