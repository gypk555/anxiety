// Test only: a small OpenID Connect provider that behaves as Google does, and can misbehave on request. Nothing about
// it reaches production: the server refuses GOOGLE_OIDC_BASE_URL there. Run directly for e2e, imported by API tests.
//
//   node scripts/fake-oidc.ts [port]      prints nothing; GET /healthz when ready
//
// GET /authorize shows a form. A person, or a test, types an address and continues, as they would at Google.
import { createHash, createSign, generateKeyPairSync, createHmac, randomBytes, type KeyObject } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

export const FAKE_CLIENT_ID = 'fake-client-id.apps.googleusercontent.com';
export const FAKE_CLIENT_SECRET = 'fake-client-secret';

export interface TokenTweaks {
  email?: string;
  sub?: string;
  email_verified?: unknown;
  nonce?: string;
  aud?: unknown;
  azp?: string;
  iss?: string;
  exp?: number;
  iat?: number;
  /** A Workspace domain, as Google sends for an organisation's account. */
  hd?: string;
  omit?: string[];
  /** How the token is signed. `other-key` is a real signature by a key not in the JWKS. */
  signing?: 'rs256' | 'none' | 'hs256-with-public-key' | 'other-key' | 'unknown-kid' | 'tampered';
  /** What the token endpoint does. */
  token?: 'ok' | 'http-500' | 'not-json' | 'no-id-token' | 'huge';
}

interface PendingCode {
  redirectUri: string;
  clientId: string;
  challenge: string;
  nonce: string;
  tweaks: TokenTweaks;
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url');
const subFor = (email: string) => `sub-${createHash('sha256').update(email).digest('hex').slice(0, 24)}`;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export class FakeOidc {
  server: Server;
  port = 0;
  /** Every request's method and path, for proving what was called and what was not. */
  log: string[] = [];
  readonly #key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly #other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  readonly #kid = randomBytes(6).toString('hex');
  readonly #codes = new Map<string, PendingCode>();
  /** Used by the next approval. */
  nextTweaks: TokenTweaks = {};

  constructor() {
    this.server = createServer((req, res) => {
      void this.#handle(req, res).catch(() => {
        res.writeHead(500);
        res.end();
      });
    });
  }

  get base() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(port = 0): Promise<this> {
    await new Promise<void>((resolve) => this.server.listen(port, '127.0.0.1', resolve));
    this.port = (this.server.address() as { port: number }).port;
    return this;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise((resolve) => this.server.close(resolve));
  }

  /** What a person continuing at the provider ends up with: the redirect back. For tests that have no browser. */
  approve(authorizeUrl: string, tweaks: TokenTweaks = {}): string {
    const url = new URL(authorizeUrl);
    return this.#redirectBack(url.searchParams, tweaks);
  }

  #redirectBack(params: URLSearchParams, tweaks: TokenTweaks): string {
    const redirect = new URL(params.get('redirect_uri')!);
    const code = randomBytes(16).toString('hex');
    this.#codes.set(code, {
      redirectUri: params.get('redirect_uri')!,
      clientId: params.get('client_id')!,
      challenge: params.get('code_challenge')!,
      nonce: params.get('nonce')!,
      tweaks,
    });
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('state', params.get('state')!);
    redirect.searchParams.set('scope', 'email openid https://www.googleapis.com/auth/userinfo.email');
    return redirect.toString();
  }

  #idToken(pending: PendingCode): string {
    const t = pending.tweaks;
    const email = t.email ?? 'someone@example.com';
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {
      iss: t.iss ?? this.base,
      aud: t.aud ?? pending.clientId,
      azp: t.azp ?? pending.clientId,
      sub: t.sub ?? subFor(email),
      email,
      email_verified: 'email_verified' in t ? t.email_verified : true,
      nonce: t.nonce ?? pending.nonce,
      iat: t.iat ?? now,
      exp: t.exp ?? now + 3600,
      // Google only sends these for the profile scope. The server must ignore them if they ever appear.
      ...(t.hd ? { hd: t.hd } : {}),
      name: 'Should Not Be Stored',
      picture: 'https://example.com/should-not-be-stored.png',
    };
    for (const key of t.omit ?? []) delete claims[key];
    const signing = t.signing ?? 'rs256';
    const header = signing === 'none' ? { alg: 'none' } : signing === 'hs256-with-public-key' ? { alg: 'HS256', kid: this.#kid } : { alg: 'RS256', kid: signing === 'unknown-kid' ? 'nope' : this.#kid };
    const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
    const rs256 = (key: KeyObject) => createSign('RSA-SHA256').update(input).sign(key);
    if (signing === 'none') return `${input}.`;
    if (signing === 'hs256-with-public-key') {
      const secret = this.#key.publicKey.export({ type: 'spki', format: 'pem' });
      return `${input}.${createHmac('sha256', secret).update(input).digest('base64url')}`;
    }
    const signature = rs256(signing === 'other-key' ? this.#other.privateKey : this.#key.privateKey);
    if (signing === 'tampered') {
      const forged = { ...claims, email: 'attacker-changed@example.com', sub: 'forged' };
      return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(forged))}.${signature.toString('base64url')}`;
    }
    return `${input}.${signature.toString('base64url')}`;
  }

  async #handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', this.base);
    this.log.push(`${req.method} ${url.pathname}`);
    const send = (status: number, type: string, body: string) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };
    const body = async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    };

    if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');

    if (url.pathname === '/jwks') {
      const jwk = this.#key.publicKey.export({ format: 'jwk' });
      return send(200, 'application/json', JSON.stringify({ keys: [{ ...jwk, kid: this.#kid, alg: 'RS256', use: 'sig' }] }));
    }

    if (url.pathname === '/authorize' && req.method === 'GET') {
      const fields = [...url.searchParams].map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join('');
      return send(200, 'text/html; charset=utf-8', `<!doctype html><html lang="en"><title>Fake provider</title><main><h1>Fake provider</h1><form method="post" action="/authorize"><label>Fake account email <input name="fake_email" type="email"></label>${fields}<label><input type="checkbox" name="fake_unverified"> Unverified</label><button>Continue</button></form></main></html>`);
    }

    if (url.pathname === '/authorize' && req.method === 'POST') {
      const params = await body();
      const tweaks: TokenTweaks = { email: params.get('fake_email') ?? undefined, ...(params.get('fake_unverified') ? { email_verified: false } : {}), ...this.nextTweaks };
      res.writeHead(302, { location: this.#redirectBack(params, tweaks) });
      return res.end();
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const params = await body();
      const code = params.get('code') ?? '';
      const pending = this.#codes.get(code);
      this.#codes.delete(code);
      const verifier = params.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (
        !pending ||
        params.get('grant_type') !== 'authorization_code' ||
        params.get('client_secret') !== FAKE_CLIENT_SECRET ||
        params.get('client_id') !== pending.clientId ||
        params.get('redirect_uri') !== pending.redirectUri ||
        challenge !== pending.challenge
      ) {
        return send(400, 'application/json', JSON.stringify({ error: 'invalid_grant' }));
      }
      const mode = pending.tweaks.token ?? 'ok';
      if (mode === 'http-500') return send(500, 'text/plain', 'broken SECRET-IN-ERROR-BODY');
      if (mode === 'not-json') return send(200, 'text/html', '<html>hello</html>');
      if (mode === 'no-id-token') return send(200, 'application/json', JSON.stringify({ access_token: 'x' }));
      if (mode === 'huge') return send(200, 'application/json', JSON.stringify({ id_token: 'x'.repeat(2_000_000) }));
      return send(200, 'application/json', JSON.stringify({ access_token: 'FAKE-ACCESS-TOKEN', id_token: this.#idToken(pending), token_type: 'Bearer', expires_in: 3599 }));
    }

    return send(404, 'text/plain', 'not found');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const provider = new FakeOidc();
  await provider.start(Number(process.argv[2] ?? 0));
  const stop = () => void provider.stop().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
