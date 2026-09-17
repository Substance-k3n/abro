import type { Profile } from '@prisma/client';

import { toAuthProfile } from './to-auth-profile';

interface NoteWithAuthor {
  author: Profile;
  [key: string]: unknown;
}

/** docs/BACKEND_PLAN.md item 5: the note's nested author Profile goes through toAuthProfile. */
export const toAuthExpenseNote = <T extends NoteWithAuthor>(note: T) => ({
  ...note,
  author: toAuthProfile(note.author),
});
