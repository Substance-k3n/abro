import { z } from 'zod';

/** ABRO_PRD.md §39 "Sign In" — Email OTP request. */
export const requestOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

/** ABRO_PRD.md §39 "OTP" — the 6-digit code the user reads back. */
export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/** What every auth endpoint that establishes a session returns. */
export const authProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.string().nullable(),
  preferredCurrency: z.string(),
  locale: z.string(),
});
export type AuthProfile = z.infer<typeof authProfileSchema>;
