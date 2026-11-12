import { displayNameSchema } from '@anxiocare/shared';

export const NAME_MAX = 60;

/** Plain words for a name that can't be saved, or null when it can. Same rule as the API: 1 to 60 characters, trimmed. */
export function nameProblem(value: string): string | null {
  if (displayNameSchema.safeParse(value).success) return null;
  return value.trim() ? `Use ${NAME_MAX} characters or fewer.` : 'Enter your name or a nickname.';
}
