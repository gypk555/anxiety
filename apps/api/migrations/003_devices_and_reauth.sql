-- Device cookies, failure counts by source, and re-authentication for sign-in changes.
-- See docs/decisions/012-passwords-google-and-six-digit-codes.md and docs/testing/TEST-REPORT.md (second security review).

-- A browser where someone has signed in. Only an HMAC of the cookie's random token is stored, under a key the
-- database never sees, so a dump cannot be replayed as a cookie. Deleting the account deletes these.
CREATE TABLE app.device_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  token_hmac  bytea NOT NULL UNIQUE,
  created_at  timestamptz(3) NOT NULL DEFAULT now(),
  expires_at  timestamptz(3) NOT NULL
);
CREATE INDEX device_tokens_user_idx ON app.device_tokens (user_id, created_at);
CREATE INDEX device_tokens_expiry_idx ON app.device_tokens (expires_at);

-- Failed passwords are now counted per address and source, per address overall, and per known device.
-- The address key changes to its own HMAC domain, so old rows could never match again: they are an hour's worth at most.
DELETE FROM app.login_failures;
ALTER TABLE app.login_failures
  ADD COLUMN source_hash bytea,
  ADD COLUMN device_id uuid REFERENCES app.device_tokens (id) ON DELETE CASCADE,
  ADD CONSTRAINT login_failures_counted_by CHECK ((device_id IS NULL) = (source_hash IS NOT NULL));
CREATE INDEX login_failures_device_idx ON app.login_failures (device_id, created_at) WHERE device_id IS NOT NULL;

-- Wrong codes the same way. A signed-in purpose keeps one budget per address and purpose, so both columns stay null.
ALTER TABLE app.otp_failures
  ADD COLUMN source_hash bytea,
  ADD COLUMN device_id uuid REFERENCES app.device_tokens (id) ON DELETE CASCADE,
  ADD CONSTRAINT otp_failures_one_counter CHECK (source_hash IS NULL OR device_id IS NULL);
CREATE INDEX otp_failures_device_idx ON app.otp_failures (device_id, created_at) WHERE device_id IS NOT NULL;

-- When this session last proved a password or an email code. Connecting or disconnecting Google needs it recent.
ALTER TABLE app.sessions ADD COLUMN reauth_at timestamptz(3);

ALTER TABLE app.otp_codes DROP CONSTRAINT otp_codes_purpose_check;
ALTER TABLE app.otp_codes ADD CONSTRAINT otp_codes_purpose_check CHECK (purpose IN (
  'login', 'register', 'password_reset', 'password_set', 'email_change', 'email_change_current', 'account_delete', 'reauth'));

ALTER TABLE app.device_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.device_tokens TO anxiocare_runtime;
CREATE POLICY runtime_all ON app.device_tokens TO anxiocare_runtime USING (true) WITH CHECK (true);
