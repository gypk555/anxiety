## What and why

<!-- What changed for a person using the app, and why. Link the issue if there is one. -->

## How it was tested

<!-- Commands run, and anything checked by hand. Use made-up data only. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (any change to a screen or flow)

## Rules check

See [CONTRIBUTING](../CONTRIBUTING.md#rules-that-must-not-be-broken).

- [ ] GAD-7 wording, options, scoring and attribution are unchanged, or the owner agreed
- [ ] Helplines unchanged, or re-verified by phone. "Get help" still works on every screen, with no login and offline
- [ ] No new third party, remote asset or CSP source
- [ ] Nothing sensitive is logged, or stored in `localStorage`
- [ ] New user data is encrypted, scoped to the user, in the export, and removed on erasure
- [ ] Mail wording stays neutral

## Docs

- [ ] Updated the affected `docs/modules/` page, `docs/API.md` or `docs/DATABASE.md`, or none is affected
