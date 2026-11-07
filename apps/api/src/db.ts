import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Db = postgres.Sql | postgres.TransactionSql;

export const RUNTIME_ROLE = 'anxiocare_runtime';

export function databaseOptions(input: { caCert: string | null; max: number }) {
  return {
    max: input.max,
    // Supavisor's pooler does not keep named prepared statements usable across clients.
    prepare: false,
    idle_timeout: 60,
    connect_timeout: 10,
    connection: { application_name: 'anxiocare' },
    // Server notices can quote values; the default handler would print them.
    onnotice: () => {},
    // TLS verify-full: chain checked against the pinned CA and hostname checked by Node's default.
    ssl: input.caCert ? ({ ca: input.caCert, rejectUnauthorized: true } as const) : (false as const),
  };
}

export function createSql(url: string, input: { caCert: string | null; max: number }): Sql {
  return postgres(url, databaseOptions(input));
}

/** Its message states which rule failed and is safe to log. */
export class RuntimeRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeRoleError';
  }
}

/**
 * Refuses to run with credentials that are broader than the app needs. RLS policies name this role
 * only, so it needs no BYPASSRLS, and table grants limit it to the `app` tables it uses.
 */
export async function assertRuntimeRole(sql: Sql): Promise<void> {
  const [role] = await sql<{ rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolbypassrls: boolean; owned: number }[]>`
    SELECT r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls,
           (SELECT count(*)::int FROM pg_catalog.pg_tables t WHERE t.schemaname = 'app' AND t.tableowner = current_user) AS owned
    FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
  `;
  if (!role) throw new RuntimeRoleError('runtime role not found');
  if (role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolbypassrls || role.owned > 0) {
    throw new RuntimeRoleError('DATABASE_URL must use the least-privilege runtime role; this role is too privileged');
  }
}

/** SQL that creates or updates the runtime role. `password` must be hex or similar (no quoting is done). */
export function runtimeRoleSql(password: string): string {
  if (!/^[A-Za-z0-9]+$/.test(password)) throw new Error('password must be alphanumeric');
  const attrs = `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 40 PASSWORD '${password}'`;
  return `DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}') THEN
    ALTER ROLE ${RUNTIME_ROLE} ${attrs};
  ELSE
    CREATE ROLE ${RUNTIME_ROLE} ${attrs};
  END IF;
END
$$;`;
}
