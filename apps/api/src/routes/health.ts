import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.ts';

export function healthRoutes(app: FastifyInstance, ctx: Ctx) {
  // Health checks must keep answering under load, so liveness has no rate limit and touches nothing.
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  app.get('/readyz', async (request, reply) => {
    try {
      await ctx.sql`SELECT 1`;
      return { status: 'ok' };
    } catch (err) {
      request.log.error({ err }, 'readiness_check_failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
