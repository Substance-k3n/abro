import { z } from 'zod';

/** Mirrors the Prisma GroupType enum — kept in sync manually, same as SplitType (see split.ts). */
export const GroupType = {
  FRIENDS: 'FRIENDS',
  TRIP: 'TRIP',
  HOUSEHOLD: 'HOUSEHOLD',
  FAMILY: 'FAMILY',
  TEAM: 'TEAM',
  OTHER: 'OTHER',
} as const;
export type GroupType = (typeof GroupType)[keyof typeof GroupType];
export const groupTypeSchema = z.nativeEnum(GroupType);

export const GroupMemberRole = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type GroupMemberRole = (typeof GroupMemberRole)[keyof typeof GroupMemberRole];
export const groupMemberRoleSchema = z.nativeEnum(GroupMemberRole);

/** ABRO_PRD.md §23 "Creation" fields. */
export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: groupTypeSchema.optional(),
  currency: z.string().length(3).optional(),
  description: z.string().trim().max(280).optional(),
  simplifyDebts: z.boolean().optional(),
  /** Must each already be an accepted friend of the creator — enforced server-side. */
  memberIds: z.array(z.string()).max(200).optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/** ABRO_PRD.md §23 "Settings" — same fields as creation, all optional. */
export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  type: groupTypeSchema.optional(),
  currency: z.string().length(3).optional(),
  description: z.string().trim().max(280).optional(),
  simplifyDebts: z.boolean().optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const addGroupMemberSchema = z.object({
  userId: z.string().min(1),
});
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;

export const updateGroupMemberRoleSchema = z.object({
  role: groupMemberRoleSchema,
});
export type UpdateGroupMemberRoleInput = z.infer<typeof updateGroupMemberRoleSchema>;
