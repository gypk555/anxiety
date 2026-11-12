// npm run db:setup: from .env.setup, a database ready to serve. Safe to run again. See docs/DEPLOYMENT.md.
//
//   --show-secrets   also print the generated values. They are always in the secrets file, which is the better place to read them.
import { createSql } from '../src/db.ts';
import { printChecks, verifyDatabase } from '../src/db-checks.ts';
import { migrate } from '../src/migrate.ts';
import { canLogIn, describeConnectionError, ensureRuntimeRole, ensureSecrets, readSetupFile, SetupError } from '../src/setup.ts';

const showSecrets = process.argv.includes('--show-secrets');

function fatal(err: unknown): never {
  console.error(err instanceof SetupError ? err.message : `Setup stopped${(err as { code?: unknown }).code ? ` (${String((err as { code?: unknown }).code)})` : ''}. Nothing printed here includes your password.`);
  process.exit(1);
}

let setup;
try {
  setup = readSetupFile();
} catch (err) {
  fatal(err);
}

const sql = createSql(setup.adminUrl, { caCert: setup.caCert, max: 1 });
let ok = false;
let secrets: ReturnType<typeof ensureSecrets> | undefined;
try {
  try {
    await sql`SELECT 1`;
  } catch (err) {
    throw new SetupError(describeConnectionError(err));
  }
  console.log('Connected, with TLS verified against your CA.');

  secrets = ensureSecrets(setup.secretsFile, setup.adminUrl);
  console.log(secrets.created.length ? `Secrets: generated ${secrets.created.join(', ')} in ${setup.secretsFile}` : `Secrets: already in ${setup.secretsFile}, left untouched`);

  const runtimePassword = new URL(secrets.values.DATABASE_URL!).password;
  console.log(`Runtime role: ${await ensureRuntimeRole(sql, decodeURIComponent(runtimePassword), () => canLogIn(secrets!.values.DATABASE_URL!, setup.caCert))}`);

  const ran = await migrate(sql);
  console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'No pending migrations');

  ok = printChecks(await verifyDatabase(sql));
} catch (err) {
  await sql.end({ timeout: 1 }).catch(() => {});
  fatal(err);
}
await sql.end({ timeout: 5 });

if (!ok) {
  console.error('\nSetup finished, but verification failed. See the Fix lines above.');
  process.exit(1);
}

const secretNames = Object.keys(secrets!.values).filter((name) => name !== 'ENCRYPTION_ACTIVE_KEY');
console.log(`
Copy these into Render, under Environment:

  ENCRYPTION_ACTIVE_KEY=${secrets!.values.ENCRYPTION_ACTIVE_KEY}
  DATABASE_CA_CERT=${Buffer.from(setup.caCert).toString('base64')}
  DATABASE_MIGRATION_URL=  your ADMIN_DATABASE_URL from .env.setup. Never printed.`);
if (showSecrets) {
  for (const name of secretNames) console.log(`  ${name}=${secrets!.values[name]}`);
} else {
  console.log(`  ${secretNames.join(', ')}: their values are in ${setup.secretsFile}`);
  console.log('\nThose values are not printed, so they cannot end up in scrollback or a pasted log. --show-secrets prints them.');
}
console.log(`
Keep a copy of ${setup.secretsFile} in a separate secret store. Losing ENCRYPTION_KEYS makes all user data unreadable.
Then check the whole environment with npm run doctor.`);
