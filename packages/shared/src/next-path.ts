const NO_RETURN = ['/sign-in', '/consent', '/create-account', '/forgot-password', '/api'];
const MAX_LENGTH = 2048;
const BASE = 'https://same-origin.invalid';

/**
 * Only ever follow a same-origin path: a `next` value must not become an open redirect. Browsers strip tabs and
 * newlines from URLs and read a backslash as a slash, so anything holding those is refused rather than cleaned.
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || next.length > MAX_LENGTH || !next.startsWith('/') || next.startsWith('//')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE || url.pathname.startsWith('//')) return fallback;
  if (NO_RETURN.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return fallback;
  return next;
}

export const withNext = (path: string, next: string) => `${path}?next=${encodeURIComponent(next)}`;
