-- Accounts: password sign-in, Google sign-in, and the code purposes they need.
-- See docs/superpowers/specs/2026-11-07-accounts-and-database-design.md.

-- An Argon2id PHC string, peppered before hashing. Null for an account that signs in by email code or Google only.
ALTER TABLE app.users ADD COLUMN password_hash text
  CONSTRAINT users_password_hash_format CHECK (password_hash LIKE '$argon2id$%');

ALTER TABLE app.otp_codes DROP CONSTRAINT otp_codes_purpose_check;
ALTER TABLE app.otp_codes ADD CONSTRAINT otp_codes_purpose_check CHECK (purpose IN (
  'login', 'register', 'password_reset', 'password_set', 'email_change', 'email_change_current', 'account_delete'));
-- A code on the way into an account has nobody behind it yet; the others always belong to a signed-in user.
ALTER TABLE app.otp_codes DROP CONSTRAINT otp_subject_matches_purpose;
ALTER TABLE app.otp_codes ADD CONSTRAINT otp_subject_matches_purpose
  CHECK ((purpose IN ('login', 'register', 'password_reset')) = (subject_user_id IS NULL));

ALTER TABLE app.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE app.audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
  'login', 'logout', 'logout_all', 'session_revoke', 'consent', 'export', 'email_change', 'account_delete',
  'password_change', 'password_set', 'password_reset', 'google_link', 'google_unlink'));

-- A person's Google account, keyed by an HMAC of Google's subject under a key the database never sees.
-- The first unique index is the lookup. The second means an account has one Google login at a time, so a
-- recycled Google address with a new subject cannot quietly become a second way in.
CREATE TABLE app.user_identities (
  user_id       uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('google')),
  subject_hmac  bytea NOT NULL,
  created_at    timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
CREATE UNIQUE INDEX user_identities_subject_key ON app.user_identities (provider, subject_hmac);

-- One row per failed password attempt, for the hourly cap. Also counts addresses with no account, so it says
-- nothing about who has one. Hashed by canonical address, so every spelling of an inbox shares a budget. Kept an hour.
CREATE TABLE app.login_failures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_hash  bytea NOT NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX login_failures_rate_idx ON app.login_failures (quota_hash, created_at);
CREATE INDEX login_failures_age_idx ON app.login_failures (created_at);

-- Google's `state` values already used, so one can never be replayed. Holds a hash and an expiry, nothing about a person.
CREATE TABLE app.oauth_state_uses (
  state_hash  bytea PRIMARY KEY,
  expires_at  timestamptz(3) NOT NULL
);
CREATE INDEX oauth_state_uses_expiry_idx ON app.oauth_state_uses (expires_at);

ALTER TABLE app.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.login_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.oauth_state_uses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON app.user_identities TO anxiocare_runtime;
GRANT SELECT, INSERT, DELETE ON app.login_failures TO anxiocare_runtime;
GRANT SELECT, INSERT, DELETE ON app.oauth_state_uses TO anxiocare_runtime;

CREATE POLICY runtime_all ON app.user_identities TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.login_failures TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.oauth_state_uses TO anxiocare_runtime USING (true) WITH CHECK (true);
