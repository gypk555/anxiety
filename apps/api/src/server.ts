import { buildApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';
import { assertRuntimeRole, createSql, RuntimeRoleError } from './db.ts';
import { createMailer } from './mail.ts';
import { schedulePurge } from './purge.ts';

function loadOrExit() {
  try {
    return loadConfig();
  } catch (err) {
    // ConfigError names variables and rules, never values.
    console.error(err instanceof ConfigError ? err.message : 'Invalid configuration');
    process.exit(1);
  }
}

const config = loadOrExit();
// On hosts with one environment for pre-deploy and runtime, the serving process must still not hold it.
delete process.env.DATABASE_MIGRATION_URL;

const sql = createSql(config.databaseUrl, { caCert: config.databaseCaCert, max: config.databasePoolMax });

const app = await buildApp({ config, sql, mailer: createMailer(config) });

const fatal = (err: unknown) => {
  app.log.fatal({ err }, 'fatal');
  process.exit(1);
};
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

try {
  await assertRuntimeRole(sql);
} catch (err) {
  app.log.fatal({ err }, err instanceof RuntimeRoleError ? err.message : 'database_check_failed');
  process.exit(1);
}

const cancelPurge = schedulePurge(sql, app.log);

let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, 'shutting_down');
  // Do not let a stuck connection hold a deploy up forever.
  setTimeout(() => process.exit(1), 15_000).unref();
  try {
    cancelPurge();
    await app.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  } catch (err) {
    fatal(err);
  }
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: config.host, port: config.port });
