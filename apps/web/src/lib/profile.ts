import type { Profile } from '@anxiocare/shared';

/** What PATCH /me/profile is sent: every field, with null for one not set, so a cleared field is cleared. */
export const profilePatch = (p: Profile) => ({
  avatar: p.avatar ?? null,
  ageRange: p.ageRange ?? null,
  gender: p.gender ?? null,
  occupation: p.occupation ?? null,
  stressFactors: p.stressFactors ?? [],
});
