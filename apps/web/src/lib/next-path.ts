/** Only ever follow a same-origin path: a `next` value must not become an open redirect. */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (next.startsWith('/sign-in') || next.startsWith('/consent')) return fallback;
  return next;
}

export const withNext = (path: string, next: string) => `${path}?next=${encodeURIComponent(next)}`;
