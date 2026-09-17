import { z } from 'zod';

/** Finds a Profile by exact email or phone match — never a fuzzy name search, per privacy default. */
export const searchFriendSchema = z.object({
  query: z.string().trim().min(3),
});
export type SearchFriendInput = z.infer<typeof searchFriendSchema>;

export const sendFriendRequestSchema = z.object({
  friendId: z.string().min(1),
});
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;
