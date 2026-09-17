import type { Profile } from '@prisma/client';

import { toAuthProfile } from './to-auth-profile';

interface ExpenseWithProfiles {
  paidBy: Profile;
  participants: { user: Profile; [key: string]: unknown }[];
  [key: string]: unknown;
}

/** docs/BACKEND_PLAN.md item 5: nested Profile objects (paidBy, each participant's user) go through toAuthProfile, same as friends.controller.ts already does. */
export const toAuthExpense = <T extends ExpenseWithProfiles>(expense: T) => ({
  ...expense,
  paidBy: toAuthProfile(expense.paidBy),
  participants: expense.participants.map((p) => ({ ...p, user: toAuthProfile(p.user) })),
});
