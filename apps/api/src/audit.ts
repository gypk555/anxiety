import { auditActor, type Keys } from './crypto.ts';
import type { Db } from './db.ts';

export type AuditAction =
  | 'login' | 'logout' | 'logout_all' | 'session_revoke' | 'consent' | 'export' | 'email_change' | 'account_delete'
  | 'password_change' | 'password_set' | 'password_reset' | 'google_link' | 'google_unlink';

export async function audit(db: Db, keys: Keys, action: AuditAction, userId: string): Promise<void> {
  await db`INSERT INTO app.audit_log (actor_hmac, action) VALUES (${auditActor(keys, userId)}, ${action})`;
}
