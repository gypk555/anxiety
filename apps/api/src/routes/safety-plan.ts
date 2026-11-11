import { safetyPlanBody, type SafetyPlan, type SafetyPlanSaved } from '@anxiocare/shared';
import type { FastifyInstance } from 'fastify';
import { authOf, type authHooks } from '../auth.ts';
import type { Ctx } from '../context.ts';
import { openJson, sealJson } from '../crypto.ts';
import { notFound } from '../errors.ts';
import { dekFor } from '../users.ts';
import { parse } from '../validate.ts';

const FIELD = 'safety_plans.payload';

export interface SafetyPlanRow {
  updated_at: Date;
  payload_ct: Buffer;
}

/** One plan per person, so the row id in the AAD is the person's id. */
export function safetyPlanFromRow(dek: Buffer, userId: string, row: SafetyPlanRow): SafetyPlanSaved {
  return { ...openJson<SafetyPlan>(dek, row.payload_ct, FIELD, userId, userId), updatedAt: row.updated_at.toISOString() };
}

export function safetyPlanRoutes(app: FastifyInstance, ctx: Ctx, hooks: ReturnType<typeof authHooks>) {
  const { config, sql } = ctx;
  const { keys } = config;
  const guarded = { preHandler: [hooks.requireAuth, hooks.requireConsent] };
  const writeLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };

  app.get('/safety-plan', guarded, async (request) => {
    const { user } = authOf(request);
    const [row] = await sql<SafetyPlanRow[]>`SELECT updated_at, payload_ct FROM app.safety_plans WHERE user_id = ${user.id}::uuid`;
    if (!row) throw notFound();
    return safetyPlanFromRow(dekFor(keys, user), user.id, row);
  });

  app.put('/safety-plan', { ...guarded, ...writeLimit }, async (request) => {
    const { user } = authOf(request);
    const body = parse(safetyPlanBody, request.body);
    const dek = dekFor(keys, user);
    const sealed = sealJson(dek, body, FIELD, user.id, user.id);
    const [row] = await sql<SafetyPlanRow[]>`
      INSERT INTO app.safety_plans (user_id, payload_ct) VALUES (${user.id}::uuid, ${sealed})
      ON CONFLICT (user_id) DO UPDATE SET payload_ct = EXCLUDED.payload_ct, updated_at = now()
      RETURNING updated_at, payload_ct
    `;
    return safetyPlanFromRow(dek, user.id, row!);
  });

  app.delete('/safety-plan', guarded, async (request, reply) => {
    const { user } = authOf(request);
    const result = await sql`DELETE FROM app.safety_plans WHERE user_id = ${user.id}::uuid`;
    if (result.count === 0) throw notFound();
    return reply.code(204).send();
  });
}
