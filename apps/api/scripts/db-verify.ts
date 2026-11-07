// npm run db:verify: a read-only report on the database named in .env.setup. Exits 1 if anything fails.
import { createSql } from '../src/db.ts';
import { printChecks, verifyDatabase } from '../src/db-checks.ts';
import { describeConnectionError, readSetupFile, SetupError } from '../src/setup.ts';

let setup;
try {
  setup = readSetupFile();
} catch (err) {
  console.error(err instanceof SetupError ? err.message : 'Could not read .env.setup.');
  process.exit(1);
}

const sql = createSql(setup.adminUrl, { caCert: setup.caCert, max: 1 });
let ok = false;
try {
  await sql`SELECT 1`.catch((err: unknown) => {
    throw new SetupError(describeConnectionError(err));
  });
  ok = printChecks(await verifyDatabase(sql));
} catch (err) {
  const code = (err as { code?: unknown }).code;
  console.error(`FAIL  ${err instanceof SetupError ? err.message : `Verification stopped${code ? ` (${String(code)})` : ''}`}`);
}
await sql.end({ timeout: 5 }).catch(() => {});
process.exit(ok ? 0 : 1);
