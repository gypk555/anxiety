import { otpRequestBody, otpVerifyBody, type SessionInfo } from '@anxiocare/shared';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.ts';
import { authOf, clearSessionCookie, createSession, lookupSession, setSessionCookie, type authHooks } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { clientKey } from '../client-ip.ts';
import { emailBlindIndex, openText } from '../crypto.ts';
import { deviceLabel } from '../device.ts';
import { knownDevice, rememberDevice } from '../devices.ts';
import { invalidCode, notFound } from '../errors.ts';
import { newSignInNotice } from '../mail.ts';
import { consumeOtp, deliverOtp, otpTarget } from '../otp.ts';
import { dekFor, emailOf, findOrCreateUser, toMe } from '../users.ts';
import { emptyBody, idParam, parse } from '../validate.ts';

export function authRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;

  app.post('/auth/otp/request', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { email } = parse(otpRequestBody, request.body);
    // Nothing that depends on the address happens before the response is written: not even the rate
    // count or the lookup of a code. There is no account lookup at all on this path.
    const client = clientKey(request, config.clientIpHeader);
    ctx.background.run(request.log, 'otp_delivery', () => deliverOtp(ctx, { purpose: 'login', email, subjectUserId: null, clientKey: client }));
    return reply.code(202).send();
  });

  app.post('/auth/otp/verify', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { email, code } = parse(otpVerifyBody, request.body);
    const emailHash = emailBlindIndex(keys, email);
    // A device that has signed in to this account before spends its own guess budget, not the address's.
    const deviceId = await knownDevice(sql, config, request, emailHash);
    const from = { clientKey: clientKey(request, config.clientIpHeader), deviceId };
    const ok = await consumeOtp(sql, keys, otpTarget(keys, 'login', email, null), code, from);
    if (!ok) throw invalidCode();

    const user = await findOrCreateUser(sql, keys, email, emailHash);
    const token = await sql.begin(async (tx) => {
      const created = await createSession(tx, keys, user, request.headers['user-agent'], true);
      await rememberDevice(tx, config, request, reply, user.id);
      await audit(tx, keys, 'login', user.id);
      return created;
    });
    setSessionCookie(reply, config, token);
    // Someone else's code may be what just worked, so the owner hears about it. A brand-new account has nobody to tell.
    if (!user.firstSignIn) {
      const device = deviceLabel(request.headers['user-agent']);
      ctx.background.run(request.log, 'signin_notice', () => ctx.mailer.send(newSignInNotice(emailOf(keys, user), device)));
    }
    return toMe(keys, user);
  });

  // Reachable with an expired session: signing out must always succeed and clear the cookie.
  app.post('/auth/logout', async (request, reply) => {
    parse(emptyBody, request.body);
    const auth = await lookupSession(ctx, request.cookies[config.cookie.name]);
    if (auth) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM app.sessions WHERE id = ${auth.sessionId}::uuid AND user_id = ${auth.user.id}::uuid`;
        await audit(tx, keys, 'logout', auth.user.id);
      });
    }
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });

  app.post('/auth/logout-all', { preHandler: hooks.requireAuth }, async (request, reply) => {
    parse(emptyBody, request.body);
    const { user } = authOf(request);
    await sql.begin(async (tx) => {
      await tx`DELETE FROM app.sessions WHERE user_id = ${user.id}::uuid`;
      await audit(tx, keys, 'logout_all', user.id);
    });
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });

  app.get('/auth/sessions', { preHandler: hooks.requireAuth }, async (request) => {
    const { user, sessionId } = authOf(request);
    const rows = await sql<{ id: string; device_label_ct: Buffer; created_at: Date; last_seen_at: Date }[]>`
      SELECT id, device_label_ct, created_at, last_seen_at FROM app.sessions
      WHERE user_id = ${user.id}::uuid
        AND absolute_expires_at > now()
        AND last_seen_at > now() - interval '30 days'
      ORDER BY last_seen_at DESC, id DESC
    `;
    const dek = dekFor(keys, user);
    const items: SessionInfo[] = rows.map((row) => ({
      id: row.id,
      deviceLabel: openText(dek, row.device_label_ct, 'sessions.device_label', row.id, user.id),
      createdAt: row.created_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      current: row.id === sessionId,
    }));
    return { items };
  });

  app.delete('/auth/sessions/:id', { preHandler: hooks.requireAuth }, async (request, reply) => {
    const { user, sessionId } = authOf(request);
    const id = idParam(request.params);
    const removed = await sql.begin(async (tx) => {
      const result = await tx`DELETE FROM app.sessions WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid`;
      if (result.count > 0) await audit(tx, keys, 'session_revoke', user.id);
      return result.count;
    });
    if (removed === 0) throw notFound();
    if (id === sessionId) clearSessionCookie(reply, config);
    return reply.code(204).send();
  });
}
