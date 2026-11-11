import { randomUUID } from 'node:crypto';
import { pageQuery, reflectionCreateBody, type Reflection, type ReflectionAnswer } from '@anxiocare/shared';
import type { FastifyInstance } from 'fastify';
import { authOf, type authHooks } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { openJson, sealJson } from '../crypto.ts';
import { conflict, fieldError, notFound } from '../errors.ts';
import { dekFor } from '../users.ts';
import { decodeCursor, idParam, page, parse } from '../validate.ts';

const FIELD = 'reflections.payload';
export const REFLECTION_MAX_ROWS = 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Phones run slightly fast. Within this margin the time is clamped to now, so nothing future is stored. */
const CLOCK_SKEW_MS = 60 * 1000;

export interface ReflectionRow {
  id: string;
  taken_at: Date;
  payload_ct: Buffer;
}

/** Question ids and numbers, and the note if there is one. Never question text. */
interface Payload {
  answers: ReflectionAnswer[];
  note?: string;
}

export function reflectionFromRow(dek: Buffer, userId: string, row: ReflectionRow): Reflection {
  const payload = openJson<Payload>(dek, row.payload_ct, FIELD, row.id, userId);
  return { id: row.id, takenAt: row.taken_at.toISOString(), answers: payload.answers, ...(payload.note ? { note: payload.note } : {}) };
}

function resolveTakenAt(raw: string | undefined): Date {
  const now = Date.now();
  if (raw === undefined) return new Date(now);
  const at = new Date(raw).getTime();
  if (at > now + CLOCK_SKEW_MS) throw fieldError('takenAt', 'must not be in the future');
  if (at < now - MAX_AGE_MS) throw fieldError('takenAt', 'must be within the last 24 hours');
  return new Date(Math.min(at, now));
}

export function reflectionRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const guarded = { preHandler: [hooks.requireAuth, hooks.requireConsent] };

  app.get('/reflections', guarded, async (request) => {
    const { user } = authOf(request);
    const { cursor, limit } = parse(pageQuery, request.query);
    const after = decodeCursor(cursor);
    const rows = await sql<ReflectionRow[]>`
      SELECT id, taken_at, payload_ct FROM app.reflections
      WHERE user_id = ${user.id}::uuid
        ${after ? sql`AND (taken_at, id) < (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
      ORDER BY taken_at DESC, id DESC
      LIMIT ${limit + 1}
    `;
    const dek = dekFor(keys, user);
    return page(rows, limit, (row) => reflectionFromRow(dek, user.id, row), (row) => [row.taken_at, row.id]);
  });

  app.post('/reflections', { ...guarded, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { user } = authOf(request);
    const body = parse(reflectionCreateBody, request.body);
    const dek = dekFor(keys, user);

    const findExisting = async () => {
      const [row] = await sql<ReflectionRow[]>`
        SELECT id, taken_at, payload_ct FROM app.reflections
        WHERE user_id = ${user.id}::uuid AND client_request_id = ${body.clientRequestId}::uuid
      `;
      return row;
    };

    // A replay answers before the other checks: a retry must find its original row, even if a question retired since.
    const replay = await findExisting();
    if (replay) return reply.code(200).send(reflectionFromRow(dek, user.id, replay));

    // Every id must be a reflection question in the catalogue that is still being asked. The message names no id.
    const ids = body.answers.map((answer) => answer.q);
    const [known] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM app.questions WHERE id IN ${sql(ids)} AND type = 'reflection' AND active
    `;
    if ((known?.n ?? 0) !== ids.length) throw fieldError('answers', 'must be different reflection questions that are in use');

    const takenAt = resolveTakenAt(body.takenAt);
    const payload: Payload = { answers: body.answers.map(({ q, a }) => ({ q, a })), ...(body.note ? { note: body.note } : {}) };
    const id = randomUUID();
    const [created] = await sql.begin(async (tx) => {
      // The lock makes count-then-insert one step, so parallel writes cannot pass the cap.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`reflection-cap:${user.id}`}::text, 0))`;
      const [held] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM app.reflections WHERE user_id = ${user.id}::uuid`;
      if ((held?.n ?? 0) >= REFLECTION_MAX_ROWS) {
        throw conflict(`You've reached the limit of ${REFLECTION_MAX_ROWS.toLocaleString('en-IN')} saved reflections. Delete some older ones in Trends to make room. You can download your data from Settings first.`);
      }
      return tx<ReflectionRow[]>`
        INSERT INTO app.reflections (id, user_id, client_request_id, taken_at, payload_ct)
        VALUES (${id}::uuid, ${user.id}::uuid, ${body.clientRequestId}::uuid, ${takenAt}::timestamptz,
                ${sealJson(dek, payload, FIELD, id, user.id)})
        ON CONFLICT (user_id, client_request_id) DO NOTHING
        RETURNING id, taken_at, payload_ct
      `;
    });
    if (created) return reply.code(201).send(reflectionFromRow(dek, user.id, created));

    const winner = await findExisting();
    if (!winner) throw new Error('reflection row vanished');
    return reply.code(200).send(reflectionFromRow(dek, user.id, winner));
  });

  app.get('/reflections/:id', guarded, async (request) => {
    const { user } = authOf(request);
    const id = idParam(request.params);
    const [row] = await sql<ReflectionRow[]>`
      SELECT id, taken_at, payload_ct FROM app.reflections WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
    `;
    if (!row) throw notFound();
    return reflectionFromRow(dekFor(keys, user), user.id, row);
  });

  app.delete('/reflections/:id', guarded, async (request, reply) => {
    const { user } = authOf(request);
    const id = idParam(request.params);
    const result = await sql`DELETE FROM app.reflections WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid`;
    if (result.count === 0) throw notFound();
    return reply.code(204).send();
  });
}
