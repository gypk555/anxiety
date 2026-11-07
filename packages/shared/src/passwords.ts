// Imported as @anxiocare/shared/passwords, never through the package's index, so the list stays out of the first bundle.
import { isCommonPassword } from './common-passwords.ts';
import { passwordLength, PASSWORD_MAX, PASSWORD_MIN } from './password-length.ts';

export { isCommonPassword };
/** Below this, a local part such as "a" or "me" would rule out most passwords and protect nothing. */
const LOCAL_PART_MIN = 3;

/** The part of an address that says who it belongs to, and the same without any +tag. */
function localParts(email: string): string[] {
  const local = email.slice(0, Math.max(email.lastIndexOf('@'), 0)).toLowerCase();
  return [...new Set([local, local.split('+', 1)[0]!])].filter((part) => part.length >= LOCAL_PART_MIN);
}

/**
 * NIST SP 800-63B: length and a blocklist, no composition rules. Returns words for a person, or null when the
 * password is fine. The client and the server run the same code. Never includes the password in what it returns.
 */
export function passwordProblem(password: string, email: string): string | null {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters. A few ordinary words together work well.`;
  if (length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  if (isCommonPassword(password)) return 'That password is too common and easy to guess. A few ordinary words together work well.';
  const lower = password.toLowerCase();
  if (localParts(email).some((part) => lower.includes(part))) return "Your password can't include the first part of your email address.";
  return null;
}
