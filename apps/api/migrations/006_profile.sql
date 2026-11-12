-- Optional profile details and the one-time "About you" prompt.
-- See docs/superpowers/specs/2026-11-12-profile-details-design.md.

-- One sealed JSON blob per person, padded to one size: avatar, age range, gender, occupation and stress factors,
-- each from a fixed list. NULL when nothing has been set. Table grants and the RLS policy on app.users cover it.
ALTER TABLE app.users ADD COLUMN profile_ct bytea;

-- When "About you" was saved or skipped, so it is asked only once. Not secret: it says nothing about the answers.
ALTER TABLE app.users ADD COLUMN about_seen_at timestamptz(3);

-- "Delete all check-ins" in Settings is recorded like the other destructive actions.
ALTER TABLE app.audit_log DROP CONSTRAINT audit_log_action_check;
ALTER TABLE app.audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
  'login', 'logout', 'logout_all', 'session_revoke', 'consent', 'export', 'email_change', 'account_delete',
  'password_change', 'password_set', 'password_reset', 'google_link', 'google_unlink', 'assessments_delete'));
