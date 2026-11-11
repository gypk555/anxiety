# Quick exit

## Purpose

For someone who has to hide the app straight away, for example because someone nearby shouldn't see it. One tap and the app is off the screen, replaced by a weather search.

## User-facing behaviour

- A "Quick exit" button sits in the header on every screen, signed in or not, including during the check-in and on Help. It is to the left of "Get help", and quieter: an outlined pill in `--ink-soft`, so it never competes with Get help.
- Below 480px it reads "Exit" on screen. Its accessible name is always "Quick exit".
- Every open sheet has its own Quick exit button next to Close, because a modal `<dialog>` makes the header unreachable.
- Pressing Escape three times within 1.5 seconds does the same, unless focus is in a text field. Any other key starts the count again.
- It never asks for confirmation.
- When used:
  1. The current history entry is replaced with `https://www.google.com/search?q=weather+today`, through `location.replace`.
  2. The app root is hidden and open dialogs are closed, so nothing shows while the new page loads, or if it can't load at all.
  3. The query cache, journal drafts, held work, the guest check-in and result in `sessionStorage`, and the value of every text field are cleared.
- It doesn't sign out. There is no time for the network.
- Help has an "About quick exit" section. It says what quick exit does, that it can't remove earlier history entries, that the account stays signed in, and how to use private browsing or clear history.

## How it works

[`quickExit()`](../../apps/web/src/lib/quick-exit.ts) is synchronous from start to end. It sets an `exiting` flag, calls `location.replace`, then runs each clean-up step inside its own `try`, so one failing step can't stop the others. It makes no request and returns nothing, so nothing can be awaited.

`isExiting()` is read by every `beforeunload` handler, in the thought record form and the safety plan form. Otherwise an unsaved draft would make the browser ask "Leave site?" and hold the page on screen.

The Escape listener is installed by `Shell` on `window`, in the capture phase, so an open dialog's own Escape handling can't swallow the presses. Text inputs, textareas and content-editable elements don't count. Checkboxes, radios, buttons and ranges do.

The service worker isn't involved. A navigation to another origin never goes through it.

## Key files

- [apps/web/src/lib/quick-exit.ts](../../apps/web/src/lib/quick-exit.ts)
- [apps/web/src/ui/QuickExit.tsx](../../apps/web/src/ui/QuickExit.tsx)
- [apps/web/src/shell/Shell.tsx](../../apps/web/src/shell/Shell.tsx) (header, Escape listener)
- [apps/web/src/ui/Sheet.tsx](../../apps/web/src/ui/Sheet.tsx)
- [apps/web/src/routes/Help.tsx](../../apps/web/src/routes/Help.tsx) (`QuickExitHelp`)

## Data and API used

None. No request is made, sign-out included.

## Security/privacy notes

- The destination is a plain link target. Nothing is fetched from Google by the app itself, and the CSP is unchanged.
- In e2e tests the Google page is a local stub, so no test reaches the internet.
- The encrypted safety plan copy in IndexedDB is left alone. Deleting it needs an asynchronous call, and it is unreadable without the app anyway.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Offline | The navigation fails and the browser shows its own error page. The app root is already hidden either way |
| Slow network | The app is hidden at once, while the weather page loads |
| A sheet is open | Its own Quick exit button works, and so does Escape three times |
| Unsaved journal or plan text | No "Leave site?" prompt. The text is cleared |
| Typing in a field | Escape doesn't count, so closing an autocomplete never exits by mistake |
| Back after exiting | Goes to the entry before the exited one. That loads the app again, still signed in |
| Navigation throws (some WebViews) | The clean-up still runs |

## Tests that cover it

- [apps/web/src/lib/quick-exit.test.ts](../../apps/web/src/lib/quick-exit.test.ts)
- [apps/web/src/shell/Shell.test.tsx](../../apps/web/src/shell/Shell.test.tsx)
- [apps/web/src/routes/Legal.test.tsx](../../apps/web/src/routes/Legal.test.tsx) (the Help section)
- [apps/web/e2e/live/quick-exit.spec.ts](../../apps/web/e2e/live/quick-exit.spec.ts)

## Known limits

- It can't remove earlier history entries. Someone pressing Back can land on an earlier AnxioCare screen.
- It doesn't sign out. Going back to the app shows the account, still signed in. Help says so.
- The browser's tab switcher and recent-apps screen may keep a snapshot taken before the exit. That is outside the page's control.
- On an installed PWA in standalone mode, the weather page opens inside the app window, or in the browser, depending on the platform. Not yet tried on a real phone: see MT-QX in the manual test cases.
- In WebKit (Safari), Escape is also the browser's "stop loading" key. Pressing it while the page checks for a new service worker cancels that check, and WebKit reports the cancelled fetch as an error in the console. Nothing breaks: the check runs again on the next load. The Escape e2e test allows exactly that one line, through `guard.expectEscapeCancelsServiceWorkerCheck()`.
- Exiting while the service worker's registration request is still in flight is fine for the person, but WebKit logs the cancelled request. The other quick-exit e2e tests wait for registration before exiting, so the guard stays strict for everything else.
