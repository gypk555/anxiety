import type { Sql } from './db.ts';

export interface PurgeResult {
  sessions: number;
  otpCodes: number;
  unconsentedUsers: number;
  auditRows: number;
}

/**
 * Dead code rows stay for an hour after issue, because the per-address hourly limit counts them, and go
 * straight after that. The privacy notice says "for about an hour", which is why these get their own sweep.
 */
export async function purgeOtpCodes(sql: Sql): Promise<number> {
  const result = await sql`
    DELETE FROM app.otp_codes
    WHERE (consumed_at IS NOT NULL OR expires_at <= now()) AND created_at <= now() - interval '1 hour'
  `;
  return result.count;
}

/** Idempotent, so running it on several instances at once is harmless. */
export async function runPurge(sql: Sql): Promise<PurgeResult> {
  const sessions = await sql`
    DELETE FROM app.sessions
    WHERE absolute_expires_at <= now() OR last_seen_at <= now() - interval '30 days'
  `;
  const unconsented = await sql`
    WITH gone AS (
      DELETE FROM app.users
      WHERE consent_version IS NULL AND created_at <= now() - interval '24 hours'
      RETURNING email_hash
    ), codes AS (
      DELETE FROM app.otp_codes o USING gone WHERE o.email_hash = gone.email_hash
    )
    SELECT 1 FROM gone
  `;
  const otpCodes = await purgeOtpCodes(sql);
  await sql`DELETE FROM app.otp_failures WHERE created_at <= now() - interval '24 hours'`;
  const auditRows = await sql`DELETE FROM app.audit_log WHERE created_at <= now() - interval '1 year'`;
  return {
    sessions: sessions.count,
    otpCodes,
    unconsentedUsers: unconsented.count,
    auditRows: auditRows.count,
  };
}

export const PURGE_INTERVAL_MS = 60 * 60 * 1000;
/** An hourly purge alone could leave a code row for up to two hours after it was sent. */
export const OTP_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** While the process is up. Timers are unref'd so they never hold the process open. */
export function schedulePurge(
  sql: Sql,
  log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void },
  run: { purge: (sql: Sql) => Promise<PurgeResult>; sweep: (sql: Sql) => Promise<number> } = { purge: runPurge, sweep: purgeOtpCodes },
): () => void {
  const tick = () => {
    run.purge(sql).then(
      (result) => log.info({ purge: result }, 'purge_completed'),
      (err: unknown) => log.error({ err }, 'purge_failed'),
    );
  };
  const sweep = () => {
    run.sweep(sql).catch((err: unknown) => log.error({ err }, 'otp_sweep_failed'));
  };
  const first = setTimeout(tick, 60_000);
  const interval = setInterval(tick, PURGE_INTERVAL_MS);
  const sweeps = setInterval(sweep, OTP_SWEEP_INTERVAL_MS);
  first.unref();
  interval.unref();
  sweeps.unref();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
    clearInterval(sweeps);
  };
}
