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

export interface AuthState {
  sessionId: string;
  user: UserRow;
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

/** A new 256-bit token per login. Only its SHA-256 is stored; the raw User-Agent and IP are not. */
export async function createSession(db: Db, keys: Keys, user: UserRow, userAgent: string | undefined): Promise<string> {
  const id = randomUUID();
  const token = generateSessionToken();
  const label = sealText(dekFor(keys, user), deviceLabel(userAgent), 'sessions.device_label', id, user.id);
  await db`
    INSERT INTO app.sessions (id, user_id, token_hash, device_label_ct, absolute_expires_at)
    VALUES (${id}::uuid, ${user.id}::uuid, ${sha256(token)}, ${label},
            now() + make_interval(days => ${SESSION_ABSOLUTE_DAYS}::int))
  `;
  return token;
}

export async function lookupSession(ctx: Ctx, token: string | undefined): Promise<AuthState | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const [row] = await ctx.sql<(UserRow & { session_id: string; seen_stale: boolean })[]>`
    SELECT u.*, s.id AS session_id,
           s.last_seen_at < now() - ${LAST_SEEN_GRANULARITY}::interval AS seen_stale
    FROM app.sessions s JOIN app.users u ON u.id = s.user_id
    WHERE s.token_hash = ${sha256(token)}
      AND s.absolute_expires_at > now()
      AND s.last_seen_at > now() - make_interval(days => ${SESSION_IDLE_DAYS}::int)
  `;
  if (!row) return null;
  // Slides the idle window. Coarse on purpose: no write per request, and less activity detail at rest.
  if (row.seen_stale) await ctx.sql`UPDATE app.sessions SET last_seen_at = now() WHERE id = ${row.session_id}::uuid`;
  const { session_id: sessionId, seen_stale: _stale, ...user } = row;
  return { sessionId, user };
}

export function authHooks(ctx: Ctx) {
  const requireAuth = async (request: FastifyRequest) => {
    const auth = await lookupSession(ctx, request.cookies[ctx.config.cookie.name]);
    if (!auth) throw new ApiError(401, 'unauthenticated');
    request.auth = auth;
  };
  const requireConsent = async (request: FastifyRequest) => {
    if (!request.auth || !hasCurrentConsent(request.auth.user)) throw new ApiError(403, 'consent_required');
  };
  return { requireAuth, requireConsent };
}

/** Only called from handlers behind requireAuth. */
export function authOf(request: FastifyRequest): AuthState {
  if (!request.auth) throw new ApiError(401, 'unauthenticated');
  return request.auth;
}
