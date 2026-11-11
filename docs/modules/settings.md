# Settings

## Purpose

One screen for a person's account, data rights and preferences.

## User-facing behaviour

`/settings` is reachable by anyone. It isn't behind `RequireAccount`.

The page is grouped into labelled lists on patches ("rows"), with no divider lines between rows. Each row names one setting, shows its current state on the right ("Set", "Not connected", "Always on"), and opens a sheet when tapped. Destructive actions come last.

Everyone sees:

- **Appearance**: a three-way segmented control: Phone setting, Light or Dark (a radio group: one Tab stop, arrow keys move and choose).
- **On this phone**: an "Add to home screen" row where the browser offers it, the iOS instructions as a row's description, and nothing when already installed.
- **About and legal** (signed out) or inside **Your data and privacy** (signed in): rows linking to Privacy notice, Terms of use and About.

Signed out: a "You're not signed in" card with Sign in and Create an account buttons, first.

Signed in and consented, top to bottom:

- **Profile card**: the initial in a haldi circle, the name (or "Your account") and the email.
- **Account**: **Name** row (value is the name or "Not set") opens the "Your name" sheet: optional, up to 60 characters, used only to greet, saved with "Save name", after which the sheet closes and "Name saved" is announced. **Email** row opens "Change your email", which asks for the new address, then a code from each inbox.
- **Sign-in and security**: **Password** row ("Set" or "Not set") opens Change your password (with the current one) or Add a password (through an emailed code). **Google** row, only when Google is on or connected ("Connected" / "Not connected"): connecting first shows "Connect Google?" with the privacy note, disconnecting shows "Disconnect Google?". Each then asks the person to confirm it's them, with their password or an emailed code, unless they did in the last 10 minutes; connecting goes to Google and back to Settings, which says whether it worked (`?google=connected`, `taken` or `failed`). Disconnecting needs no password, because email codes always remain. Changing or adding a password signs out other devices. **Email codes**: "Always on", not tappable. **Signed-in devices** row ("Only this device" or "This device and N others") opens a sheet listing label, last used, and sign-out for each other device.
- **Appearance** and **On this phone**, as above.
- **Your data and privacy**: **Download my data** gives a JSON file (the row's description warns it isn't encrypted once downloaded, then says "Preparing" and "Download started."), followed by the legal rows.
- **Sign out** and **Sign out on all devices**, the second with a confirmation.
- **Delete my account**, alone at the bottom in an outlined group: a sheet states what goes and how backups age out, emails a code, and deletes on confirmation. After that, the page shows "Your account and all your data have been deleted."

Signed in with consent outstanding: "Your agreement is needed" first, then the email as a plain row (not changeable until they agree), Sign-in and security, Appearance, Your data and privacy, sign out and delete. No Name row.

## How it works

Each group is a small component in one file, using TanStack Query, built from `SettingsGroup` and `SettingsRow` in [SettingsList.tsx](../../apps/web/src/ui/SettingsList.tsx). A row is a button (opens a sheet here), a link (another page) or plain text; it is named by its title and described by its value and description. Sign-out and delete call `clearClientData`, which clears the query cache, guest data, drafts and held work. Download uses `requestFile`, then a Blob URL revoked after 10 seconds. Theme is in [theme.ts](../../apps/web/src/lib/theme.ts): the choice is stored in `localStorage` as `anxiocare-theme`, and "Phone setting" removes the key. `theme-init.js` applies it before first paint.

Server behaviour is documented where it lives: [auth and sessions](auth-and-sessions.md) for email change and sessions, [consent and privacy rights](consent-and-privacy-rights.md) for export and deletion.

## Key files

- [apps/web/src/routes/Settings.tsx](../../apps/web/src/routes/Settings.tsx)
- [apps/web/src/lib/theme.ts](../../apps/web/src/lib/theme.ts)
- [apps/web/public/theme-init.js](../../apps/web/public/theme-init.js)
- [apps/web/src/ui/Sheet.tsx](../../apps/web/src/ui/Sheet.tsx)
- [apps/web/src/ui/SettingsList.tsx](../../apps/web/src/ui/SettingsList.tsx)
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

- [apps/web/src/routes/Settings.test.tsx](../../apps/web/src/routes/Settings.test.tsx), [SignInSecurity.test.tsx](../../apps/web/src/routes/SignInSecurity.test.tsx), [SettingsList.test.tsx](../../apps/web/src/ui/SettingsList.test.tsx)
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
