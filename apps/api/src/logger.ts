import type { DestinationStream, LoggerOptions } from 'pino';
import { pino } from 'pino';

/**
 * Allow-list only. Error messages, driver details and SMTP responses can quote addresses or
 * values, so an error is reduced to its class, code and stack frames (no message line).
 */
export function safeError(error: unknown): { type: string; code?: string; stack?: string } {
  if (!(error instanceof Error)) return { type: 'non_error' };
  const code = (error as { code?: unknown }).code;
  const frames = error.stack?.split('\n').filter((line) => /^\s+at /.test(line)).join('\n');
  return {
    type: error.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { code: String(code) } : {}),
    ...(frames ? { stack: frames } : {}),
  };
}

export function createLogger(level: string, stream?: DestinationStream) {
  const options: LoggerOptions = {
    level,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: safeError,
      // Fastify's defaults for these include URLs with query strings and client IPs.
      req: () => undefined,
      res: () => undefined,
    },
  };
  return stream ? pino(options, stream) : pino(options);
}
