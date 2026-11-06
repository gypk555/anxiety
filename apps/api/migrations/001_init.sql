-- AnxioCare schema. Everything lives in the private schema `app`, never `public`,
-- so Supabase's auto-generated REST API cannot reach it. Identifiable or health data
-- is application-layer encrypted: *_ct columns are AES-256-GCM blobs. Plaintext is
-- limited to ids, timestamps, hashes, counters and enum-like labels.
--
-- Sort-key timestamps use millisecond precision (timestamptz(3)) on purpose: JavaScript
-- Dates carry milliseconds, so a keyset cursor round-trips exactly.

REVOKE ALL ON SCHEMA app FROM PUBLIC;

CREATE TABLE app.users (
  id               uuid PRIMARY KEY,
  email_hash       bytea NOT NULL,          -- HMAC blind index
  email_ct         bytea NOT NULL,
  display_name_ct  bytea,
  wrapped_dek      bytea NOT NULL,          -- destroyed with the row on erasure
  dek_key_version  text NOT NULL,
  consent_version  text,                    -- NULL until the first consent
  consent_at       timestamptz(3),
  created_at       timestamptz(3) NOT NULL DEFAULT now(),
  updated_at       timestamptz(3) NOT NULL DEFAULT now()
);
-- Also resolves the first-login race: the loser's insert hits this and reads the winner's row.
CREATE UNIQUE INDEX users_email_hash_key ON app.users (email_hash);
CREATE INDEX users_unconsented_idx ON app.users (created_at) WHERE consent_version IS NULL;

CREATE TABLE app.consents (
  user_id           uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  version           text NOT NULL,
  adult_confirmed   boolean NOT NULL,
  health_data       boolean NOT NULL,
  accepted_at       timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, version)
);

CREATE TABLE app.sessions (
  id                   uuid PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  token_hash           bytea NOT NULL,      -- SHA-256 of the cookie token
  device_label_ct      bytea NOT NULL,
  created_at           timestamptz(3) NOT NULL DEFAULT now(),
  last_seen_at         timestamptz(3) NOT NULL DEFAULT now(),
  absolute_expires_at  timestamptz(3) NOT NULL
);
CREATE UNIQUE INDEX sessions_token_hash_key ON app.sessions (token_hash);
CREATE INDEX sessions_user_idx ON app.sessions (user_id, created_at DESC);
CREATE INDEX sessions_expiry_idx ON app.sessions (absolute_expires_at);
CREATE INDEX sessions_seen_idx ON app.sessions (last_seen_at);

CREATE TABLE app.otp_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose          text NOT NULL CHECK (purpose IN ('login', 'email_change', 'email_change_current', 'account_delete')),
  email_hash       bytea NOT NULL,          -- blind index of the address the code was mailed to
  quota_hash       bytea NOT NULL,          -- HMAC of the canonical address: variants of one inbox share it
  source_hash      bytea NOT NULL,          -- HMAC of quota_hash and the client address; the address itself is not stored
  subject_user_id  uuid REFERENCES app.users (id) ON DELETE CASCADE,
  code_hmac        bytea NOT NULL,          -- keyed over purpose, target, subject and code
  attempts         integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at       timestamptz(3) NOT NULL,
  consumed_at      timestamptz(3),          -- also set when superseded by a newer code
  created_at       timestamptz(3) NOT NULL DEFAULT now(),
  -- A login code has no account behind it (sign-up and sign-in look identical);
  -- the others always belong to a signed-in user.
  CONSTRAINT otp_subject_matches_purpose CHECK ((purpose = 'login') = (subject_user_id IS NULL))
);
-- At most one live code per purpose + target + subject.
CREATE UNIQUE INDEX otp_codes_one_live_key
  ON app.otp_codes (purpose, email_hash, coalesce(subject_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE consumed_at IS NULL;
CREATE INDEX otp_codes_rate_idx ON app.otp_codes (quota_hash, purpose, created_at);
CREATE INDEX otp_codes_email_idx ON app.otp_codes (email_hash);
CREATE INDEX otp_codes_expiry_idx ON app.otp_codes (expires_at);

-- One row per wrong guess at a live code, for the rolling daily cap. Kept 24 hours (see purge).
CREATE TABLE app.otp_failures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_hash  bytea NOT NULL,
  purpose     text NOT NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX otp_failures_rate_idx ON app.otp_failures (quota_hash, purpose, created_at);

CREATE TABLE app.assessments (
  id                 uuid PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  client_request_id  uuid NOT NULL,
  taken_at           timestamptz(3) NOT NULL,
  payload_ct         bytea NOT NULL,        -- answers, difficulty, score, severity
  created_at         timestamptz(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assessments_idempotency_key ON app.assessments (user_id, client_request_id);
CREATE INDEX assessments_page_idx ON app.assessments (user_id, taken_at DESC, id DESC);

CREATE TABLE app.journal_entries (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  payload_ct  bytea NOT NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT now(),
  updated_at  timestamptz(3) NOT NULL DEFAULT now()
);
CREATE INDEX journal_entries_page_idx ON app.journal_entries (user_id, created_at DESC, id DESC);

-- Pseudonymous on purpose: no foreign key to users, so rows outlive erasure, and the actor
-- is an HMAC under a key the database never sees. Retention: one year (see purge).
-- Times are to the UTC day, enforced below, so a row cannot be joined to a session or user by its time.
CREATE TABLE app.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_hmac  bytea NOT NULL,
  action      text NOT NULL CHECK (action IN (
                'login', 'logout', 'logout_all', 'session_revoke', 'consent',
                'export', 'email_change', 'account_delete')),
  created_at  timestamptz(3) NOT NULL DEFAULT (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
  CONSTRAINT audit_log_day_only CHECK ((created_at AT TIME ZONE 'UTC')::time = '00:00')
);
CREATE INDEX audit_log_created_idx ON app.audit_log (created_at);

-- Second wall: with RLS on, the only policies below name the runtime role, so every other role
-- (Supabase's anon, authenticated, ...) sees nothing even if it were somehow granted the tables.
ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.otp_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.schema_migrations ENABLE ROW LEVEL SECURITY;

-- The runtime role. It is normally created up front with a password by the SQL that
-- `npm run generate-secrets` prints; this only makes the grants below always valid.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anxiocare_runtime') THEN
    CREATE ROLE anxiocare_runtime NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO anxiocare_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.users TO anxiocare_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.sessions TO anxiocare_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.otp_codes TO anxiocare_runtime;
GRANT SELECT, INSERT, DELETE ON app.otp_failures TO anxiocare_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.journal_entries TO anxiocare_runtime;
GRANT SELECT, INSERT, DELETE ON app.assessments TO anxiocare_runtime;
GRANT SELECT, INSERT ON app.consents TO anxiocare_runtime;
-- Audit rows are append-only for the app, apart from retention purge by age. It cannot read them back.
GRANT INSERT, DELETE ON app.audit_log TO anxiocare_runtime;
GRANT SELECT (created_at) ON app.audit_log TO anxiocare_runtime;

-- Row access for the runtime role only. Per-user scoping lives in the queries; these let the role
-- work without BYPASSRLS. schema_migrations gets no policy: the runtime role has no use for it.
CREATE POLICY runtime_all ON app.users TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.consents TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.sessions TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.otp_codes TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.otp_failures TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.assessments TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.journal_entries TO anxiocare_runtime USING (true) WITH CHECK (true);
CREATE POLICY runtime_all ON app.audit_log TO anxiocare_runtime USING (true) WITH CHECK (true);
