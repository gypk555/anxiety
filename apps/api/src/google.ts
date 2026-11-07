import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, verify as verifySignature, type KeyObject } from 'node:crypto';
import { emailSchema } from '@anxiocare/shared';
import { z } from 'zod';
import type { GoogleConfig } from './config.ts';
import { hmac, type Keys } from './crypto.ts';

export const OAUTH_STATE_MINUTES = 10;
const RANDOM_BYTES = 32;
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const CLOCK_SKEW_SECONDS = 60;
const JWKS_TTL_MS = 60 * 60 * 1000;
/** An unknown key id can be a real rotation, so it refetches, but an attacker sending made-up ones cannot make it hammer Google. */
const JWKS_MIN_REFRESH_MS = 60 * 1000;

export interface OauthState {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  expiresAt: number;
  /**
   * `signin` starts from the sign-in screen and can only find an account by its Google subject, or create a new one.
   * `connect` starts from Settings, in a session that has just re-authenticated, and links to that account only.
   */
  mode: 'signin' | 'connect';
  /** For `connect`: the account and session that asked. The callback refuses if that session has ended. */
  userId?: string;
  sessionId?: string;
}

const stateShape = z.strictObject({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  next: z.string(),
  expiresAt: z.number(),
  mode: z.enum(['signin', 'connect']),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});
const COOKIE_AAD = Buffer.from('google-oauth-state');
const cookieKey = (keys: Keys) => hmac(keys.otpPepper, 'google-oauth-cookie-v1');

/** Encrypted as well as authenticated: the verifier in it is the one thing that must never reach the browser's history or logs. */
export function sealOauthState(keys: Keys, value: OauthState): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(keys), nonce);
  cipher.setAAD(COOKIE_AAD);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64url');
}

export function openOauthState(keys: Keys, sealed: string | undefined): OauthState | null {
  if (!sealed || sealed.length > 4096) return null;
  try {
    const blob = Buffer.from(sealed, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(keys), blob.subarray(0, 12));
    decipher.setAAD(COOKIE_AAD);
    decipher.setAuthTag(blob.subarray(12, 28));
    const text = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString('utf8');
    return stateShape.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export const randomToken = () => randomBytes(RANDOM_BYTES).toString('base64url');
export const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export function authorizeUrl(google: GoogleConfig, input: { state: string; nonce: string; verifier: string }): string {
  const url = new URL(google.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: 'code',
    // openid and email only, so Google does not send a name or photo, and nobody has to throw them away.
    scope: 'openid email',
    state: input.state,
    nonce: input.nonce,
    code_challenge: pkceChallenge(input.verifier),
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

/** What the person is told, by the `error` value on the sign-in screen. */
export type GoogleRefusal = 'google' | 'google_link' | 'google_new';

/** Says which check failed in words safe to log. Never carries a value from the token or the provider. */
export class GoogleRejected extends Error {
  readonly reason: string;
  readonly refusal: GoogleRefusal;
  constructor(reason: string, refusal: GoogleRefusal = 'google') {
    super(reason);
    this.name = 'GoogleRejected';
    this.reason = reason;
    this.refusal = refusal;
  }
}

async function fetchLimited(url: string, init: RequestInit, reason: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new GoogleRejected(`${reason}_unreachable`);
  }
  if (!response.ok || !response.body) throw new GoogleRejected(`${reason}_status`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > MAX_RESPONSE_BYTES) throw new GoogleRejected(`${reason}_too_large`);
      chunks.push(chunk);
    }
  } catch (err) {
    if (err instanceof GoogleRejected) throw err;
    throw new GoogleRejected(`${reason}_unreachable`);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseJson(text: string, reason: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new GoogleRejected(reason);
  }
}

const tokenResponse = z.object({ id_token: z.string().min(1) });
const jwkSet = z.object({ keys: z.array(z.object({ kid: z.string(), kty: z.string() }).loose()) });
const tokenHeader = z.object({ alg: z.string(), kid: z.string().optional() });
const claimsShape = z.object({
  iss: z.string(),
  aud: z.string(),
  azp: z.string().optional(),
  sub: z.string().min(1).max(255),
  email: emailSchema,
  email_verified: z.literal(true),
  nonce: z.string(),
  exp: z.number().int(),
  iat: z.number().int(),
  // Present only for a Google Workspace account: the domain that manages it.
  hd: z.string().min(1).max(255).optional(),
});

export interface GoogleClaims {
  sub: string;
  email: string;
  /** The Workspace domain, when Google manages this address for an organisation. */
  hd: string | null;
}

/** The server-to-server half. Holds cached signing keys, so one instance per app. */
export class GoogleClient {
  readonly #config: GoogleConfig;
  #keys = new Map<string, KeyObject>();
  #fetchedAt = 0;

  constructor(config: GoogleConfig) {
    this.#config = config;
  }

  async #refreshKeys(): Promise<void> {
    const body = jwkSet.safeParse(parseJson(await fetchLimited(this.#config.jwksUrl, { headers: { accept: 'application/json' } }, 'jwks'), 'jwks_not_json'));
    if (!body.success) throw new GoogleRejected('jwks_shape');
    const keys = new Map<string, KeyObject>();
    for (const jwk of body.data.keys) {
      if (jwk.kty !== 'RSA') continue;
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' }));
      } catch {
        // A key we cannot read cannot have signed anything we would accept.
      }
    }
    this.#keys = keys;
    this.#fetchedAt = Date.now();
  }

  async #signingKey(kid: string): Promise<KeyObject> {
    const age = Date.now() - this.#fetchedAt;
    if (age > JWKS_TTL_MS || (!this.#keys.has(kid) && age > JWKS_MIN_REFRESH_MS)) await this.#refreshKeys();
    const key = this.#keys.get(kid);
    if (!key) throw new GoogleRejected('unknown_kid');
    return key;
  }

  /** Google's token endpoint, over TLS, with PKCE. The ID token then still has to pass every check. */
  async exchangeCode(code: string, verifier: string): Promise<string> {
    const text = await fetchLimited(
      this.#config.tokenUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: this.#config.clientId,
          client_secret: this.#config.clientSecret,
          redirect_uri: this.#config.redirectUri,
        }).toString(),
      },
      'token',
    );
    const body = tokenResponse.safeParse(parseJson(text, 'token_not_json'));
    if (!body.success) throw new GoogleRejected('token_shape');
    return body.data.id_token;
  }

  /** OIDC Core 3.1.3.7: issuer, audience, expiry and nonce, plus the signature, though this token came directly over TLS. */
  async verifyIdToken(idToken: string, nonce: string): Promise<GoogleClaims> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new GoogleRejected('token_format');
    const [headerPart, claimsPart, signaturePart] = parts as [string, string, string];
    const decode = (part: string) => parseJson(Buffer.from(part, 'base64url').toString('utf8'), 'token_format');
    const header = tokenHeader.safeParse(decode(headerPart));
    // Only the algorithm Google uses, so `none`, or HS256 keyed with the public key, never get as far as a key.
    if (!header.success || header.data.alg !== 'RS256' || !header.data.kid) throw new GoogleRejected('token_alg');
    const key = await this.#signingKey(header.data.kid);
    const signed = verifySignature('RSA-SHA256', Buffer.from(`${headerPart}.${claimsPart}`), key, Buffer.from(signaturePart, 'base64url'));
    if (!signed) throw new GoogleRejected('token_signature');

    const claims = claimsShape.safeParse(decode(claimsPart));
    if (!claims.success) throw new GoogleRejected('token_claims');
    const c = claims.data;
    const now = Date.now() / 1000;
    if (!this.#config.issuers.includes(c.iss)) throw new GoogleRejected('token_iss');
    if (c.aud !== this.#config.clientId) throw new GoogleRejected('token_aud');
    if (c.azp !== undefined && c.azp !== this.#config.clientId) throw new GoogleRejected('token_azp');
    if (c.exp <= now) throw new GoogleRejected('token_expired');
    if (c.iat > now + CLOCK_SKEW_SECONDS) throw new GoogleRejected('token_iat');
    if (c.nonce !== nonce) throw new GoogleRejected('token_nonce');
    return { sub: c.sub, email: c.email, hd: c.hd ?? null };
  }
}
