import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { CONSENT_VERSION, CSRF_HEADER, CSRF_HEADER_VALUE } from '@anxiocare/shared';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import { authHooks } from './auth.ts';
import { Background } from './background.ts';
import { classifyIp, clientKey, resolveClient } from './client-ip.ts';
import type { Config } from './config.ts';
import type { Ctx } from './context.ts';
import { DecryptError } from './crypto.ts';
import type { Sql } from './db.ts';
import { ApiError, problem } from './errors.ts';
import { createLogger } from './logger.ts';
import type { Mailer } from './mail.ts';
import { Passwords } from './passwords.ts';
import { accountRoutes } from './routes/accounts.ts';
import { assessmentRoutes } from './routes/assessments.ts';
import { authRoutes } from './routes/auth.ts';
import { googleRoutes } from './routes/google.ts';
import { healthRoutes } from './routes/health.ts';
import { journalRoutes } from './routes/journal.ts';
import { meRoutes } from './routes/me.ts';
import { isApiPath, registerStatic } from './static.ts';

const BODY_LIMIT = 64 * 1024;
const API_RATE_LIMIT = 600;
/**
 * A first visit fetches about 60 files, because the service worker precaches the app so Help works
 * offline. Many people in India share one carrier NAT address, so files get their own, larger budget:
 * a busy address must not get a 429 for a script or lose offline Help, and must not spend the API's budget.
 */
const WEB_RATE_LIMIT = 6000;
const PERMISSIONS_POLICY = 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()';

export interface AppDeps {
  config: Config;
  sql: Sql;
  mailer: Mailer;
  /** Destination for logs. Tests capture it to prove what is never logged. */
  logStream?: DestinationStream;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Resolves when deferred work (mail delivery) has finished. */
    drainBackground(): Promise<void>;
    passwords: Passwords;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, sql, mailer } = deps;
  const background = new Background();
  const passwords = new Passwords(config.keys.passwordPepper, config.passwordHash);
  await passwords.ready();
  const ctx: Ctx = { config, sql, mailer, background, passwords };

  const app = Fastify({
    loggerInstance: createLogger(config.logLevel, deps.logStream),
    // Fastify's own request logs contain URLs and client addresses. The hook below replaces them.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: BODY_LIMIT,
    // A function, because this Fastify treats a bare number as "trust nothing". Hop 0 is the socket peer,
    // so the client is the entry just beyond the configured number of proxies, whatever else it sent.
    trustProxy: (_address, hop) => hop < config.trustProxyHops,
    genReqId: () => randomUUID(),
    forceCloseConnections: 'idle',
  }) as unknown as FastifyInstance;

  app.decorate('drainBackground', () => background.drain());
  app.decorate('passwords', passwords);
  app.decorateRequest('auth', null);

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });

  // The deploy-time self-check: one line for each distinct pattern of client address headers, never an address.
  // Health probes come from the platform and say nothing about real clients.
  const seenClientKinds = new Set<string>();
  const kindOf = (value: string) => (isIP(value.replace(/^::ffff:/, '')) ? classifyIp(value) : 'not an address');
  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?', 1)[0];
    if (path === '/healthz' || path === '/readyz') return;
    const { ip, source } = resolveClient(request, config.clientIpHeader);
    const kind = `${classifyIp(ip)} via ${source}`;
    // What the platform delivers, to choose the right setting: which candidate headers are present, and the kind
    // of each X-Forwarded-For entry, left to right. Never an address. One line per distinct pattern, so a platform
    // probe with no headers does not hide what real browser traffic looks like.
    const present = ['cf-connecting-ip', 'true-client-ip', 'x-real-ip', 'x-forwarded-for', 'forwarded', 'cf-ray']
      .filter((name) => request.headers[name] !== undefined);
    const forwarded = String(request.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(kindOf);
    const pattern = `${kind}|${present.join(',')}|${forwarded.join(',')}`;
    if (seenClientKinds.has(pattern) || seenClientKinds.size >= 12) return;
    seenClientKinds.add(pattern);
    request.log.info({ clientIpHeaders: present, forwardedFor: forwarded, socket: kindOf(request.socket.remoteAddress ?? '') }, `client ip resolved: ${kind}`);
  });

  // Secure by default: only the static handler relaxes caching, for files it actually serves.
  app.addHook('onRequest', async (request, reply) => {
    // no-transform: nothing here compresses API answers, and the edge is asked not to either. They hold personal
    // data, and a compressed length can leak it (BREACH), so only static files are compressed. See static.ts.
    reply.header('cache-control', isApiPath(request.url) ? 'no-store, no-transform' : 'no-store');
    reply.header('permissions-policy', PERMISSIONS_POLICY);
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    xFrameOptions: { action: 'deny' },
  });

  await app.register(cookie);

  // CSRF: SameSite=Strict on the cookie, plus these two checks on anything that is not a safe method.
  app.addHook('onRequest', async (request) => {
    if (request.method === 'GET' || request.method === 'HEAD') return;
    const origin = request.headers.origin;
    if (!origin || !config.allowedOrigins.has(origin) || request.headers[CSRF_HEADER] !== CSRF_HEADER_VALUE) {
      throw new ApiError(403, 'csrf_failed');
    }
  });

  // In-memory and per instance. See apps/api/README.md for what that means with several instances.
  await app.register(rateLimit, {
    global: true,
    max: (request) => (isApiPath(request.url) ? API_RATE_LIMIT : WEB_RATE_LIMIT),
    timeWindow: '1 minute',
    cache: 20_000,
    hook: 'onRequest',
    keyGenerator: (request) => `${isApiPath(request.url) ? 'api' : 'web'}:${clientKey(request, config.clientIpHeader)}`,
    errorResponseBuilder: () => new ApiError(429, 'rate_limited'),
  });

  app.removeContentTypeParser('text/plain');
  // Same safe parser Fastify uses by default, except that an empty body is simply no body:
  // logout and similar POSTs may arrive with a JSON content type and nothing else.
  const defaultJson = app.getDefaultJsonParser('error', 'error');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    if (body === '') done(null, undefined);
    else defaultJson(request, body as string, done);
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ApiError) {
      return reply
        .code(error.statusCode)
        .type('application/problem+json')
        .send(problem(error.statusCode, error.code, request.id, error.fieldErrors, error.detail));
    }
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      // Framework rejections: bad JSON, too large, unsupported media type, malformed URL.
      return reply.code(status).type('application/problem+json').send(problem(status, 'validation_failed', request.id));
    }
    if (error instanceof DecryptError) request.log.error('decrypt_failed');
    else request.log.error({ err: error }, 'request_failed');
    return reply.code(500).type('application/problem+json').send(problem(500, 'internal_error', request.id));
  });

  const hooks = authHooks(ctx);

  await app.register(
    async (api) => {
      authRoutes(api, ctx, hooks);
      accountRoutes(api, ctx, hooks);
      googleRoutes(api, ctx, hooks);
      meRoutes(api, ctx, hooks);
      assessmentRoutes(api, ctx, hooks);
      journalRoutes(api, ctx, hooks);
      api.get('/meta', async () => ({
        operatorName: config.operatorName,
        grievanceEmail: config.grievanceEmail,
        consentVersion: CONSENT_VERSION,
        ...config.disclosure,
        googleEnabled: config.google !== null,
      }));
    },
    { prefix: '/api/v1' },
  );

  healthRoutes(app, ctx);

  const spaFallback = await registerStatic(app, config.webDist);

  app.setNotFoundHandler(
    { preHandler: app.rateLimit() },
    (request, reply) => {
      if (spaFallback(request, reply)) return reply;
      return reply.code(404).type('application/problem+json').send(problem(404, 'not_found', request.id));
    },
  );

  app.addHook('onClose', async () => {
    await background.drain();
  });

  return app;
}
