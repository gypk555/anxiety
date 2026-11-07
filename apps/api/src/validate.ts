import { uuidSchema } from '@anxiocare/shared';
import { z } from 'zod';
import { notFound, validationError } from './errors.ts';

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

/** For POSTs without a body: rejects anything that was sent anyway. */
export const emptyBody = z.strictObject({}).optional();

/** A malformed id is simply a resource that does not exist. */
export function idParam(params: unknown): string {
  const id = uuidSchema.safeParse((params as { id?: unknown }).id);
  if (!id.success) throw notFound();
  return id.data;
}

/** Wider than any row can be, and well inside what Postgres and Date can represent. */
const CURSOR_MIN = Date.UTC(2000, 0, 1);
const CURSOR_MAX = Date.UTC(2100, 0, 1);
const cursorDate = z.iso.datetime().refine((value) => {
  const at = new Date(value).getTime();
  return at >= CURSOR_MIN && at < CURSOR_MAX;
}, { message: 'is out of range' });
const cursorShape = z.tuple([cursorDate, uuidSchema]);

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id]), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (cursor === undefined) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    decoded = null;
  }
  const [at, id] = parse(z.object({ cursor: cursorShape }), { cursor: decoded }).cursor;
  return { at: new Date(at), id };
}

/** `rows` holds up to limit + 1 items; the extra one only signals that another page exists. */
export function page<R, T>(rows: readonly R[], limit: number, map: (row: R) => T, cursorOf: (row: R) => [Date, string]) {
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  return {
    items: pageRows.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(...cursorOf(last)) : null,
  };
}
