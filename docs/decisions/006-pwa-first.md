# 006. PWA first, not native

Status: accepted, 2026-11-06. Decided by: the builder. The owner chose mobile-first responsive web.

## Context

Users are adults in India on phones, including cheap Android phones with limited data and storage. A person in distress should reach Help without installing anything. Help and the tools must work offline.

## Decision

A responsive React app, installable as a PWA, with a precaching service worker. No native app.

## Alternatives

- **Native iOS and Android.** App store review and accounts, a download before any help, and two codebases or a wrapper.
- **A plain website with no service worker.** Help wouldn't work offline.

## Consequences

- A link opens straight to Help.
- One codebase, and updates ship with a deploy. The prompt lets people refresh when ready.
- The tools work offline after one visit. A first visit needs a network. Static call links show during a slow load.
- No push notifications here, so no reminders. Reminders would need a deliberate decision anyway, since they'd show on a lock screen.
- iOS has no install prompt, so Settings gives Safari's steps. Vibration isn't available there.
- Not yet tried on real devices against a deployed origin.
