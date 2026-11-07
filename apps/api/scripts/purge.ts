// One-off run of the hourly purge, for cron or manual use. Uses the runtime role.
import { loadConfig } from '../src/config.ts';
import { createSql } from '../src/db.ts';
import { runPurge } from '../src/purge.ts';

const config = loadConfig();
const sql = createSql(config.databaseUrl, { caCert: config.databaseCaCert, max: 1 });
try {
  console.log(JSON.stringify(await runPurge(sql)));
} finally {
  await sql.end({ timeout: 5 });
}
