# 008. No third-party analytics

Status: accepted, 2026-11-06. Decided by: the builder.

## Context

That someone uses an anxiety app is sensitive in itself. Analytics, ads and CDNs tell another company who visited, and often which screen. A consent notice that promises "no trackers" must be true by construction.

## Decision

The app loads nothing from any other host: no analytics, trackers, ad SDKs, CDNs or remote fonts. Fonts are self-hosted. The CSP enforces this: every source is `'self'`.

Server logs are allow-listed and exclude IP addresses, emails, query strings and bodies.

## Alternatives

- **Hosted analytics with consent.** A third party learns of the visit, and a mental health context makes the data sensitive.
- **Privacy-friendly hosted analytics.** Still another host in the CSP and another processor to disclose.
- **Self-hosted analytics.** No third party, but events about health use would need the same care as the data. Not needed for launch.

## Consequences

- The Privacy notice's claim is simple and checkable. An e2e test scans the built client for other hosts.
- The owner gets no usage numbers: no funnels, no retention, no error tracking service. Only logs and database counts. See [OPERATIONS.md](../OPERATIONS.md).
- Client-side errors stay on the device unless someone reports them.
- User-chosen outbound links do exist: `tel:`, `wa.me` for one helpline, and helpline websites. They're links, not loads.
- The hosts see what they must. The Privacy notice names Render, Supabase and the mail provider. It doesn't name Cloudflare, which sits at Render's edge according to [apps/api/README.md](../../apps/api/README.md#client-address-on-render).
