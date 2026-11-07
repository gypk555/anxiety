# 003. Supabase as plain Postgres, private schema

Status: accepted, 2026-11-06. Decided by: the **owner** chose Option 2, a Node API on Render with a Supabase database, for a public app in India with accounts. The other options aren't recorded in this repository. Using it as plain Postgres in a private schema was the builder's call.

**Not yet run on Supabase.**

## Context

Supabase auto-generates a REST API over the `public` schema, and its browser client talks to that API using row-level rules. Here, encryption and authorisation live in the Node API, and a mistake in that auto-generated surface could expose health data.

## Decision

- Use Supabase only as a managed Postgres in the Mumbai region, reached with TLS verify-full through the session pooler.
- No Supabase client in the browser, and no Supabase Auth.
- All tables go in a private schema, `app`, with `USAGE` revoked from `PUBLIC`.

## Alternatives

- **Supabase client and Auth in the browser.** A third party in the client, plus security resting on a large set of policies.
- **Tables in `public` with RLS only.** One bad policy or grant exposes them through the REST API.

## Consequences

- The auto-generated API can't reach the tables, and no browser credential for Supabase exists.
- The API could run against any Postgres, as tests and local development do.
- Supabase's dashboard features for `public` don't apply.
- Server in Singapore, database in Mumbai. Render has no Mumbai region, so each query crosses that distance. The privacy notice states both locations.
- `prepare: false` is needed for the pooler.
- The owner must confirm backup retention against the plan: the app tells people the number.
