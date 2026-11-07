// Applies pending SQL migrations with the migration role (DATABASE_MIGRATION_URL).
import { ConfigError, loadMigrationConfig } from '../src/config.ts';
import { createSql } from '../src/db.ts';
import { migrate } from '../src/migrate.ts';

try {
  const { url, caCert } = loadMigrationConfig();
  const sql = createSql(url, { caCert, max: 1 });
  try {
    const ran = await migrate(sql);
    console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations');
  } finally {
    await sql.end({ timeout: 5 });
  }
} catch (err) {
  const message = err instanceof ConfigError || (err instanceof Error && err.name === 'MigrationError') ? err.message : 'Migration failed';
  console.error(message);
  if (err instanceof Error && 'code' in err) console.error(`code: ${String(err.code)}`);
  process.exit(1);
}
