import { withNext } from '@anxiocare/shared';
import type { Me } from '@anxiocare/shared';

export { safeNext, withNext } from '@anxiocare/shared';

/**
 * What an account is asked before it goes on to `next`: the privacy notice first, then a name, each only while it's
 * missing. Null when nothing is. Screens that hold someone's rights (Help, Settings, export, deletion, sign-out) never
 * call this, so neither question can stand between a person and those.
 */
export function accountStep(me: Me, next: string): string | null {
  if (me.consentRequired) return withNext('/consent', next);
  if (!me.displayName) return withNext('/name', next);
  return null;
}

/**
 * Where to go after signing in, agreeing or giving a name: what's still owed, then the one-time optional
 * "About you" offer, then `next`. About you is offered here only, never as a gate in front of a screen.
 */
export const afterSignIn = (me: Me, next: string): string => accountStep(me, next) ?? (me.aboutSeen ? next : withNext('/about-you', next));
