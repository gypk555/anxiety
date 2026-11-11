import { dayParam, moodBody, moodDayAllowedOnServer, moodRangeQuery, type MoodEntry, type MoodInput } from '@anxiocare/shared';
import type { FastifyInstance } from 'fastify';
import { authOf, type authHooks } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { openJson, sealJson } from '../crypto.ts';
import { fieldError, notFound } from '../errors.ts';
import { dekFor } from '../users.ts';
import { parse } from '../validate.ts';

const FIELD = 'mood_entries.payload';

export interface MoodRow {
  day: string;
  created_at: Date;
  updated_at: Date;
  payload_ct: Buffer;
}

/** The day is the row's id in the AAD, so a ciphertext moved to another day of the same person fails to open. */
export function moodFromRow(dek: Buffer, userId: string, row: MoodRow): MoodEntry {
  return {
    ...openJson<MoodInput>(dek, row.payload_ct, FIELD, row.day, userId),
    day: row.day,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Not a real date is a bad request, not a missing row: the client built it, and should hear so. */
function dayOf(params: unknown): string {
  const day = dayParam.safeParse((params as { day?: unknown }).day);
  if (!day.success) throw fieldError('day', 'must be a date as YYYY-MM-DD');
  return day.data;
}

export function moodRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const guarded = { preHandler: [hooks.requireAuth, hooks.requireConsent] };
  const writeLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/moods', guarded, async (request) => {
    const { user } = authOf(request);
    const { from, to } = parse(moodRangeQuery, request.query);
    const rows = await sql<MoodRow[]>`
      SELECT day::text AS day, created_at, updated_at, payload_ct FROM app.mood_entries
      WHERE user_id = ${user.id}::uuid AND day BETWEEN ${from}::date AND ${to}::date
      ORDER BY day
    `;
    const dek = dekFor(keys, user);
    return { items: rows.map((row) => moodFromRow(dek, user.id, row)) };
  });

  app.put('/moods/:day', { ...guarded, ...writeLimit }, async (request) => {
    const { user } = authOf(request);
    const day = dayOf(request.params);
    if (!moodDayAllowedOnServer(day)) throw fieldError('day', 'must not be in the future, or more than 366 days ago');
    const body = parse(moodBody, request.body);
    const dek = dekFor(keys, user);
    const sealed = sealJson(dek, body, FIELD, day, user.id);
    const [row] = await sql<MoodRow[]>`
      INSERT INTO app.mood_entries (user_id, day, payload_ct) VALUES (${user.id}::uuid, ${day}::date, ${sealed})
      ON CONFLICT (user_id, day) DO UPDATE SET payload_ct = EXCLUDED.payload_ct, updated_at = now()
      RETURNING day::text AS day, created_at, updated_at, payload_ct
    `;
    return moodFromRow(dek, user.id, row!);
  });

  app.delete('/moods/:day', guarded, async (request, reply) => {
    const { user } = authOf(request);
    const day = dayOf(request.params);
    const result = await sql`DELETE FROM app.mood_entries WHERE user_id = ${user.id}::uuid AND day = ${day}::date`;
    if (result.count === 0) throw notFound();
    return reply.code(204).send();
  });
}
