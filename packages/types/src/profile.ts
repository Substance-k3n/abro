import { z } from 'zod';

/** ABRO_PRD.md §39 "Profile" screen fields — everything a user can self-edit. */
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  avatarUrl: z.string().url().optional(),
  preferredCurrency: z.string().length(3).optional(),
  locale: z.string().min(2).max(10).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
