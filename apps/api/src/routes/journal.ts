import { randomUUID } from 'node:crypto';
import { journalBody, pageQuery, type JournalEntry, type JournalInput } from '@anxiocare/shared';
import type { FastifyInstance } from 'fastify';
import { authOf, type authHooks } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { openJson, sealJson } from '../crypto.ts';
import { conflict, notFound } from '../errors.ts';
import { dekFor } from '../users.ts';
import { decodeCursor, idParam, page, parse } from '../validate.ts';

const FIELD = 'journal_entries.payload';
export const JOURNAL_MAX_ENTRIES = 2000;

export interface JournalRow {
  id: string;
  created_at: Date;
  updated_at: Date;
  payload_ct: Buffer;
}

export function journalFromRow(dek: Buffer, userId: string, row: JournalRow): JournalEntry {
  return {
    ...openJson<JournalInput>(dek, row.payload_ct, FIELD, row.id, userId),
    id: row.id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function journalRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const guarded = { preHandler: [hooks.requireAuth, hooks.requireConsent] };
  const writeLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/journal', guarded, async (request) => {
    const { user } = authOf(request);
    const { cursor, limit } = parse(pageQuery, request.query);
    const after = decodeCursor(cursor);
    const rows = await sql<JournalRow[]>`
      SELECT id, created_at, updated_at, payload_ct FROM app.journal_entries
      WHERE user_id = ${user.id}::uuid
        ${after ? sql`AND (created_at, id) < (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    `;
    const dek = dekFor(keys, user);
    return page(rows, limit, (row) => journalFromRow(dek, user.id, row), (row) => [row.created_at, row.id]);
  });

  app.post('/journal', { ...guarded, ...writeLimit }, async (request, reply) => {
    const { user } = authOf(request);
    const body = parse(journalBody, request.body);
    const id = randomUUID();
    const [row] = await sql.begin(async (tx) => {
      // The lock makes count-then-insert one step, so parallel writes cannot pass the cap.
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`journal-cap:${user.id}`}::text, 0))`;
      const [held] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM app.journal_entries WHERE user_id = ${user.id}::uuid`;
      if ((held?.n ?? 0) >= JOURNAL_MAX_ENTRIES) {
        throw conflict(`You've reached the limit of ${JOURNAL_MAX_ENTRIES.toLocaleString('en-IN')} thought records. Delete some older ones to make room. You can download your data from Settings first.`);
      }
      return tx<JournalRow[]>`
        INSERT INTO app.journal_entries (id, user_id, payload_ct)
        VALUES (${id}::uuid, ${user.id}::uuid, ${sealJson(dekFor(keys, user), body, FIELD, id, user.id)})
        RETURNING id, created_at, updated_at, payload_ct
      `;
    });
    return reply.code(201).send(journalFromRow(dekFor(keys, user), user.id, row!));
  });

  app.get('/journal/:id', guarded, async (request) => {
    const { user } = authOf(request);
    const id = idParam(request.params);
    const [row] = await sql<JournalRow[]>`
      SELECT id, created_at, updated_at, payload_ct FROM app.journal_entries WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
    `;
    if (!row) throw notFound();
    return journalFromRow(dekFor(keys, user), user.id, row);
  });

  app.patch('/journal/:id', { ...guarded, ...writeLimit }, async (request) => {
    const { user } = authOf(request);
    const id = idParam(request.params);
    const body = parse(journalBody, request.body);
    const dek = dekFor(keys, user);
    const [row] = await sql<JournalRow[]>`
      UPDATE app.journal_entries SET payload_ct = ${sealJson(dek, body, FIELD, id, user.id)}, updated_at = now()
      WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
      RETURNING id, created_at, updated_at, payload_ct
    `;
    if (!row) throw notFound();
    return journalFromRow(dek, user.id, row);
  });

  app.delete('/journal/:id', guarded, async (request, reply) => {
    const { user } = authOf(request);
    const id = idParam(request.params);
    const result = await sql`DELETE FROM app.journal_entries WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid`;
    if (result.count === 0) throw notFound();
    return reply.code(204).send();
  });
}
