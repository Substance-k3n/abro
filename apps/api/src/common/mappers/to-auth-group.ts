import type { Profile } from '@prisma/client';

import { toAuthProfile } from './to-auth-profile';

interface GroupWithMembers {
  members: { user: Profile; [key: string]: unknown }[];
  [key: string]: unknown;
}

/** docs/BACKEND_PLAN.md item 5: each member's nested Profile goes through toAuthProfile. */
export const toAuthGroup = <T extends GroupWithMembers>(group: T) => ({
  ...group,
  members: group.members.map((m) => ({ ...m, user: toAuthProfile(m.user) })),
});
