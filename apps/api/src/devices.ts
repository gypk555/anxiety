import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.ts';
import { deviceTokenHmac } from './crypto.ts';
import type { Db } from './db.ts';

/**
 * Device cookies, after OWASP's "device cookie" pattern for lockout. A browser where someone has signed in before
 * carries a random token. Address-wide failure caps do not apply to it, only its own, so a stranger spending an
 * address's allowance cannot lock out a device its owner already uses. It is not a sign-in: it never lets anyone in,
 * it only decides which failure budget a password or code attempt spends.
 */
export const DEVICE_COOKIE_SECURE = '__Host-device';
export const DEVICE_DAYS = 365;
/** The newest this many per account are kept. A browser signing in to someone else replaces its cookie. */
const MAX_DEVICES_PER_USER = 20;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** __Host- needs Secure, so the plain name is for development on http://localhost only, as with the session cookie. */
export const deviceCookieName = (config: Pick<Config, 'cookie'>) => (config.cookie.secure ? DEVICE_COOKIE_SECURE : 'device');

const cookieOptions = (config: Pick<Config, 'cookie'>) => ({ path: '/', httpOnly: true, secure: config.cookie.secure, sameSite: 'strict' } as const);

function presentedToken(config: Config, request: FastifyRequest): string | null {
  const token = request.cookies[deviceCookieName(config)];
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * The device this request's cookie names, when it is current and belongs to the account with this address. One
 * query whether or not the address has an account, so it says nothing about which addresses do.
 */
export async function knownDevice(db: Db, config: Config, request: FastifyRequest, emailHash: Buffer): Promise<string | null> {
  const token = presentedToken(config, request);
  if (!token) return null;
  const [row] = await db<{ id: string }[]>`
    SELECT d.id FROM app.device_tokens d JOIN app.users u ON u.id = d.user_id
    WHERE d.token_hmac = ${deviceTokenHmac(config.keys, token)} AND d.expires_at > now() AND u.email_hash = ${emailHash}
  `;
  return row?.id ?? null;
}

/** The same, for a signed-in request, where the account is already known. */
export async function knownDeviceOf(db: Db, config: Config, request: FastifyRequest, userId: string): Promise<string | null> {
  const token = presentedToken(config, request);
  if (!token) return null;
  const [row] = await db<{ id: string }[]>`
    SELECT id FROM app.device_tokens WHERE token_hmac = ${deviceTokenHmac(config.keys, token)} AND user_id = ${userId}::uuid AND expires_at > now()
  `;
  return row?.id ?? null;
}

/**
 * After any successful sign-in. A cookie already valid for this account is kept and its lifetime renewed; otherwise
 * a new token is issued. Only its HMAC is stored.
 */
export async function rememberDevice(db: Db, config: Config, request: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
  const name = deviceCookieName(config);
  const maxAge = DEVICE_DAYS * 24 * 60 * 60;
  const presented = presentedToken(config, request);
  if (presented) {
    const renewed = await db`
      UPDATE app.device_tokens SET expires_at = now() + make_interval(days => ${DEVICE_DAYS}::int)
      WHERE token_hmac = ${deviceTokenHmac(config.keys, presented)} AND user_id = ${userId}::uuid AND expires_at > now()
      RETURNING id
    `;
    if (renewed.length > 0) {
      reply.setCookie(name, presented, { ...cookieOptions(config), maxAge });
      return;
    }
  }
  const token = randomBytes(32).toString('base64url');
  await db`
    INSERT INTO app.device_tokens (user_id, token_hmac, expires_at)
    VALUES (${userId}::uuid, ${deviceTokenHmac(config.keys, token)}, now() + make_interval(days => ${DEVICE_DAYS}::int))
  `;
  await db`
    DELETE FROM app.device_tokens WHERE user_id = ${userId}::uuid AND id NOT IN (
      SELECT id FROM app.device_tokens WHERE user_id = ${userId}::uuid ORDER BY created_at DESC, id DESC LIMIT ${MAX_DEVICES_PER_USER}
    )
  `;
  reply.setCookie(name, token, { ...cookieOptions(config), maxAge });
}

export function clearDeviceCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(deviceCookieName(config), cookieOptions(config));
}
