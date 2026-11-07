# 005. RLS with role-scoped policies, not BYPASSRLS

Status: accepted, 2026-11-06. Decided by: the builder. This changes the design spec, which said "RLS enabled with no policies".

## Context

The spec wanted RLS on every table as a second wall. With RLS on and no policies, a non-owner role sees nothing, which includes the app's own runtime role. So that design would require giving the runtime role `BYPASSRLS`, which switches the second wall off for the role most exposed to bugs.

## Decision

- Each table except `schema_migrations` gets one policy: `runtime_all`, `TO anxiocare_runtime USING (true) WITH CHECK (true)`.
- The runtime role is `NOBYPASSRLS`, and the server refuses to start if it isn't.
- Table grants limit what it can do, for example no `UPDATE` on `assessments`, and only `created_at` readable on `audit_log`.

## Alternatives

- **`BYPASSRLS` on the runtime role.** See above. The boot check now refuses it.
- **Run as the table owner.** Owners skip RLS, and could also change the schema.
- **Per-user policies with `SET app.user_id`.** Real isolation in the database, but it needs per-transaction state on every query, it's easy to get wrong behind a pooler, and purge and the sign-in lookup span users. Worth reconsidering later.

## Consequences

Be clear about what this does and doesn't give:

- **It does:** keep every other role out, including Supabase's `anon` and `authenticated`, even if a table gets granted by mistake.
- **It does not:** separate one person from another. `USING (true)` means the runtime role sees all rows. Per-user isolation depends entirely on `WHERE user_id = ...` in each query, and is checked by the cross-user tests.
- A new table must add a policy and grants, or the app can't read it. See [how to add a migration](../DATABASE.md#adding-a-migration).
- The migration role owns the tables, and RLS isn't forced, so it sees everything.
- Not verified on a live Supabase project.
