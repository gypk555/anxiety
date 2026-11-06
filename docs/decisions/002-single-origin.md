# 002. Single origin

Status: accepted, 2026-11-06. Decided by: the builder, within the owner's choice of a Node API on Render.

## Context

The session cookie is `__Host-`, `SameSite=Strict`. `onrender.com` is on the public suffix list, so `app.onrender.com` and `api.onrender.com` count as different sites. A split would make the API cross-site, and strict cookies wouldn't be sent.

## Decision

One Node process serves `/api/v1/*` and the built web app, from one Render web service. There is no CORS.

## Alternatives

- **Separate static host and API.** Needs `SameSite=None` or a custom domain, plus CORS, which weakens the CSRF story.
- **A custom domain with subdomains.** Workable, but it needs a domain from day one and still leaves more to configure than one origin.

## Consequences

- Cookies, CSRF and CSP (`connect-src 'self'`) stay simple and strict.
- The server sets cache rules for files itself. See [static files](../modules/api-foundation.md#static-files).
- Static files and the API share an instance and its CPU. Files have their own larger rate-limit budget, so a busy address doesn't lose the API.
- A Node deploy is needed for any change, even a CSS one.
- In development, Vite proxies `/api`, and `DEV_ORIGINS` allows its origin.
