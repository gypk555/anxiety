# @anxiocare/shared

The single source of truth for what the API and the web app must agree on. It ships TypeScript source, and is inlined into the server bundle at build time. Its only dependency is Zod.

| File | Holds |
| --- | --- |
| [`src/gad7.ts`](src/gad7.ts) | GAD-7 items, options, stem, difficulty item, attribution, severity bands, `scoreGad7`, `severityFor`, cut point, retake interval |
| [`src/helplines.ts`](src/helplines.ts) | `HELPLINES`, `EMERGENCY_NUMBER`, `HELPLINES_CHECK_METHOD`, `HELPLINES_CHECKED_ON`, `helplinesCheckNote` |
| [`src/passwords.ts`](src/passwords.ts), [`src/common-passwords.ts`](src/common-passwords.ts) | The password policy, run by both client and server, and a hand-picked blocklist |
| [`src/next-path.ts`](src/next-path.ts) | `safeNext`, so both sides refuse the same open redirects |
| [`src/schemas.ts`](src/schemas.ts) | Zod request and response schemas, `CONSENT_VERSION`, `CSRF_HEADER`, `OTP_LENGTH`, `formatOtp`, `ERROR_CODES` |

What is and isn't in the contract: [docs/API.md](../../docs/API.md#shared-contract-versus-not).

```sh
npm test -w @anxiocare/shared
npm run typecheck -w @anxiocare/shared
```

## Careful

- **GAD-7 wording and cut points are a validated instrument.** Don't edit them. See [decision 007](../../docs/decisions/007-exact-gad7.md).
- **Helplines are safety-critical.** The app states how the numbers were checked, so change `HELPLINES_CHECK_METHOD` to `'phone'` and set `HELPLINES_CHECKED_ON` only when someone has really phoned them. See [CLINICAL-SAFETY.md](../../docs/CLINICAL-SAFETY.md#procedure).
- **Raising `CONSENT_VERSION`** makes everyone accept again before they can save more. Do it when the privacy notice changes materially. `consentBody` accepts only the current value.
