import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.ts';
import type { Ctx } from './context.ts';
import { generateSessionToken, sealText, sha256, type Keys } from './crypto.ts';
import type { Db } from './db.ts';
import { deviceLabel } from './device.ts';
import { ApiError } from './errors.ts';
import { dekFor, hasCurrentConsent, type UserRow } from './users.ts';

export const SESSION_IDLE_DAYS = 30;
export const SESSION_ABSOLUTE_DAYS = 90;
const LAST_SEEN_GRANULARITY = '5 minutes';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Connecting or disconnecting Google needs a password or email code proved this recently, in this session. */
export const REAUTH_MINUTES = 10;

export interface AuthState {
  sessionId: string;
  user: UserRow;
  /** This session proved a password or an email code within REAUTH_MINUTES, by the database's clock. */
  reauthFresh: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthState | null;
  }
}

function cookieOptions(config: Config) {
  return { path: '/', httpOnly: true, secure: config.cookie.secure, sameSite: 'strict' } as const;
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string): void {
  // The cookie lives as long as the absolute limit; the server enforces the shorter idle limit.
  reply.setCookie(config.cookie.name, token, {
    ...cookieOptions(config),
    maxAge: SESSION_ABSOLUTE_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(config.cookie.name, cookieOptions(config));
}

/**
 * A new 256-bit token per login. Only its SHA-256 is stored; the raw User-Agent and IP are not. `proved` is true when
 * this sign-in itself checked a password or an email code, which counts as a re-authentication at that moment.
 */
export async function createSession(db: Db, keys: Keys, user: UserRow, userAgent: string | undefined, proved = false): Promise<string> {
  const id = randomUUID();
  const token = generateSessionToken();
  const label = sealText(dekFor(keys, user), deviceLabel(userAgent), 'sessions.device_label', id, user.id);
  await db`
    INSERT INTO app.sessions (id, user_id, token_hash, device_label_ct, absolute_expires_at, reauth_at)
    VALUES (${id}::uuid, ${user.id}::uuid, ${sha256(token)}, ${label},
            now() + make_interval(days => ${SESSION_ABSOLUTE_DAYS}::int), CASE WHEN ${proved}::boolean THEN now() END)
  `;
  return token;
}


export async function lookupSession(ctx: Ctx, token: string | undefined): Promise<AuthState | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const [row] = await ctx.sql<(UserRow & { session_id: string; seen_stale: boolean; reauth_fresh: boolean })[]>`
    SELECT u.*, s.id AS session_id,
           coalesce(s.reauth_at > now() - make_interval(mins => ${REAUTH_MINUTES}::int), false) AS reauth_fresh,
           s.last_seen_at < now() - ${LAST_SEEN_GRANULARITY}::interval AS seen_stale
    FROM app.sessions s JOIN app.users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)}
      AND s.absolute_expires_at > now()
      AND s.last_seen_at > now() - make_interval(days => ${SESSION_IDLE_DAYS}::int)
  `;
  if (!row) return null;
  // Slides the idle window. Coarse on purpose: no write per request, and less activity detail at rest.
  if (row.seen_stale) await ctx.sql`UPDATE app.sessions SET last_seen_at = now() WHERE id = ${row.session_id}::uuid`;
  const { session_id: sessionId, seen_stale: _stale, reauth_fresh: reauthFresh, ...user } = row;
  return { sessionId, user, reauthFresh };
}

/**
 * Fixed one-minute window per account, in memory on this instance (like the per-IP limits; see the README).
 * Keyed by account rather than IP because mobile carriers in India put many phones behind one address.
 */
export class UserRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs = 60_000, now: () => number = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Seconds to wait if this request is over the limit, otherwise 0. */
  hit(key: string): number {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      if (this.windows.size >= 50_000) this.prune(now);
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count <= this.max) return 0;
    return Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000));
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) if (now - window.start >= this.windowMs) this.windows.delete(key);
  }
}

export function authHooks(ctx: Ctx) {
  const perUser = new UserRateLimiter(ctx.config.userRateLimitPerMinute);
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await lookupSession(ctx, request.cookies[ctx.config.cookie.name]);
    if (!auth) throw new ApiError(401, 'unauthenticated');
    const wait = perUser.hit(auth.user.id);
    if (wait > 0) {
      reply.header('retry-after', String(wait));
      throw new ApiError(429, 'rate_limited');
    }
    request.auth = auth;
  };
  const requireConsent = async (request: FastifyRequest) => {
    if (!request.auth || !hasCurrentConsent(request.auth.user)) throw new ApiError(403, 'consent_required');
  };
  return { requireAuth, requireConsent };
}

/** For changes to how an account signs in. The client answers by asking for a password or an email code. */
export function requireRecentReauth(auth: AuthState): void {
  if (!auth.reauthFresh) throw new ApiError(403, 'reauth_required');
}

/** Marks this session as having just proved a password or an email code. */
export const markReauthenticated = (db: Db, sessionId: string) => db`UPDATE app.sessions SET reauth_at = now() WHERE id = ${sessionId}::uuid`;

/** Only called from handlers behind requireAuth. */
export function authOf(request: FastifyRequest): AuthState {
  if (!request.auth) throw new ApiError(401, 'unauthenticated');
  return request.auth;
}
