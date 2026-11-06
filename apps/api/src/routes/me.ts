import {
  accountDeleteConfirmBody,
  consentBody,
  emailChangeRequestBody,
  emailChangeVerifyBody,
  profilePatchBody,
} from '@anxiocare/shared';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.ts';
import { authOf, clearSessionCookie, type authHooks } from '../auth.ts';
import { clientKey } from '../client-ip.ts';
import type { Ctx } from '../context.ts';
import { emailBlindIndex, openText, sealText } from '../crypto.ts';
import { ApiError, invalidCode } from '../errors.ts';
import { emailChangedNotice } from '../mail.ts';
import { consumeOtp, consumeOtps, deliverOtp, emailQuotaKey, otpTarget } from '../otp.ts';
import { dekFor, emailOf, loadUser, toMe } from '../users.ts';
import { emptyBody, parse } from '../validate.ts';
import { assessmentFromRow, type AssessmentRow } from './assessments.ts';
import { journalFromRow, type JournalRow } from './journal.ts';

const UNIQUE_VIOLATION = '23505';

export function meRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const signedIn = { preHandler: hooks.requireAuth };
  const consented = { preHandler: [hooks.requireAuth, hooks.requireConsent] };

  app.get('/me', signedIn, async (request) => toMe(keys, authOf(request).user));

  app.patch('/me', consented, async (request) => {
    const { user } = authOf(request);
    const { displayName } = parse(profilePatchBody, request.body);
    const value = displayName ? sealText(dekFor(keys, user), displayName, 'users.display_name', user.id, user.id) : null;
    await sql`UPDATE app.users SET display_name_ct = ${value}, updated_at = now() WHERE id = ${user.id}::uuid`;
    return toMe(keys, await loadUser(sql, user.id));
  });

  app.post('/me/consent', signedIn, async (request) => {
    const { user } = authOf(request);
    const body = parse(consentBody, request.body);
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO app.consents (user_id, version, adult_confirmed, health_data)
        VALUES (${user.id}::uuid, ${body.version}, ${body.adultConfirmed}, ${body.healthDataConsent})
        ON CONFLICT (user_id, version) DO NOTHING
      `;
      await tx`
        UPDATE app.users SET consent_version = ${body.version}, consent_at = now(), updated_at = now()
        WHERE id = ${user.id}::uuid
      `;
      await audit(tx, keys, 'consent', user.id);
    });
    return toMe(keys, await loadUser(sql, user.id));
  });

  app.post(
    '/me/email/request',
    { ...consented, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const { user } = authOf(request);
      const { newEmail } = parse(emailChangeRequestBody, request.body);
      // A session alone must not be enough to move an account, because a phone can be borrowed: the current
      // inbox has to agree too, and its code approves this new address only.
      // Same answer whether or not the address is taken. Only someone holding the codes learns that.
      const client = clientKey(request, config.clientIpHeader);
      const currentEmail = emailOf(keys, user);
      const newEmailHash = emailBlindIndex(keys, newEmail);
      ctx.background.run(request.log, 'otp_delivery', async () => {
        await deliverOtp(ctx, { purpose: 'email_change_current', email: currentEmail, subjectUserId: user.id, clientKey: client, binding: newEmailHash });
        await deliverOtp(ctx, { purpose: 'email_change', email: newEmail, subjectUserId: user.id, clientKey: client });
      });
      return reply.code(202).send();
    },
  );

  app.post(
    '/me/email/verify',
    { ...consented, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request) => {
      const { user, sessionId } = authOf(request);
      const { newEmail, currentCode, code } = parse(emailChangeVerifyBody, request.body);
      const emailHash = emailBlindIndex(keys, newEmail);
      const oldEmail = emailOf(keys, user);
      const ok = await consumeOtps(sql, keys, [
        { target: otpTarget(keys, 'email_change_current', oldEmail, user.id, emailHash), code: currentCode },
        { target: otpTarget(keys, 'email_change', newEmail, user.id), code },
      ]);
      if (!ok) throw invalidCode();

      const emailCt = sealText(dekFor(keys, user), newEmail, 'users.email', user.id, user.id);
      try {
        await sql.begin(async (tx) => {
          await tx`
            UPDATE app.users SET email_hash = ${emailHash}, email_ct = ${emailCt}, updated_at = now()
            WHERE id = ${user.id}::uuid
          `;
          // The sign-in identity changed: other devices must prove themselves again.
          await tx`DELETE FROM app.sessions WHERE user_id = ${user.id}::uuid AND id <> ${sessionId}::uuid`;
          await audit(tx, keys, 'email_change', user.id);
        });
      } catch (err) {
        if ((err as { code?: string }).code === UNIQUE_VIOLATION) throw new ApiError(409, 'conflict');
        throw err;
      }
      if (oldEmail !== newEmail) {
        ctx.background.run(request.log, 'email_change_notice', () => ctx.mailer.send(emailChangedNotice(oldEmail)));
      }
      return toMe(keys, await loadUser(sql, user.id));
    },
  );

  // Rights: reachable without consent, so nobody is locked out of their own data.
  app.get('/me/export', { ...signedIn, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const { user } = authOf(request);
    const dek = dekFor(keys, user);
    const [assessments, journal, sessions, consents] = await Promise.all([
      sql<AssessmentRow[]>`
        SELECT id, taken_at, payload_ct FROM app.assessments WHERE user_id = ${user.id}::uuid ORDER BY taken_at DESC, id DESC
      `,
      sql<JournalRow[]>`
        SELECT id, created_at, updated_at, payload_ct FROM app.journal_entries WHERE user_id = ${user.id}::uuid ORDER BY created_at DESC, id DESC
      `,
      sql<{ id: string; device_label_ct: Buffer; created_at: Date; last_seen_at: Date; absolute_expires_at: Date }[]>`
        SELECT id, device_label_ct, created_at, last_seen_at, absolute_expires_at
        FROM app.sessions WHERE user_id = ${user.id}::uuid ORDER BY created_at DESC
      `,
      sql<{ version: string; adult_confirmed: boolean; health_data: boolean; accepted_at: Date }[]>`
        SELECT version, adult_confirmed, health_data, accepted_at FROM app.consents WHERE user_id = ${user.id}::uuid ORDER BY accepted_at
      `,
    ]);
    const { consentRequired: _consentRequired, consentVersion: _consentVersion, acceptedConsentVersion: _accepted, ...account } = toMe(keys, user);
    const body = {
      exportedAt: new Date().toISOString(),
      account,
      consents: consents.map((c) => ({
        version: c.version,
        adultConfirmed: c.adult_confirmed,
        healthDataConsent: c.health_data,
        acceptedAt: c.accepted_at.toISOString(),
      })),
      assessments: assessments.map((row) => assessmentFromRow(dek, user.id, row)),
      journal: journal.map((row) => journalFromRow(dek, user.id, row)),
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceLabel: openText(dek, s.device_label_ct, 'sessions.device_label', s.id, user.id),
        createdAt: s.created_at.toISOString(),
        lastSeenAt: s.last_seen_at.toISOString(),
        expiresAt: s.absolute_expires_at.toISOString(),
      })),
    };
    await audit(sql, keys, 'export', user.id);
    const filename = `account-data-${body.exportedAt.slice(0, 10)}.json`;
    return reply
      .header('content-disposition', `attachment; filename="${filename}"`)
      .type('application/json')
      .send(JSON.stringify(body, null, 2));
  });

  app.post(
    '/me/delete/request',
    { ...signedIn, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      parse(emptyBody, request.body);
      const { user } = authOf(request);
      const email = emailOf(keys, user);
      const client = clientKey(request, config.clientIpHeader);
      ctx.background.run(request.log, 'otp_delivery', () =>
        deliverOtp(ctx, { purpose: 'account_delete', email, subjectUserId: user.id, clientKey: client }),
      );
      return reply.code(202).send();
    },
  );

  app.post(
    '/me/delete/confirm',
    { ...signedIn, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (request, reply) => {
      const { user } = authOf(request);
      const { code } = parse(accountDeleteConfirmBody, request.body);
      const email = emailOf(keys, user);
      if (!(await consumeOtp(sql, keys, otpTarget(keys, 'account_delete', email, user.id), code))) throw invalidCode();

      await sql.begin(async (tx) => {
        // Cascades remove sessions, consents, assessments, journal and the user's codes. The wrapped
        // data key goes with the row, so any stray copy of the ciphertext becomes unreadable.
        await tx`DELETE FROM app.users WHERE id = ${user.id}::uuid`;
        // Every spelling of the address, such as a +tag, shares the quota hash, and goes too.
        const quotaHash = emailQuotaKey(keys, email);
        await tx`DELETE FROM app.otp_codes WHERE email_hash = ${user.email_hash} OR quota_hash = ${quotaHash}`;
        await tx`DELETE FROM app.otp_failures WHERE quota_hash = ${quotaHash}`;
        await audit(tx, keys, 'account_delete', user.id);
      });
      clearSessionCookie(reply, config);
      return reply.code(204).send();
    },
  );

}
