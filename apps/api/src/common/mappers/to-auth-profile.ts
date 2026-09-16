import type { Profile } from '@prisma/client';
import type { AuthProfile } from '@abro/types';

/** The public-facing shape of a Profile — strips nothing sensitive today, but
 * is the one place that shape is defined so a future sensitive field doesn't
 * leak by accident. */
export const toAuthProfile = (profile: Profile): AuthProfile => ({
  id: profile.id,
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl,
  email: profile.email,
  preferredCurrency: profile.preferredCurrency,
  locale: profile.locale,
});
