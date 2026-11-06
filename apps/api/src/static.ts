import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const IMMUTABLE = 'public, max-age=31536000, immutable';

export const isApiPath = (url: string) => {
  const path = url.split('?', 1)[0]!;
  return path === '/api' || path.startsWith('/api/');
};

/**
 * Serves the built SPA if there is one. The directory may not exist while developing the API,
 * or may appear after boot, so its presence is checked per request rather than at startup.
 */
export async function registerStatic(app: FastifyInstance, root: string) {
  await app.register(fastifyStatic, {
    root,
    wildcard: true,
    index: 'index.html',
    redirect: false,
    list: false,
    // Serves the .br and .gz that apps/web/scripts/precompress.mjs leaves beside each file, and sends
    // Vary: accept-encoding whichever it picks. Fixed files, built once, holding no user data or secrets.
    preCompressed: true,
    dotfiles: 'ignore',
    cacheControl: false,
    // A missing dist is a normal state here, not worth a warning.
    ...{ suppressWarning: true },
    setHeaders(reply, path) {
      const inAssets = relative(root, path).split(sep)[0] === 'assets';
      // Only content-hashed files may be cached for good. index.html, sw.js, the manifest and
      // anything else with a stable name must revalidate so updates reach people.
      reply.header('cache-control', inAssets ? IMMUTABLE : 'no-cache');
    },
  });

  // The plugin's wildcard route answers 404 to "/" when it picks a compressed copy, so the root is named here.
  app.get('/', (_request, reply) => reply.sendFile('index.html'));

  /** Returns true when the request was answered with the SPA shell. */
  return function spaFallback(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    const path = request.url.split('?', 1)[0]!;
    if (isApiPath(path) || path.startsWith('/assets/')) return false;
    // Only page navigations get the shell. A missing script or image must stay a real 404.
    const accept = request.headers.accept ?? '';
    const navigating = request.headers['sec-fetch-mode'] === 'navigate' || accept.includes('text/html');
    if (!navigating || !existsSync(join(root, 'index.html'))) return false;
    void reply.sendFile('index.html');
    return true;
  };
}
