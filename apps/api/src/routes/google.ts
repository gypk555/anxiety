import { safeNext, withNext } from '@anxiocare/shared';
import { z } from 'zod';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { audit } from '../audit.ts';
import { authOf, createSession, requireRecentReauth, setSessionCookie, type authHooks } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { constantTimeEqual, emailBlindIndex, googleSubjectHmac, sealText, sha256 } from '../crypto.ts';
import { deviceLabel } from '../device.ts';
import { rememberDevice } from '../devices.ts';
import { notFound } from '../errors.ts';
import {
  authorizeUrl,
  GoogleClient,
  GoogleRejected,
  OAUTH_STATE_MINUTES,
  openOauthState,
  randomToken,
  sealOauthState,
  type GoogleClaims,
  type GoogleRefusal,
  type OauthState,
} from '../google.ts';
import { googleLinkedNotice, googleUnlinkedNotice, newSignInNotice } from '../mail.ts';
import { emailOf, hasCurrentConsent, type UserRow } from '../users.ts';
import { emptyBody, parse } from '../validate.ts';

const callbackQuery = z.object({ state: z.string().max(512), code: z.string().max(4096) });
const startQuery = z.object({ next: z.string().optional() });

const rejectedPath = (refusal: GoogleRefusal, next: string) => (next === '/' ? `/sign-in?error=${refusal}` : `/sign-in?error=${refusal}&next=${encodeURIComponent(next)}`);

/** Where Settings learns how a connect went. A fixed word, nothing from the provider. */
type ConnectOutcome = 'connected' | 'taken' | 'failed';
const connectPath = (outcome: ConnectOutcome) => `/settings?google=${outcome}`;

/** Addresses Google itself hosts. Any other address could belong to a Google account its owner never made. */
const GOOGLE_HOSTED = new Set(['gmail.com', 'googlemail.com']);

/**
 * A new account from Google only when Google is the address's own provider: a Gmail address, or a Workspace account,
 * which carries `hd`. A Google account can be made for any address, so for anything else Google's word that the
 * address is verified is not enough to start an account in its name.
 */
export function mayCreateFromGoogle(claims: GoogleClaims): boolean {
  const domain = claims.email.slice(claims.email.lastIndexOf('@') + 1).toLowerCase();
  return GOOGLE_HOSTED.has(domain) || claims.hd !== null;
}

type SignInOutcome = { user: UserRow; kind: 'returning' | 'created' };

/**
 * Sign-in finds an account by its Google subject only. It never links by address: a Google account can be created for
 * any address, and an address can change hands, so matching one would hand the account to whoever holds that Google
 * login. A person links Google from Settings, signed in, instead. With no account for the subject and none for the
 * address, a new account is made, if `mayCreateFromGoogle` allows it.
 */
async function resolveSignIn(ctx: Ctx, claims: GoogleClaims): Promise<SignInOutcome> {
  const { sql, config } = ctx;
  const { keys } = config;
  const subjectHmac = googleSubjectHmac(keys, claims.sub);
  const bySubject = async () => {
    const [row] = await sql<UserRow[]>`
      SELECT u.* FROM app.user_identities i JOIN app.users u ON u.id = i.user_id
      WHERE i.provider = 'google' AND i.subject_hmac = ${subjectHmac}
    `;
    return row;
  };
  const known = await bySubject();
  if (known) return { user: known, kind: 'returning' };

  const emailHash = emailBlindIndex(keys, claims.email);
  const [existing] = await sql`SELECT 1 FROM app.users WHERE email_hash = ${emailHash}`;
  if (existing) throw new GoogleRejected('account_exists_unlinked', 'google_link');
  if (!mayCreateFromGoogle(claims)) throw new GoogleRejected('address_not_google_hosted', 'google_new');

  const id = randomUUID();
  const dek = keys.ring.generateDataKey();
  const { wrapped, version } = keys.ring.wrap(dek, id);
  const emailCt = sealText(dek, claims.email, 'users.email', id, id);
  const created = await sql.begin(async (tx) => {
    const [user] = await tx<UserRow[]>`
      INSERT INTO app.users (id, email_hash, email_ct, wrapped_dek, dek_key_version)
      VALUES (${id}::uuid, ${emailHash}, ${emailCt}, ${wrapped}, ${version})
      ON CONFLICT (email_hash) DO NOTHING
      RETURNING *
    `;
    if (!user) return 'address_taken' as const;
    const linked = await tx`
      INSERT INTO app.user_identities (user_id, provider, subject_hmac) VALUES (${id}::uuid, 'google', ${subjectHmac})
      ON CONFLICT DO NOTHING RETURNING user_id
    `;
    // Another tab won the race for this same subject: undo this account and use that one.
    if (linked.length === 0) throw new SubjectRaced();
    return user;
  }).catch((err: unknown) => {
    if (err instanceof SubjectRaced) return 'raced' as const;
    throw err;
  });
  if (created === 'address_taken') throw new GoogleRejected('account_exists_unlinked', 'google_link');
  if (created === 'raced') {
    const raced = await bySubject();
    if (raced) return { user: raced, kind: 'returning' };
    throw new GoogleRejected('subject_race');
  }
  return { user: created, kind: 'created' };
}

class SubjectRaced extends Error {}

/**
 * Connect, from Settings: links this Google login to the account that started the flow, if that session still exists.
 * A subject already linked elsewhere, or an account that already has a different Google login, is refused.
 */
async function connect(ctx: Ctx, state: OauthState, claims: GoogleClaims): Promise<{ outcome: ConnectOutcome; user?: UserRow }> {
  const { sql, config } = ctx;
  const { keys } = config;
  if (!state.userId || !state.sessionId) return { outcome: 'failed' };
  const subjectHmac = googleSubjectHmac(keys, claims.sub);
  return sql.begin(async (tx) => {
    const [user] = await tx<UserRow[]>`
      SELECT u.* FROM app.sessions s JOIN app.users u ON u.id = s.user_id
      WHERE s.id = ${state.sessionId!}::uuid AND s.user_id = ${state.userId!}::uuid AND s.absolute_expires_at > now()
      FOR UPDATE OF u
    `;
    if (!user) return { outcome: 'failed' as const };
    const linked = await tx`
      INSERT INTO app.user_identities (user_id, provider, subject_hmac) VALUES (${user.id}::uuid, 'google', ${subjectHmac})
      ON CONFLICT DO NOTHING RETURNING user_id
    `;
    if (linked.length === 0) {
      const [mine] = await tx`SELECT 1 FROM app.user_identities WHERE user_id = ${user.id}::uuid AND provider = 'google' AND subject_hmac = ${subjectHmac}`;
      return { outcome: mine ? ('connected' as const) : ('taken' as const) };
    }
    await audit(tx, keys, 'google_link', user.id);
    return { outcome: 'connected' as const, user };
  });
}

export function googleRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const cookieName = config.cookie.secure ? '__Host-google-oauth' : 'google-oauth';
  // Lax, unlike the session: this cookie has to come back on the cross-site return from Google. It holds no authority
  // by itself: a connect state names a session, which must still exist when Google sends the person back.
  const cookieOptions = { path: '/', httpOnly: true, secure: config.cookie.secure, sameSite: 'lax' } as const;
  const client = config.google ? new GoogleClient(config.google) : null;

  const clearState = (reply: FastifyReply) => reply.clearCookie(cookieName, cookieOptions);
  const reject = (reply: FastifyReply, refusal: GoogleRefusal = 'google', next = '/') => {
    clearState(reply);
    return reply.redirect(rejectedPath(refusal, next), 302);
  };

  /** Seals a new state into the cookie and returns where to send the browser. */
  const begin = (reply: FastifyReply, extra: Pick<OauthState, 'next' | 'mode' | 'userId' | 'sessionId'>) => {
    const state = randomToken();
    const nonce = randomToken();
    const verifier = randomToken();
    reply.setCookie(cookieName, sealOauthState(keys, { state, nonce, verifier, expiresAt: Date.now() + OAUTH_STATE_MINUTES * 60_000, ...extra }), {
      ...cookieOptions,
      maxAge: OAUTH_STATE_MINUTES * 60,
    });
    return authorizeUrl(config.google!, { state, nonce, verifier });
  };

  app.get('/auth/google/start', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const next = safeNext(startQuery.safeParse(request.query).data?.next);
    if (!config.google) return reject(reply, 'google', next);
    return reply.redirect(begin(reply, { next, mode: 'signin' }), 302);
  });

  // A POST, so the CSRF checks apply and a cross-site page cannot start a link for someone. The browser then goes to the URL.
  app.post('/me/identities/google/connect', { preHandler: hooks.requireAuth, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    parse(emptyBody, request.body);
    const auth = authOf(request);
    if (!config.google) throw notFound();
    requireRecentReauth(auth);
    return { url: begin(reply, { next: '/settings', mode: 'connect', userId: auth.user.id, sessionId: auth.sessionId }) };
  });

  app.get('/auth/google/callback', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const stored = openOauthState(keys, request.cookies[cookieName]);
    const next = safeNext(stored?.next);
    const connecting = stored?.mode === 'connect';
    const fail = (refusal: GoogleRefusal) => {
      if (!connecting) return reject(reply, refusal, next);
      clearState(reply);
      return reply.redirect(connectPath('failed'), 302);
    };
    if (!config.google || !client) return fail('google');
    try {
      const query = callbackQuery.safeParse(request.query);
      // A person choosing Cancel arrives here too, with `error` and no code.
      if (!query.success) throw new GoogleRejected('callback_params');
      if (!stored || stored.expiresAt <= Date.now()) throw new GoogleRejected('state_missing_or_old');
      if (!constantTimeEqual(Buffer.from(stored.state), Buffer.from(query.data.state))) throw new GoogleRejected('state_mismatch');
      // The first use is the only use, even for someone holding the cookie and a fresh code.
      const fresh = await sql`
        INSERT INTO app.oauth_state_uses (state_hash, expires_at)
        VALUES (${sha256(stored.state)}, now() + make_interval(mins => ${OAUTH_STATE_MINUTES}::int))
        ON CONFLICT DO NOTHING
        RETURNING state_hash
      `;
      if (fresh.length === 0) throw new GoogleRejected('state_reused');

      const idToken = await client.exchangeCode(query.data.code, stored.verifier);
      const claims = await client.verifyIdToken(idToken, stored.nonce);

      if (stored.mode === 'connect') {
        const { outcome, user } = await connect(ctx, stored, claims);
        clearState(reply);
        if (outcome !== 'connected') request.log.warn({ reason: `connect_${outcome}` }, 'google_connect_refused');
        if (user) ctx.background.run(request.log, 'google_link_notice', () => ctx.mailer.send(googleLinkedNotice(emailOf(keys, user))));
        return reply.redirect(connectPath(outcome), 302);
      }

      const { user, kind } = await resolveSignIn(ctx, claims);
      const token = await sql.begin(async (tx) => {
        // Not a re-authentication: connecting or disconnecting Google afterwards still asks for a password or a code.
        const created = await createSession(tx, keys, user, request.headers['user-agent']);
        await rememberDevice(tx, config, request, reply, user.id);
        await audit(tx, keys, 'login', user.id);
        if (kind === 'created') await audit(tx, keys, 'google_link', user.id);
        return created;
      });
      clearState(reply);
      setSessionCookie(reply, config, token);
      if (kind === 'returning') {
        const device = deviceLabel(request.headers['user-agent']);
        ctx.background.run(request.log, 'signin_notice', () => ctx.mailer.send(newSignInNotice(emailOf(keys, user), device)));
      }
      // Consent first. Google is never asked for a name, so an account without one is asked for it next, here. Then
      // the optional About you, once. The app does the same after the consent and name screens.
      const to = !hasCurrentConsent(user) ? withNext('/consent', next)
        : !user.display_name_ct ? withNext('/name', next)
        : !user.about_seen_at ? withNext('/about-you', next)
        : next;
      return reply.redirect(to, 302);
    } catch (err) {
      if (!(err instanceof GoogleRejected)) throw err;
      // A word from a fixed vocabulary. Nothing from the token, the provider or the URL.
      request.log.warn({ reason: err.reason }, 'google_signin_rejected');
      return fail(err.refusal);
    }
  });

  // No password needed: email codes always remain, so disconnecting can never leave an account with no way in.
  app.delete('/me/identities/google', { preHandler: hooks.requireAuth }, async (request, reply) => {
    const auth = authOf(request);
    const { user } = auth;
    requireRecentReauth(auth);
    const removed = await sql.begin(async (tx) => {
      const result = await tx`DELETE FROM app.user_identities WHERE user_id = ${user.id}::uuid AND provider = 'google'`;
      if (result.count > 0) await audit(tx, keys, 'google_unlink', user.id);
      return result.count;
    });
    if (removed === 0) throw notFound();
    ctx.background.run(request.log, 'google_unlink_notice', () => ctx.mailer.send(googleUnlinkedNotice(emailOf(keys, user))));
    return reply.code(204).send();
  });
}

