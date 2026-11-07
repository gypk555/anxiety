import type { Background } from './background.ts';
import type { Config } from './config.ts';
import type { Sql } from './db.ts';
import type { Mailer } from './mail.ts';
import type { Passwords } from './passwords.ts';

export interface Ctx {
  config: Config;
  sql: Sql;
  mailer: Mailer;
  background: Background;
  passwords: Passwords;
}
