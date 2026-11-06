import type { Problem } from '@anxiocare/shared';
import type { ZodError } from 'zod';

type Code = Problem['code'];

const TITLES: Record<string, string> = {
  validation_failed: 'The request is not valid',
  unauthenticated: 'Sign-in required',
  consent_required: 'Consent required',
  forbidden: 'Not allowed',
  not_found: 'Not found',
  invalid_code: 'That code is not valid',
  rate_limited: 'Too many requests',
  csrf_failed: 'Request blocked',
  conflict: 'Conflict',
  internal_error: 'Something went wrong',
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: Code;
  readonly fieldErrors?: Record<string, string[]>;
  readonly detail?: string;

  constructor(statusCode: number, code: Code, fieldErrors?: Record<string, string[]>, detail?: string) {
    super(code);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    if (fieldErrors) this.fieldErrors = fieldErrors;
    if (detail) this.detail = detail;
  }
}

export const notFound = () => new ApiError(404, 'not_found');
/** A 409 whose `detail` is written for the person using the app. */
export const conflict = (detail?: string) => new ApiError(409, 'conflict', undefined, detail);
export const invalidCode = () => new ApiError(400, 'invalid_code');

export function validationError(error: ZodError): ApiError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    // Field names only come from our schema: an unknown key is reported against the object, never echoed.
    const path = issue.code === 'unrecognized_keys' ? '' : issue.path.join('.');
    const key = path === '' ? '_' : path;
    (fieldErrors[key] ??= []).push(issue.code === 'unrecognized_keys' ? 'unknown keys are not allowed' : issue.message);
  }
  return new ApiError(400, 'validation_failed', fieldErrors);
}

export function fieldError(field: string, message: string): ApiError {
  return new ApiError(400, 'validation_failed', { [field]: [message] });
}

export function problem(statusCode: number, code: string, requestId: string, fieldErrors?: Record<string, string[]>, detail?: string): Problem {
  return {
    type: 'about:blank',
    title: TITLES[code] ?? TITLES.internal_error!,
    status: statusCode,
    code,
    requestId,
    ...(detail ? { detail } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
  };
}
