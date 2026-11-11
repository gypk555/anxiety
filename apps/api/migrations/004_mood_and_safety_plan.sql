-- The daily mood log and the personal safety plan.
-- See docs/superpowers/specs/2026-11-11-safety-and-tracking-design.md.

-- One entry per person per calendar day, as the person's phone saw the day. The day stays plaintext for ordering and
-- uniqueness. The rating and the note are sealed together, padded so every row has the same size.
CREATE TABLE app.mood_entries (
  user_id     uuid NOT NULL REFERENCES app.users (id) ON DELETE CASCADE,
  day         date NOT NULL,
  payload_ct  bytea NOT NULL,
  created_at  timestamptz(3) NOT NULL DEFAULT now(),
  updated_at  timestamptz(3) NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

-- One plan per account. Everything in it, including other people's names and phone numbers, is sealed as one blob.
CREATE TABLE app.safety_plans (
  user_id     uuid PRIMARY KEY REFERENCES app.users (id) ON DELETE CASCADE,
  payload_ct  bytea NOT NULL,
  updated_at  timestamptz(3) NOT NULL DEFAULT now()
);

ALTER TABLE app.mood_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.mood_entries TO anxiocare_runtime;
CREATE POLICY runtime_all ON app.mood_entries TO anxiocare_runtime USING (true) WITH CHECK (true);

ALTER TABLE app.safety_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.safety_plans TO anxiocare_runtime;
CREATE POLICY runtime_all ON app.safety_plans TO anxiocare_runtime USING (true) WITH CHECK (true);
