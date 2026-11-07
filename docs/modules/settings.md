# Settings

## Purpose

One screen for a person's account, data rights and preferences.

## User-facing behaviour

`/settings` is reachable by anyone. It isn't behind `RequireAccount`.

Everyone sees:

- **Appearance**: Phone setting, Light or Dark.
- **Keep it on your phone**: an "Add to home screen" button where the browser offers it, instructions on iOS, and nothing when already installed.
- **About and legal**: links to Privacy, Terms and About.

Signed out: a "You're not signed in" card with Sign in and Create an account buttons.

Signed in and consented, also:

- **Your name**: optional, up to 60 characters, used only to greet.
- **Email**: shows the address. "Change email" opens a sheet that asks for the new address, then a code from each inbox.
- **Sign-in and security**: how this account can sign in (password, Google if on or connected, email codes). **Change password** with the current one, or **Add a password** through an emailed code. **Connect Google** when Google is on and not yet connected, and **Disconnect Google** when it is. Each first asks the person to confirm it's them, with their password or an emailed code, unless they did in the last 10 minutes; connecting then goes to Google and back to Settings, which says whether it worked (`?google=connected`, `taken` or `failed`). Disconnecting needs no password, because email codes always remain. Changing or adding a password signs out other devices. Also **Signed-in devices**: label, last used, and sign-out for each other device.
- **Your data**: "Download my data" gives a JSON file, and warns it isn't encrypted once downloaded.
- **Sign out** and **Sign out on all devices**, the second with a confirmation.
- **Delete your account**: a sheet states what goes and how backups age out, emails a code, and deletes on confirmation. After that, the page shows "Your account and all your data have been deleted."

## How it works

Each section is a small component in one file, using TanStack Query. Sign-out and delete call `clearClientData`, which clears the query cache, guest data, drafts and held work. Download uses `requestFile`, then a Blob URL revoked after 10 seconds. Theme is in [theme.ts](../../apps/web/src/lib/theme.ts): the choice is stored in `localStorage` as `anxiocare-theme`, and "Phone setting" removes the key. `theme-init.js` applies it before first paint.

Server behaviour is documented where it lives: [auth and sessions](auth-and-sessions.md) for email change and sessions, [consent and privacy rights](consent-and-privacy-rights.md) for export and deletion.

## Key files

- [apps/web/src/routes/Settings.tsx](../../apps/web/src/routes/Settings.tsx)
- [apps/web/src/lib/theme.ts](../../apps/web/src/lib/theme.ts)
- [apps/web/public/theme-init.js](../../apps/web/public/theme-init.js)
- [apps/web/src/ui/Sheet.tsx](../../apps/web/src/ui/Sheet.tsx)
- [apps/web/src/ui/OtpInput.tsx](../../apps/web/src/ui/OtpInput.tsx)
- [apps/web/src/lib/api.ts](../../apps/web/src/lib/api.ts) (`requestFile`)
- [apps/api/src/routes/me.ts](../../apps/api/src/routes/me.ts)

## Data and API used

Endpoints: `GET /me`, `PATCH /me`, `GET /me/sign-in-methods`, `POST /me/password`, `POST /me/password/set/request`, `POST /me/password/set`, `DELETE /me/identities/google`, `POST /me/email/request`, `POST /me/email/verify`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /me/export`, `POST /me/delete/request`, `POST /me/delete/confirm`, `GET /meta`.

Browser: `localStorage` key `anxiocare-theme`. That is the app's only `localStorage` use.

## Security/privacy notes

- Email change and deletion each need a fresh emailed code, so a borrowed unlocked phone can't do either.
- A person can't sign out their own current device from the list. The Sign out section does that.
- Theme is the only thing kept beyond a session on the device.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Reload while offline | Account sections don't show. Theme, install and legal do |
| A wrong code at email change | Both boxes clear, with "Those codes didn't work. Check both emails and enter the latest code from each." |
| New address already taken | After both correct codes: 409 and a message |
| Wrong deletion code | The box clears. Nothing is deleted |
| Download fails | The message shows, and the button is usable again |
| `localStorage` blocked | Theme applies for this visit only |
| Revoking fails | Error stays in the sheet |

## Tests that cover it

- [apps/web/e2e/live/settings.spec.ts](../../apps/web/e2e/live/settings.spec.ts)
- [apps/web/e2e/resilience.spec.ts](../../apps/web/e2e/resilience.spec.ts) (`nothing in localStorage but the theme`)
- [apps/api/test/hardening.test.ts](../../apps/api/test/hardening.test.ts) (email change)
- [apps/api/test/erasure.test.ts](../../apps/api/test/erasure.test.ts)
- [apps/api/test/sessions.test.ts](../../apps/api/test/sessions.test.ts)
- [apps/api/test/data.test.ts](../../apps/api/test/data.test.ts) (`profile`)

## Known limits

- **A signed-in person who hasn't accepted the current consent version sees no account sections here.** The API would let them export and delete. See [consent and privacy rights](consent-and-privacy-rights.md#known-limits).
- The display name isn't validated beyond length.
- Theme doesn't sync across devices.
