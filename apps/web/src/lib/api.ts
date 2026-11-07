import { CSRF_HEADER, CSRF_HEADER_VALUE, problemResponse, type Problem } from '@anxiocare/shared';

const BASE = '/api/v1';
const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: Problem | null;
  constructor(status: number, code: string, problem: Problem | null) {
    super(problem?.detail ?? problem?.title ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.problem = problem;
  }
}

/** The request never reached the server, or the answer never came back. */
export class NetworkError extends Error {
  constructor() {
    super('network');
    this.name = 'NetworkError';
  }
}

interface RequestOptions<T> {
  body?: unknown;
  schema?: { parse(data: unknown): T };
  signal?: AbortSignal;
}

async function send<T>(method: string, path: string, options: RequestOptions<T>): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET') headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new NetworkError();
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

const SAFE_FILENAME = /filename="([A-Za-z0-9][A-Za-z0-9._-]{0,100})"/;

/** A download: the server's exact bytes under the server's own name, which never names the service. */
export async function requestFile(path: string): Promise<{ filename: string; text: string }> {
  const response = await send<never>('GET', path, {});
  const filename = SAFE_FILENAME.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'account-data.json';
  return { filename, text: await response.text() };
}

export async function request<T = void>(method: string, path: string, options: RequestOptions<T> = {}): Promise<T> {
  const response = await send(method, path, options);
  // An empty success body (202, 204, or a 200 with nothing to say) is fine.
  const text = await response.text().catch(() => '');
  if (!text) {
    if (options.schema) throw new ApiError(response.status, 'internal_error', null);
    return undefined as T;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(response.status, 'internal_error', null);
  }
  return options.schema ? options.schema.parse(data) : (data as T);
}

export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = problemResponse.safeParse(await response.json().catch(() => null));
  if (parsed.success) return new ApiError(response.status, parsed.data.code, parsed.data);
  return new ApiError(response.status, fallbackCode(response.status), null);
}

function fallbackCode(status: number): string {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'internal_error';
}

/** What the server's password rules said, when that is why it refused. */
export function passwordFieldError(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'validation_failed') return null;
  return error.problem?.fieldErrors?.password?.[0] ?? null;
}

/** Words for people. Says what happened and what to do next, in one breath. */
export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "We couldn't reach AnxioCare. Check your connection and try again.";
  }
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_code':
        return "That code didn't work. Check the latest email, or send a new code.";
      case 'invalid_credentials':
        return 'That email and password don\'t match. Try again, or use "Forgot your password?".';
      case 'rate_limited':
        return 'Too many tries for now. Wait a few minutes, then try again.';
      case 'validation_failed':
        return error.problem?.detail ?? 'Something in the form needs another look.';
      case 'not_found':
        return "We couldn't find that. It may have been deleted.";
      case 'unauthenticated':
        return 'You have been signed out. Please sign in again.';
      case 'consent_required':
        return 'Please review and accept the privacy notice to continue.';
      case 'conflict':
        return error.problem?.detail ?? 'That has already been done, or has changed. Refresh and check.';
      case 'reauth_required':
        return "For your safety, confirm it's you first, with your password or an email code.";
      case 'csrf_failed':
      case 'forbidden':
        return "That wasn't allowed. Refresh the page and try again.";
    }
  }
  return 'Something went wrong on our side. Please try again in a moment.';
}
