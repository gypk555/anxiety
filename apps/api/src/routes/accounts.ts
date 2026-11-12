import {
  loginBody,
  passwordChangeBody,
  passwordForgotBody,
  passwordResetBody,
  passwordSetBody,
  reauthCodeBody,
  reauthPasswordBody,
  registerRequestBody,
  registerVerifyBody,
} from '@anxiocare/shared';
import { passwordProblem } from '@anxiocare/shared/passwords';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { audit } from '../audit.ts';
import { authOf, createSession, markReauthenticated, setSessionCookie, type authHooks } from '../auth.ts';
import { clientKey } from '../client-ip.ts';
import type { Ctx } from '../context.ts';
import { emailBlindIndex, hmac } from '../crypto.ts';
import type { Db, Sql } from '../db.ts';
import { deviceLabel } from '../device.ts';
import { knownDevice, knownDeviceOf, rememberDevice } from '../devices.ts';
import { ApiError, conflict, fieldError, invalidCode, invalidCredentials, overloaded } from '../errors.ts';
import { googleDisconnectedByResetNotice, newSignInNotice, passwordChangedNotice } from '../mail.ts';
import { consumeOtp, deliverOtp, deliverPasswordReset, deliverRegistration, loginQuotaKey, otpTarget } from '../otp.ts';
import { PasswordsBusyError } from '../passwords.ts';
import { createUserWithPassword, emailOf, toMe, type UserRow } from '../users.ts';
import { emptyBody, parse } from '../validate.ts';

/**
 * Failed passwords. A request from a device that has signed in to this account before spends only that device's
 * budget, so nobody else can lock it out. Any other request spends a budget for its address and client together, and
 * the address's overall one. Counted for addresses with no account too, so the caps say nothing about who has one.
 */
export const LOGIN_MAX_FAILURES_PER_SOURCE = 10;
export const LOGIN_MAX_FAILURES = 100;
export const LOGIN_MAX_FAILURES_PER_DEVICE = 10;

interface Attempt {
  email: string;
  stored: string | null;
  password: string;
  /** A device cookie valid for this account, or null. */
  deviceId: string | null;
  clientKey: string;
}

const lockOn = (db: Db, key: string) => db`SELECT pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`;

/**
 * Spends one attempt before checking, so a parallel burst cannot pass a cap. The hash runs outside any database
 * transaction, because it is far too slow to hold a pooled connection. Null means a cap is reached.
 */
async function reserveAttempt(ctx: Ctx, attempt: Attempt): Promise<string | null> {
  const { keys } = ctx.config;
  const quotaHash = loginQuotaKey(keys, attempt.email);
  return ctx.sql.begin(async (tx) => {
    if (attempt.deviceId) {
      await lockOn(tx, `login-device:${attempt.deviceId}`);
      const [row] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM app.login_failures WHERE device_id = ${attempt.deviceId}::uuid AND created_at > now() - interval '1 hour'
      `;
      if (!row || row.n >= LOGIN_MAX_FAILURES_PER_DEVICE) return null;
      const [reserved] = await tx<{ id: string }[]>`
        INSERT INTO app.login_failures (quota_hash, device_id) VALUES (${quotaHash}, ${attempt.deviceId}::uuid) RETURNING id
      `;
      return reserved!.id;
    }
    // Bound to the address, so one client's rows cannot be followed from one address to another.
    const sourceHash = hmac(keys.otpPepper, `login-failure-source:${quotaHash.toString('hex')}:${attempt.clientKey}`);
    await lockOn(tx, `login:${quotaHash.toString('hex')}`);
    const [row] = await tx<{ total: number; source: number }[]>`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE source_hash = ${sourceHash})::int AS source
      FROM app.login_failures
      WHERE quota_hash = ${quotaHash} AND device_id IS NULL AND created_at > now() - interval '24 hours'
    `;
    if (!row || row.total >= LOGIN_MAX_FAILURES || row.source >= LOGIN_MAX_FAILURES_PER_SOURCE) return null;
    const [reserved] = await tx<{ id: string }[]>`
      INSERT INTO app.login_failures (quota_hash, source_hash) VALUES (${quotaHash}, ${sourceHash}) RETURNING id
    `;
    return reserved!.id;
  });
}

const giveBack = (sql: Sql, id: string) => sql`DELETE FROM app.login_failures WHERE id = ${id}::uuid`;

/**
 * The one way a password gets checked. Over a cap, nothing is evaluated: that path is quicker, but it says only that
 * this address and client, or this device, has had its failures, which unknown addresses can too. A success takes back
 * only its own reservation, so an owner signing in cannot refill an attacker's allowance. So does a request shed for load.
 */
async function checkPassword(ctx: Ctx, attempt: Attempt): Promise<boolean> {
  const reservation = await reserveAttempt(ctx, attempt);
  if (!reservation) return false;
  let ok: boolean;
  try {
    ok = await ctx.passwords.verify(attempt.password, attempt.stored, attempt.deviceId !== null);
  } catch (err) {
    await giveBack(ctx.sql, reservation);
    if (err instanceof PasswordsBusyError) throw overloaded();
    throw err;
  }
  if (ok) await giveBack(ctx.sql, reservation);
  return ok;
}

function requirePolicy(password: string, email: string): void {
  const problem = passwordProblem(password, email);
  if (problem) throw fieldError('password', problem);
}

/** Holds a hashing slot through the code check, so a code is never spent and then left with nothing able to hash. */
async function spendCodeThenHash(ctx: Ctx, check: () => Promise<boolean>, password: string, known = false): Promise<string> {
  try {
    return await ctx.passwords.withSlot(async (hash) => {
      if (!(await check())) throw invalidCode();
      return hash(password);
    }, known);
  } catch (err) {
    if (err instanceof PasswordsBusyError) throw overloaded();
    throw err;
  }
}

async function hashNew(ctx: Ctx, password: string, known: boolean): Promise<string> {
  try {
    return await ctx.passwords.hash(password, known);
  } catch (err) {
    if (err instanceof PasswordsBusyError) throw overloaded();
    throw err;
  }
}

/**
 * Inside a credential change's transaction, with the user row locked, so a reset cannot interleave: the session that
 * asked must still exist, and the hash must be the one it started from. Otherwise the change is refused with a 401,
 * because whoever made the other change has signed this session out, or is about to.
 */
async function stillCurrent(tx: Db, user: UserRow, sessionId: string): Promise<boolean> {
  const [row] = await tx<{ password_hash: string | null }[]>`SELECT password_hash FROM app.users WHERE id = ${user.id}::uuid FOR UPDATE`;
  if (!row || row.password_hash !== user.password_hash) return false;
  const [live] = await tx`SELECT 1 FROM app.sessions WHERE id = ${sessionId}::uuid AND user_id = ${user.id}::uuid AND absolute_expires_at > now()`;
  return live !== undefined;
}

const sessionEnded = () => new ApiError(401, 'unauthenticated');

export function accountRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const signedIn = { preHandler: hooks.requireAuth };
  const client = (request: FastifyRequest) => clientKey(request, config.clientIpHeader);

  // ── Create account ──────────────────────────────────────────────────
  app.post('/auth/register/request', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { email } = parse(registerRequestBody, request.body);
    const source = client(request);
    ctx.background.run(request.log, 'otp_delivery', () => deliverRegistration(ctx, { email, clientKey: source }));
    return reply.code(202).send();
  });

  app.post('/auth/register/verify', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { email, code, password, displayName } = parse(registerVerifyBody, request.body);
    requirePolicy(password, email);
    // No account yet, so no device can be known for it.
    const from = { clientKey: client(request), deviceId: null };
    const passwordHash = await spendCodeThenHash(ctx, () => consumeOtp(sql, keys, otpTarget(keys, 'register', email, null), code, from), password);
    const user = await createUserWithPassword(sql, keys, { email, emailHash: emailBlindIndex(keys, email), passwordHash, displayName });
    if (!user) throw invalidCode();
    const token = await sql.begin(async (tx) => {
      const created = await createSession(tx, keys, user, request.headers['user-agent'], true);
      await rememberDevice(tx, config, request, reply, user.id);
      await audit(tx, keys, 'login', user.id);
      return created;
    });
    setSessionCookie(reply, config, token);
    return toMe(keys, user);
  });

  // ── Sign in ─────────────────────────────────────────────────────────
  app.post('/auth/login', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { email, password } = parse(loginBody, request.body);
    const source = client(request);
    const emailHash = emailBlindIndex(keys, email);
    const deviceId = await knownDevice(sql, config, request, emailHash);
    // Before any counting or hashing, so a flood is shed cheaply. A known device skips the instance-wide bucket.
    if (!ctx.passwords.admit(source, deviceId !== null)) throw overloaded();
    const [user] = await sql<UserRow[]>`SELECT * FROM app.users WHERE email_hash = ${emailHash}`;
    // Unknown address, no password set and wrong password all land here, having done the same work.
    const ok = await checkPassword(ctx, { email, stored: user?.password_hash ?? null, password, deviceId, clientKey: source });
    if (!ok || !user) throw invalidCredentials();

    const token = await sql.begin(async (tx) => {
      const created = await createSession(tx, keys, user, request.headers['user-agent'], true);
      await rememberDevice(tx, config, request, reply, user.id);
      await audit(tx, keys, 'login', user.id);
      return created;
    });
    setSessionCookie(reply, config, token);
    const device = deviceLabel(request.headers['user-agent']);
    ctx.background.run(request.log, 'signin_notice', () => ctx.mailer.send(newSignInNotice(emailOf(keys, user), device)));
    if (user.password_hash && ctx.passwords.needsRehash(user.password_hash)) {
      const old = user.password_hash;
      ctx.background.run(request.log, 'password_rehash', async () => {
        const upgraded = await ctx.passwords.hash(password);
        // Only over the hash it checked: a password changed in the meantime wins.
        await sql`UPDATE app.users SET password_hash = ${upgraded}, updated_at = now() WHERE id = ${user.id}::uuid AND password_hash = ${old}`;
      });
    }
    return toMe(keys, user);
  });

  // ── Forgot password ─────────────────────────────────────────────────
  app.post('/auth/password/forgot', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { email } = parse(passwordForgotBody, request.body);
    const source = client(request);
    ctx.background.run(request.log, 'otp_delivery', () => deliverPasswordReset(ctx, { email, clientKey: source }));
    return reply.code(202).send();
  });

  app.post('/auth/password/reset', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { email, code, password } = parse(passwordResetBody, request.body);
    requirePolicy(password, email);
    const emailHash = emailBlindIndex(keys, email);
    const deviceId = await knownDevice(sql, config, request, emailHash);
    const from = { clientKey: client(request), deviceId };
    const passwordHash = await spendCodeThenHash(ctx, () => consumeOtp(sql, keys, otpTarget(keys, 'password_reset', email, null), code, from), password, deviceId !== null);
    const done = await sql.begin(async (tx) => {
      // Locked, so a change or set racing this one waits, then finds its session gone and gives up.
      const [found] = await tx<UserRow[]>`SELECT * FROM app.users WHERE email_hash = ${emailHash} FOR UPDATE`;
      if (!found) return null;
      await tx`UPDATE app.users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${found.id}::uuid`;
      // Whoever knew the old password, held a session, connected a Google account or used a device is out.
      await tx`DELETE FROM app.sessions WHERE user_id = ${found.id}::uuid`;
      const unlinked = await tx`DELETE FROM app.user_identities WHERE user_id = ${found.id}::uuid`;
      if (unlinked.count > 0) await audit(tx, keys, 'google_unlink', found.id);
      await tx`DELETE FROM app.device_tokens WHERE user_id = ${found.id}::uuid`;
      // The inbox has just been proved, so a lockout from failed passwords ends too.
      await tx`DELETE FROM app.login_failures WHERE quota_hash = ${loginQuotaKey(keys, email)}`;
      const created = await createSession(tx, keys, found, request.headers['user-agent'], true);
      await rememberDevice(tx, config, request, reply, found.id);
      await audit(tx, keys, 'password_reset', found.id);
      return { user: found, token: created, unlinkedGoogle: unlinked.count > 0 };
    });
    if (!done) throw invalidCode();
    setSessionCookie(reply, config, done.token);
    const to = emailOf(keys, done.user);
    ctx.background.run(request.log, 'password_notice', async () => {
      await ctx.mailer.send(passwordChangedNotice(to));
      if (done.unlinkedGoogle) await ctx.mailer.send(googleDisconnectedByResetNotice(to));
    });
    return toMe(keys, done.user);
  });

  // ── Change or set, from Settings ────────────────────────────────────
  app.post('/me/password', { ...signedIn, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { user, sessionId } = authOf(request);
    const { currentPassword, password } = parse(passwordChangeBody, request.body);
    const email = emailOf(keys, user);
    requirePolicy(password, email);
    const deviceId = await knownDeviceOf(sql, config, request, user.id);
    if (!(await checkPassword(ctx, { email, stored: user.password_hash, password: currentPassword, deviceId, clientKey: client(request) }))) throw invalidCredentials();
    const passwordHash = await hashNew(ctx, password, deviceId !== null);
    const changed = await sql.begin(async (tx) => {
      if (!(await stillCurrent(tx, user, sessionId))) return false;
      await tx`UPDATE app.users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${user.id}::uuid`;
      await tx`DELETE FROM app.sessions WHERE user_id = ${user.id}::uuid AND id <> ${sessionId}::uuid`;
      await audit(tx, keys, 'password_change', user.id);
      return true;
    });
    if (!changed) throw sessionEnded();
    ctx.background.run(request.log, 'password_notice', () => ctx.mailer.send(passwordChangedNotice(email)));
    return reply.code(204).send();
  });

  const alreadyHasPassword = () => conflict('This account already has a password. Change it with your current password, or use "Forgot your password?" on the sign-in screen.');

  app.post('/me/password/set/request', { ...signedIn, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    parse(emptyBody, request.body);
    const { user } = authOf(request);
    if (user.password_hash) throw alreadyHasPassword();
    const email = emailOf(keys, user);
    const source = client(request);
    ctx.background.run(request.log, 'otp_delivery', () => deliverOtp(ctx, { purpose: 'password_set', email, subjectUserId: user.id, clientKey: source }));
    return reply.code(202).send();
  });

  app.post('/me/password/set', { ...signedIn, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { user, sessionId } = authOf(request);
    const { code, password } = parse(passwordSetBody, request.body);
    if (user.password_hash) throw alreadyHasPassword();
    const email = emailOf(keys, user);
    requirePolicy(password, email);
    const deviceId = await knownDeviceOf(sql, config, request, user.id);
    const passwordHash = await spendCodeThenHash(ctx, () => consumeOtp(sql, keys, otpTarget(keys, 'password_set', email, user.id), code), password, deviceId !== null);
    const changed = await sql.begin(async (tx) => {
      if (!(await stillCurrent(tx, user, sessionId))) return false;
      await tx`UPDATE app.users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${user.id}::uuid`;
      await tx`DELETE FROM app.sessions WHERE user_id = ${user.id}::uuid AND id <> ${sessionId}::uuid`;
      await audit(tx, keys, 'password_set', user.id);
      return true;
    });
    if (!changed) throw sessionEnded();
    ctx.background.run(request.log, 'password_notice', () => ctx.mailer.send(passwordChangedNotice(email)));
    return reply.code(204).send();
  });

  // ── Prove it's you again, before changing how the account signs in ──
  app.post('/me/reauth/password', { ...signedIn, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { user, sessionId } = authOf(request);
    const { password } = parse(reauthPasswordBody, request.body);
    const email = emailOf(keys, user);
    const deviceId = await knownDeviceOf(sql, config, request, user.id);
    // The same caps as sign-in, so a borrowed phone cannot grind through passwords here either.
    if (!(await checkPassword(ctx, { email, stored: user.password_hash, password, deviceId, clientKey: client(request) }))) throw invalidCredentials();
    await markReauthenticated(sql, sessionId);
    return reply.code(204).send();
  });

  app.post('/me/reauth/code/request', { ...signedIn, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    parse(emptyBody, request.body);
    const { user } = authOf(request);
    const email = emailOf(keys, user);
    const source = client(request);
    ctx.background.run(request.log, 'otp_delivery', () => deliverOtp(ctx, { purpose: 'reauth', email, subjectUserId: user.id, clientKey: source }));
    return reply.code(202).send();
  });

  app.post('/me/reauth/code', { ...signedIn, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { user, sessionId } = authOf(request);
    const { code } = parse(reauthCodeBody, request.body);
    if (!(await consumeOtp(sql, keys, otpTarget(keys, 'reauth', emailOf(keys, user), user.id), code))) throw invalidCode();
    await markReauthenticated(sql, sessionId);
    return reply.code(204).send();
  });

  app.get('/me/sign-in-methods', signedIn, async (request) => {
    const { user } = authOf(request);
    return signInMethods(sql, user);
  });
}

export async function signInMethods(sql: Sql, user: Pick<UserRow, 'id' | 'password_hash'>) {
  const [google] = await sql`SELECT 1 FROM app.user_identities WHERE user_id = ${user.id}::uuid AND provider = 'google'`;
  return { password: user.password_hash !== null, google: google !== undefined };
}

