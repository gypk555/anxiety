-- Two missing indexes. Never edit 001 to 006.

-- Every other foreign key has an index. Without this one, deleting an account cascades through a scan of otp_codes.
CREATE INDEX otp_codes_subject_user_idx ON app.otp_codes (subject_user_id) WHERE subject_user_id IS NOT NULL;

-- The hourly purge deletes code failures by age alone, as it does login failures (login_failures_age_idx).
CREATE INDEX otp_failures_age_idx ON app.otp_failures (created_at);
