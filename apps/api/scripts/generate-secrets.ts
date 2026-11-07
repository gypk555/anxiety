// Prints fresh secrets and the SQL for the runtime role. Output is secret: do not commit or paste it anywhere shared.
import { randomBytes } from 'node:crypto';
import { RUNTIME_ROLE, runtimeRoleSql } from '../src/db.ts';

const key = () => randomBytes(32).toString('base64');
const password = randomBytes(32).toString('hex');

console.log(`# Add these to the service environment (see .env.example for what each one does).
ENCRYPTION_KEYS=v1:${key()}
ENCRYPTION_ACTIVE_KEY=v1
EMAIL_INDEX_KEY=${key()}
OTP_PEPPER=${key()}
AUDIT_KEY=${key()}
PASSWORD_PEPPER=${key()}

# DATABASE_URL uses this role and password. On Supabase's session pooler the user is ${RUNTIME_ROLE}.<project-ref>.
# Runtime role password: ${password}

-- Run this once as the admin/migration role, in the SQL editor, before the first migration:
${runtimeRoleSql(password)}
`);
