import { randomUUID } from 'node:crypto';
import { assessmentCreateBody, pageQuery, scoreGad7, severityFor, type Assessment } from '@anxiocare/shared';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.ts';
import { authOf, requireRecentReauth, type authHooks } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { openJson, sealJson } from '../crypto.ts';
import { conflict, fieldError, notFound } from '../errors.ts';
import { dekFor } from '../users.ts';
import { decodeCursor, idParam, page, parse } from '../validate.ts';

const FIELD = 'assessments.payload';
export const ASSESSMENT_MAX_ROWS = 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Phones run slightly fast. Within this margin the time is clamped to now, so nothing future is stored. */
const CLOCK_SKEW_MS = 60 * 1000;

export interface AssessmentRow {
  id: string;
  taken_at: Date;
  payload_ct: Buffer;
}

type Payload = Pick<Assessment, 'answers' | 'difficulty' | 'score' | 'severity'>;

export function assessmentFromRow(dek: Buffer, userId: string, row: AssessmentRow): Assessment {
  const payload = openJson<Payload>(dek, row.payload_ct, FIELD, row.id, userId);
  return { id: row.id, takenAt: row.taken_at.toISOString(), ...payload };
}

function resolveTakenAt(raw: string | undefined): Date {
  const now = Date.now();
  if (raw === undefined) return new Date(now);
  const at = new Date(raw).getTime();
  if (at > now + CLOCK_SKEW_MS) throw fieldError('takenAt', 'must not be in the future');
  if (at < now - MAX_AGE_MS) throw fieldError('takenAt', 'must be within the last 24 hours');
  return new Date(Math.min(at, now));
}

export function assessmentRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const guarded = { preHandler: [hooks.requireAuth, hooks.requireConsent] };

  app.get('/assessments', guarded, async (request) => {
    const { user } = authOf(request);
    const { cursor, limit } = parse(pageQuery, request.query);
    const after = decodeCursor(cursor);
    const rows = await sql<AssessmentRow[]>`
      SELECT id, taken_at, payload_ct FROM app.assessments
      WHERE user_id = ${user.id}::uuid
        ${after ? sql`AND (taken_at, id) < (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
      ORDER BY taken_at DESC, id DESC
      LIMIT ${limit + 1}
    `;
    const dek = dekFor(keys, user);
    return page(rows, limit, (row) => assessmentFromRow(dek, user.id, row), (row) => [row.taken_at, row.id]);
  });

  // Every check-in at once: part of the right to erasure, so it needs no consent, like download and delete. Destructive,
  // so it needs a recent proof that it's them.
  app.delete('/assessments', { preHandler: hooks.requireAuth, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request) => {
    const auth = authOf(request);
    requireRecentReauth(auth);
    const deleted = await sql.begin(async (tx) => {
      const rows = await tx`DELETE FROM app.assessments WHERE user_id = ${auth.user.id}::uuid RETURNING 1`;
      await audit(tx, keys, 'assessments_delete', auth.user.id);
      return rows.length;
    });
    return { deleted };
  });

  app.post('/assessments', { ...guarded, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { user } = authOf(request);
    const body = parse(assessmentCreateBody, request.body);
    const dek = dekFor(keys, user);

    const findExisting = async () => {
      const [row] = await sql<AssessmentRow[]>`
        SELECT id, taken_at, payload_ct FROM app.assessments
        WHERE user_id = ${user.id}::uuid AND client_request_id = ${body.clientRequestId}::uuid
      `;
      return row;
    };

    // A replay answers before the age check: a retry a day later must still find its original row.
    const replay = await findExisting();
    if (replay) return reply.code(200).send(assessmentFromRow(dek, user.id, replay));

    const takenAt = resolveTakenAt(body.takenAt);
    const score = scoreGad7(body.answers);
    const payload: Payload = {
      answers: body.answers,
      difficulty: body.difficulty,
      score,
      severity: severityFor(score).severity,
    };
    const id = randomUUID();
    const [created] = await sql.begin(async (tx) => {
      // The lock makes count-then-insert one step, so parallel writes cannot pass the cap.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`assessment-cap:${user.id}`}::text, 0))`;
      const [held] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM app.assessments WHERE user_id = ${user.id}::uuid`;
      if ((held?.n ?? 0) >= ASSESSMENT_MAX_ROWS) {
        throw conflict(`You've reached the limit of ${ASSESSMENT_MAX_ROWS.toLocaleString('en-IN')} saved check-ins. Delete some older ones in Trends to make room. You can download your data from Settings first.`);
      }
      return tx<AssessmentRow[]>`
        INSERT INTO app.assessments (id, user_id, client_request_id, taken_at, payload_ct)
        VALUES (${id}::uuid, ${user.id}::uuid, ${body.clientRequestId}::uuid, ${takenAt}::timestamptz,
                ${sealJson(dek, payload, FIELD, id, user.id)})
        ON CONFLICT (user_id, client_request_id) DO NOTHING
        RETURNING id, taken_at, payload_ct
      `;
    });
    if (created) return reply.code(201).send(assessmentFromRow(dek, user.id, created));

    const winner = await findExisting();
    if (!winner) throw new Error('assessment row vanished');
    return reply.code(200).send(assessmentFromRow(dek, user.id, winner));
  });

  app.get('/assessments/:id', guarded, async (request) => {
    const { user } = authOf(request);
    const id = idParam(request.params);
    const [row] = await sql<AssessmentRow[]>`
      SELECT id, taken_at, payload_ct FROM app.assessments WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
    `;
    if (!row) throw notFound();
    return assessmentFromRow(dekFor(keys, user), user.id, row);
  });

  app.delete('/assessments/:id', guarded, async (request, reply) => {
    const { user } = authOf(request);
    const id = idParam(request.params);
    const result = await sql`DELETE FROM app.assessments WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid`;
    if (result.count === 0) throw notFound();
    return reply.code(204).send();
  });
}
