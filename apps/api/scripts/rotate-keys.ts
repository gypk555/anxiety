// Master-key rotation:
//   1. Add the new key:  ENCRYPTION_KEYS="v1:<old>,v2:<new>"  ENCRYPTION_ACTIVE_KEY=v2, then deploy.
//   2. Run this script. It rewraps every data key under the active key. Safe to re-run.
//   3. Remove the old key from ENCRYPTION_KEYS and deploy.
import { ConfigError, loadConfig } from '../src/config.ts';
import { createSql } from '../src/db.ts';
import { rotateKeys } from '../src/rotate.ts';

try {
  const config = loadConfig();
  const sql = createSql(config.databaseUrl, { caCert: config.databaseCaCert, max: 1 });
  try {
    const { rewrapped } = await rotateKeys(sql, config.keys.ring);
    console.log(`Rewrapped ${rewrapped} data keys under ${config.keys.ring.activeVersion}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : `Rotation failed (${err instanceof Error ? err.name : 'unknown'})`);
  process.exit(1);
}
