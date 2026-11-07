// Serves dist/ the way production will: spec CSP and security headers, SPA fallback.
// Used by the Playwright audit, to prove the build runs under the real CSP.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT ?? 4173);

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const isFile = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://local');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (pathname.startsWith('/api/')) {
    res.writeHead(503, { 'content-type': 'application/problem+json' });
    res.end(JSON.stringify({ type: 'about:blank', title: 'Unavailable', status: 503, code: 'internal_error' }));
    return;
  }
  const candidate = join(root, normalize(pathname));
  const path = candidate.startsWith(root) && isFile(candidate) ? candidate : join(root, 'index.html');
  res.setHeader('Content-Type', TYPES[extname(path)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  createReadStream(path).pipe(res);
}).listen(port, () => console.log(`serving dist with CSP on http://localhost:${port}`));
