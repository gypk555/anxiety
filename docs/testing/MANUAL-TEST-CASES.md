# Manual test cases

Step-by-step human tests for AnxioCare. 286 cases: 103 P0, 141 P1, 41 P2, 1 P3. UI labels are in **bold**, and are exactly what the app shows, checked against the source on 2026-11-07, and on 2026-11-11 for MT-QX and MT-SP. `<n>` or `<date>` inside a label is a value that varies. Bold lead-ins such as **Known issue** are not labels.

**None of these has been run yet.** The Result lines are blank on purpose. See `docs/testing/TEST-REPORT.md` for what has and hasn't been tested, and `docs/testing/TEST-CASES.md` for the automated catalogue.

**Priority.** P0: a person could be harmed, or data exposed: blocks release. P1: main path broken for many: blocks unless the owner accepts it in writing. P2: degraded path, or a smaller group: fix soon. P3: minor.

## Run sheet

Automation is green and proves a lot on localhost. It does not prove the following, which is why a person has to run them.

| What automation can't prove | Why | Cases | Who |
| --- | --- | --- | --- |
| A tap on a helpline reaches a human | Tests read `href="tel:…"`. No phone rang, ever | MT-HELP-01 to 17 | Owner, two SIM operators |
| Works on real phones | Playwright emulates a viewport in desktop WebKit and Chromium | MT-DEV-01 to 11 | Tester with devices |
| Install, icons, shortcuts, update prompt | No test installs the app | MT-PWA-01 to 07 | Tester |
| Real offline, airplane mode, 2G, captive portal | Tests use a browser switch, not a radio | MT-OFF-01 to 12 | Tester, real network |
| Mail arrives, not in spam, lock-screen text, autofill | Tests use a file and a local SMTP stub | MT-MAIL-01 to 15 | Tester, real inboxes |
| Shared-phone privacy | Needs two people, one phone, real browser history and downloads | MT-SHR-01 to 10 | Two testers |
| Screen readers, large font, dark mode, colour | Axe cannot listen or judge; it only fails serious and critical rules here | MT-ACC-01 to 23 | Screen reader user if possible |
| How sounds actually sound, and how they stop | Tests prove start, stop, hide and leaving close the audio without errors, on mocked Web Audio. Nothing hears them | MT-TOL-08 to 14 | Tester, with headphones at low volume first |
| Haptics and wake lock | Not available in emulation | MT-TOL-04 to 06 | Tester |
| A printout a doctor can use | One stylesheet check. Nobody has looked at the paper | MT-PRN-01 to 06 | Tester, a clinician |
| Session expiry, email change, export, deletion on the real stack | Tested on localhost. Not on Supabase, Render, real mail | MT-JRN-10 to 12, MT-SET-03 to 05, MT-SET-09 to 14 | Tester, staging access |
| Consent re-prompt after a real version bump | Tested live by making one account's accepted version old. No real bumped build has been deployed | MT-CON-04 to 06 | Tester, staging deploy |
| Real password managers, real Google, and the database tools on real Supabase | Tests check attributes, use a fake provider, and embedded Postgres. Nothing has met the real thing | MT-AUTH-11 to 22 | Tester, owner |
| Clinical wording and legal text are right | A code test cannot judge this | MT-CLN-01 to 10 | Clinician, lawyer |
| Supabase and Render behave as designed | The code has never run there | MT-DEP-01 to 20 | Owner |
| Quick exit really hides the app | Tested in emulation with a stubbed weather page. No real back button, tab switcher or installed app | MT-QX-01 to 10 | Tester, two phones |
| The safety plan opens offline and dials | Tested with a browser switch and `tel:` attributes | MT-SP-01 to 12 | Tester, a test contact's phone |
| Production headers survive the edge | Tested behind a local TLS terminator, not Cloudflare | MT-SEC-01 to 14 | Owner or engineer |

### Order of work

**First launch: run everything.** Rough effort, which is an estimate and not a measurement: 3 to 5 tester days, plus clinician and lawyer time.

1. **Deploy to staging:** MT-DEP, then MT-SEC. If these fail, nothing else means much.
2. **Lives first:** MT-HELP, with MT-OFF-01, 02 and 08, and MT-ACC-01 and 02.
3. **Real phones:** MT-DEV, MT-MAIL, MT-AUTH, MT-CON, MT-CHK, MT-RES.
4. **Account and privacy:** MT-JRN, MT-SET, MT-SHR, MT-PRN, MT-TRD.
5. **The rest:** MT-TOL, MT-PWA, MT-OFF, MT-ACC, MT-NAV.
6. **Sign-off items:** MT-CLN. Give the clinician a staging link and a printed copy.
7. **Repeat MT-DEP and MT-SEC on production**, then MT-DEP-09 with a throwaway account. Then the sign-off page.

**Every later release, at minimum:** all P0 cases in MT-HELP (10), MT-DEP-01, 07, 09, MT-SEC-01 to 07, MT-MAIL-01 and 03, MT-CHK-01 and 06, MT-RES-04, MT-OFF-01 and 02, MT-SET-12 and 13, MT-JRN-10 and 11. Add every case touching what changed. If the release changes wording, repeat MT-CLN. If it changes the consent version, repeat MT-CON-04 to 06.

### Devices

Fill this in before you start. Use the same words in each case's Result line.

| Device label in cases | What it means | Model, OS, browser version | Tester |
| --- | --- | --- | --- |
| Low-end Android, Chrome | 2 to 3 GB RAM, Android 10 to 12, current Chrome, a real SIM | | |
| Recent iPhone, Safari | Current or previous iOS, a real SIM | | |
| 320px phone | Reports 320 CSS px wide, such as iPhone SE 1st gen | | |
| Foldable or tablet | Foldable, or a tablet with split view | | |
| Phone in landscape | Either phone, rotation unlocked | | |
| Any phone | Whichever is at hand. Vary between runs | | |
| Desktop browser | Only where the case says so. The product is for phones | | |
| Laptop terminal | `curl`, `openssl`, SQL editor, dashboards | | |

### Test data and care

- **Use made-up content only.** Never type your real thoughts or a real person's details: staging and production are real systems. Delete test accounts afterwards through the app, using MT-SET-12.
- **Use your own inboxes** at Gmail, Outlook, Yahoo and Rediffmail. Keep a list, and note `+tag` spellings share a send quota (5 an hour per network, 20 overall).
- **Helplines are working crisis services.** See the note at MT-HELP. **Never place a test call to 112.**
- **Audio:** start every listening test at low volume.
- Check-in answers to reach each band are in MT-RES. Sign-in needs a real code, so plan for the 45-second resend cooldown.
- Cases that need a bumped consent version, seeded data or a stopped database are marked staging. Do not run them on production.

### Known issues to confirm on a real device

These were found by reading the code while writing this document, and fixed on 2026-11-06. See `docs/testing/TEST-REPORT.md`. Automated tests cover the fixes on emulated devices only, so cases still refer to them as KI-n, for you to confirm on a real one. If you see the old behaviour, record it as a failure.

| ID | Was | Now | Confirm in |
| --- | --- | --- | --- |
| KI-1 | While consent was out of date, a signed-in person saw the guest Home and an empty Settings | Home goes to the prompt. Settings keeps **Download my data**, **Delete my account** and **Sign out** | MT-CON-04, 05 |
| KI-2 | Help claimed the numbers had been checked, but no call had been made | Says **checked against published sources**, and not yet confirmed by phone, until someone has phoned | MT-HELP-09 |
| KI-3 | The installed app locked to portrait | The lock is gone from the manifest | MT-DEV-07 |
| KI-4 | Consent screen told an existing account it would be removed | First-time and re-prompt wording differ | MT-CON-03, 05 |
| KI-5 | **Go again** restarted breathing without the chosen sound | The sound comes back | MT-TOL-07 |
| KI-6 | Wake lock not re-requested after unlocking, and the timer ran on while hidden | Asked for again, and hidden time doesn't count | MT-TOL-06 |
| KI-7 | The screen could say **Playing. Tap to stop.** while silent | Says **Paused by your phone. Tap to play again.** | MT-TOL-11 |
| KI-8 | At the failed-guess cap, the message only said to send a new code | After two wrong codes, a general note explains the pause. Accepted risk: `docs/SECURITY-EXCEPTIONS.md` | MT-AUTH-09 |
| KI-9 | Signed in, offline, fresh load: Settings showed nothing about why | Says **We can't load your account** | MT-OFF-05 |
| KI-10 | No resend inside the email-change and delete sheets | **Send new codes** and **Send a new code**, after a 45-second wait | MT-SET-05, MT-SET-14 |
| KI-11 | Theme options had `role="radio"` with no arrow keys | Arrow keys work, with one Tab stop | MT-ACC-18 |
| KI-12 | A test's name said the opposite of what it asserted | Renamed. Policies for the runtime role only, as decided in `docs/decisions/005-rls-role-scoped-policies.md` | MT-DEP-05 |
| KI-13 | The API process didn't compress | Static files are precompressed. API responses are not compressed | MT-DEP-19 |


## Helplines: real calls and WhatsApp (MT-HELP)

The failure the spec names first: a person in distress cannot reach a helpline in one tap. Automation proves the `href` values and nothing else. Run this section on every release, on real SIMs, and log each call in the record on the sign-off page. **Be considerate:** these are working crisis lines. Call at a quiet time, say at once that you are checking a number listed in an app, ask only whether the number and hours are right, and hang up. Never pretend to be in crisis.

### MT-HELP-01: Emergency 112 opens the dialler, no test call

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** SIM in the phone. Open **Get help** from Home.

**Steps:**

1. Tap **Call 112** once.
2. Look at the dialler.
3. Cancel without placing the call.

**Expected result:** The dialler opens with 112 filled in after exactly one tap, with no sign-in or extra screen. Do not place a real call to 112.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-02: Tele-MANAS 14416: tap, ring, answered

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** SIM with voice balance. Note the operator (Jio, Airtel, Vi, BSNL). Help screen open.

**Steps:**

1. Under **Tele-MANAS** tap **Call 14416**.
2. Place the call.
3. Wait for an answer or the recorded menu.
4. Say you are checking a listed number; confirm service name and hours.
5. Hang up and log it.

**Expected result:** One tap opens the dialler with 14416. The call connects to Tele-MANAS and an answer or official menu is reached. Hours match **24 hours, every day**. Repeat on at least two operators.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-03: Tele-MANAS toll-free: tap, ring, answered

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** SIM with voice balance. Help screen open.

**Steps:**

1. Under **Tele-MANAS (toll-free)** tap **Call 1800-891-4416**.
2. Check what the dialler shows.
3. Place the call and wait for an answer.
4. Log it.

**Expected result:** The dialler opens. The link dials `+9118008914416`. The call connects to Tele-MANAS. **Watch for:** Indian 1800 numbers are not always reachable in +91 form. If this fails while dialling 1800-891-4416 by hand works, raise it as a P0 bug: the card exists for phones that cannot dial the short code.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-04: Vandrevala Foundation: tap, ring, answered

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** SIM with voice balance. Help screen open.

**Steps:**

1. Under **Vandrevala Foundation** tap **Call +91 99996 66555**.
2. Place the call and wait for an answer.
3. Confirm service name and hours. Log it.

**Expected result:** Dialler opens with the number. The call reaches Vandrevala Foundation. Hours match **24 hours, every day**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-05: Vandrevala Foundation: WhatsApp opens the right chat

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** WhatsApp installed and signed in.

**Steps:**

1. Under **Vandrevala Foundation** tap **Message on WhatsApp**.
2. Check the chat that opens.
3. Send a short message saying you are checking a listed number, only if the service accepts this; otherwise stop at the open chat.
4. Return to the app.

**Expected result:** WhatsApp opens a chat with +91 99996 66555, and the business name is what you expect. No message text is pre-filled and the chat link does not name AnxioCare. Going back returns to Help. This is the only helpline with a WhatsApp button in the current data (`packages/shared/src/helplines.ts`): if any other card shows one, that is a bug.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-06: iCALL: tap, ring, answered, and the hours are honest

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** SIM with voice balance. Run on a weekday in daytime, then again out of hours.

**Steps:**

1. Under **iCALL (TISS)** tap **Call +91 91529 87821**.
2. Place the call. Log the time and outcome.
3. Repeat out of hours.

**Expected result:** In hours: reaches iCALL. Out of hours: the outcome matches **Monday to Saturday, daytime. Check the website for current hours.**, and a person calling at night would not be misled.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-07: WhatsApp not installed, or no data

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** WhatsApp removed, then repeat with mobile data off.

**Steps:**

1. Tap **Message on WhatsApp**.
2. Note what opens.
3. Go back to Help.
4. Tap **Call +91 99996 66555**.

**Expected result:** A browser or store page opens for wa.me, or fails with no data. Help stays reachable by going back, and the call link still works. Record what a person sees: the WhatsApp button has no offline note.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-08: Helpline websites open

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Online.

**Steps:**

1. Tap **Visit the Tele-MANAS website**.
2. Back. Tap **Visit the iCALL (TISS) website**.

**Expected result:** Both official sites load and the numbers shown there match the app. Back returns to Help. The referrer is not sent (`rel="noopener noreferrer"`, `no-referrer`).

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-09: Numbers on screen match the record, and the date is true

**Priority:** P0 | **Device:** Any phone

**Preconditions:** All of MT-HELP-02 to 06 done. Help screen open.

**Steps:**

1. Compare each number on screen with the calls log on the sign-off page.
2. Read the line beginning **Helpline numbers**.
3. Compare the date with the date of your calls.
4. Open **About AnxioCare** and read **The helplines**.

**Expected result:** Every number is one you reached. Until the procedure in `docs/CLINICAL-SAFETY.md` is done, the line says **Helpline numbers checked against published sources on 6 Nov 2026. They have not yet been confirmed by phone.** (KI-2). Do not sign off until, after real calls, it says **Helpline numbers confirmed by phone on** the real date of those calls.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-10: Severe result: one tap to a call

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A guest result in the **Severe** band (see MT-RES-04).

**Steps:**

1. On the result, find **You don't have to manage this alone**.
2. Tap **Call 14416**.
3. Cancel in the dialler.
4. Tap **See all helplines**.

**Expected result:** The call block is near the top, not below the fold on a small phone. One tap opens the dialler. **See all helplines** opens Help.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-11: Self-harm guidance links dial

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Help screen open.

**Steps:**

1. In **If you're having thoughts of harming yourself**, tap the linked 14416.
2. Cancel. Tap the linked 112.
3. Cancel.

**Expected result:** Each inline link opens the dialler with the right number, and is large enough to hit first time with a shaking thumb. Note any misses.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-12: Help before the app has loaded

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Clear site data. Throttle to 2G, or use a very weak signal.

**Steps:**

1. Open the app URL.
2. Watch the first screen while it loads.
3. If **Still loading. If you need someone to talk to now, you can call:** appears, tap **Emergency: call 112**, then cancel.
4. Tap **Tele-MANAS: call 14416**, then cancel.

**Expected result:** The links fade in while the script loads, and they dial without any script running. Record how many seconds pass before they appear.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-13: JavaScript off

**Priority:** P1 | **Device:** Low-end Android, Chrome

**Preconditions:** Chrome site settings: JavaScript blocked for this site.

**Steps:**

1. Open the app URL.
2. Read the page. Tap **Emergency: call 112**, then cancel.

**Expected result:** **AnxioCare needs JavaScript for the check-in. You can still call for help:** shows with working call links.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-14: A device with no calling

**Priority:** P1 | **Device:** Foldable or tablet

**Preconditions:** Wi-Fi-only tablet.

**Steps:**

1. Tap **Call 112**.
2. Tap **Call 14416**.

**Expected result:** The tablet may offer FaceTime, Skype or nothing. Record the behaviour. The number stays readable on screen, so it can be dialled from another phone. There is no crash and no blank page.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-15: Dual-SIM and call from the installed app

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Dual-SIM phone if available. App installed to the home screen (MT-PWA-01).

**Steps:**

1. Open the installed app.
2. Tap **Get help**, then **Call 14416**.
3. Choose a SIM if asked.
4. After the call, return to the app.

**Expected result:** The dialler opens from standalone mode on Android and iOS. After the call, the app is on Help, with nothing lost.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-16: Help has no animation and asks for nothing

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed out.

**Steps:**

1. Open **Get help**.
2. Watch the page for 30 seconds. Scroll it.
3. Read **Talk to someone** and the footer line.

**Expected result:** Nothing moves. No sign-in, no cookie banner, no pop-up. The page says these services are run independently and that AnxioCare is not an emergency service.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-HELP-17: Tap **Breathe** and **Ground yourself** from Help

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Help screen open.

**Steps:**

1. Under **While you wait, or if you can't call** tap **Breathe**.
2. Tap **Get help** to return. Tap **Ground yourself**.

**Expected result:** Each tool opens in one tap. **Get help** is present on both and returns to Help.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Real phones and screen shapes (MT-DEV)

Playwright emulates an iPhone 14 viewport in desktop WebKit and a Pixel 7 viewport in desktop Chromium. It has never touched a real phone. Each case below is a whole journey on hardware.

### MT-DEV-01: Full guest journey on a low-end Android

**Priority:** P0 | **Device:** Low-end Android, Chrome

**Preconditions:** 2 to 3 GB RAM, Android 10 to 12, current Chrome. Real mobile network. No prior visit.

**Steps:**

1. Open the app. Time until **How have the last two weeks been?** is readable.
2. Tap **Start the check-in**, **Begin**, and answer all items.
3. Read the result.
4. Open **Tools**, run **Breathe** for **1 min**.
5. Open **Sounds**, play **Monsoon rain**, stop it.

**Expected result:** Usable throughout. No stuck taps, no visible freeze when a sound starts (the noise buffer is generated on the main thread). Record first-load seconds and whether the phone heats noticeably during breathing.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-02: Full account journey on a recent iPhone

**Priority:** P0 | **Device:** Recent iPhone, Safari

**Preconditions:** Safari, current iOS. Real inbox on the phone.

**Steps:**

1. Sign in by email through **Email me a code instead** and the code screen.
2. Accept consent.
3. Take a check-in, see it saved.
4. Write a thought record.
5. Open **Trends**. Open **Settings**. Tap **Sign out**.

**Expected result:** Everything works, including the real `__Host-session` cookie over the production origin. The tab bar sits above the home indicator, and no bottom control is hidden by Safari's toolbar.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-03: Same journeys at 320px

**Priority:** P0 | **Device:** 320px phone

**Preconditions:** A phone reporting 320 CSS px (for example iPhone SE 1st gen), or Android display size at largest to reach 320.

**Steps:**

1. Run the guest journey and the account journey.
2. On the code screen, check all six boxes are visible.
3. On **Breathe with the circle**, check **Begin** is visible without hunting.
4. Open the delete sheet from **Delete my account**.

**Expected result:** No sideways scroll anywhere. No clipped option text. The six code boxes fit. Sheets can be scrolled to their last button.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-04: Foldable: fold and unfold mid-task

**Priority:** P1 | **Device:** Foldable or tablet

**Preconditions:** Foldable, or tablet in split view.

**Steps:**

1. Start a check-in, answer two items.
2. Unfold (or resize the split). Answer one more.
3. Fold again.
4. Open a thought record and repeat.

**Expected result:** Answers and draft survive every change. The layout reflows with no overlap. Help remains in the header.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-05: Tablet and wide layout

**Priority:** P1 | **Device:** Foldable or tablet; Desktop browser

**Preconditions:** Width 768px or more.

**Steps:**

1. Open Home, **Tools**, **Settings**.
2. Check where the navigation is.
3. Open **Privacy notice**.

**Expected result:** At 48rem and wider, the tabs move into the header and the bottom bar goes. Content is a centred column, comfortable to read. No stretched buttons.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-06: Landscape in the browser

**Priority:** P1 | **Device:** Phone in landscape

**Preconditions:** Rotation unlocked. Browser tab, not installed.

**Steps:**

1. Rotate on Home, a check-in question, and a result.
2. On a question, reach all four options.
3. Open **Breathe with the circle**. The illustration hides at short heights: check **Begin** is reachable.
4. Start a session and rotate during it.
5. On the code screen, tap the field so the keyboard opens.

**Expected result:** Nothing is unreachable. The breathing circle and **Stop** are both visible, or one scroll away. With the keyboard open you can still reach **Continue**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-07: Landscape in the installed app

**Priority:** P1 | **Device:** Phone in landscape

**Preconditions:** Installed on Android (MT-PWA-01).

**Steps:**

1. Open the installed app.
2. Rotate the phone.

**Expected result:** The installed app turns with the phone, on Android and on iOS, and nothing is cut off (KI-3). The manifest no longer sets an orientation. An app installed before this change may keep its old manifest until the browser updates it, so note which you tested. See `docs/ACCESSIBILITY.md`.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-08: Safe areas on a notched phone

**Priority:** P2 | **Device:** Recent iPhone, Safari

**Preconditions:** iPhone with notch or Dynamic Island. Also run installed.

**Steps:**

1. Check the header on Home.
2. Check the tab bar.
3. Open a sheet with **Delete my account**.
4. Run breathing and look at the header colour.

**Expected result:** Nothing sits under the notch or the home indicator. The breathing screen's browser chrome goes dark with the night canvas.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-09: Disappearing browser toolbars

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Browser tab.

**Steps:**

1. On a question, scroll to make the toolbar collapse and return.
2. Check the four options stay on screen.
3. Open the first step of a thought record, tap the text area so the keyboard opens.

**Expected result:** `dvh` keeps the option group in view. With the keyboard open, **Next** is reachable by scrolling and the text you type stays visible.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-10: One-handed reach and hit size

**Priority:** P2 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Hold the phone in one hand.

**Steps:**

1. Answer a check-in with your thumb.
2. Use the tab bar.
3. Tap **Get help**.
4. On Grounding, tap each circle.
5. On Trends, tap a delete icon.

**Expected result:** Answers and the tab bar sit in thumb reach. **Get help** at the top right is reachable with a stretch: record whether that is acceptable for one-tap help. No mis-taps on the 44px controls.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEV-11: Other browsers people in India use

**Priority:** P2 | **Device:** Low-end Android, Chrome

**Preconditions:** Samsung Internet, Firefox for Android, and an in-app browser opened from WhatsApp.

**Steps:**

1. Open the app and take a check-in.
2. Tap **Get help**, then **Call 14416** and cancel.
3. Try sign-in in the WhatsApp in-app browser, and note whether the session is kept when moving to Chrome.

**Expected result:** Core flows work. Record any differences. These browsers are outside the automated matrix.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Installing to the home screen, and updates (MT-PWA)

Nothing in the automated suite installs the app.

### MT-PWA-01: Install on Android

**Priority:** P1 | **Device:** Low-end Android, Chrome

**Preconditions:** Chrome, signed out, second or later visit.

**Steps:**

1. Open **Settings**.
2. Under **On this phone**, tap the **Add to home screen** row.
3. Accept the prompt.
4. Open from the home screen.

**Expected result:** The icon is the real one, with no white square and no clipped mark (maskable). The app opens standalone with no address bar. If Chrome did not fire the install event, the section is absent: record that, and try Chrome's own menu.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PWA-02: Install on iPhone

**Priority:** P1 | **Device:** Recent iPhone, Safari

**Preconditions:** Safari.

**Steps:**

1. Open **Settings**, read the **Add to home screen** row under **On this phone**.
2. Follow it: Share, then Add to Home Screen.
3. Open from the home screen.

**Expected result:** The text reads **In Safari, tap Share, then "Add to Home Screen". Help and the tools will then open offline.** The icon is correct and the app opens standalone. Once installed, the section is gone.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PWA-03: App shortcuts

**Priority:** P1 | **Device:** Low-end Android, Chrome

**Preconditions:** Installed on Android.

**Steps:**

1. Long-press the icon.
2. Tap the **Get help** shortcut.
3. Repeat for **Breathe**.

**Expected result:** Shortcuts appear and open `/help` and `/tools/breathe`.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PWA-04: Sessions and state across install

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in, in the browser, then installed.

**Steps:**

1. Open the installed app.
2. Check whether you are still signed in.
3. Sign in if needed. Kill the app and reopen.

**Expected result:** iOS keeps separate storage for the installed app, so a second sign-in there is expected. After the kill, an account stays signed in. A guest result is gone or kept: record which, because it decides the MT-SHR cases on the installed app.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PWA-05: Update prompt

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Installed or in a tab. A new build deployed while the app is open (staging).

**Steps:**

1. Reopen or wait for the update check.
2. See **New version available**.
3. Tap **Later**, carry on.
4. Reload later, tap **Refresh**.

**Expected result:** The prompt is small and does not cover **Get help** or a check-in option. **Later** dismisses it and work continues. **Refresh** loads the new version.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PWA-06: Update during a check-in

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Mid check-in in an old build. New build deployed.

**Steps:**

1. Answer the next question after the deploy.
2. Finish, and read the result.

**Expected result:** No forced reload, no lost answers. No failed chunk message. If one appears (**This screen didn't load**), **Go to Help** still works and the answers survive **Reload**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PWA-07: Storage cleared by the phone

**Priority:** P2 | **Device:** Low-end Android, Chrome

**Preconditions:** Installed. Clear Chrome storage for the site from Android settings.

**Steps:**

1. Open the app online.
2. Then go offline and open Help.

**Expected result:** Online it rebuilds itself. If offline right after clearing, record what is shown. Help offline depends on the precache being re-fetched.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Offline and poor networks (MT-OFF)

Automation uses `context.setOffline`, which is not the same as a phone with no signal, a captive portal or a 2G link. Start each case after one earlier full online visit unless it says otherwise.

### MT-OFF-01: Airplane mode: Help

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** One earlier visit. Service worker finished (wait 30 seconds on first load). Close all tabs. Airplane mode on.

**Steps:**

1. Open the app URL, or the installed icon.
2. Tap **Get help**.
3. Read the top banner.
4. Tap **Call 14416** (SIM calling is off in airplane mode: expect the phone to say so).

**Expected result:** **You're offline. Help, breathing and grounding still work.** appears. Every helpline and number renders. The dialler opens and the phone itself explains the call cannot go out. The app makes no promise it cannot keep.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-02: Mobile data off, voice on: a real call offline

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** One earlier visit. Data and Wi-Fi off, voice on.

**Steps:**

1. Open the app.
2. Tap **Get help**, **Call 14416**, place the call.
3. Hang up and return.

**Expected result:** The call connects with no internet at all. This is the real proof of the spec's "work offline".

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-03: Airplane mode: tools

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** One earlier visit. Airplane mode.

**Steps:**

1. Open **Tools** then **Breathe** and run **1 min**.
2. Run **Grounding** to the end.
3. Open **Sounds** and play each.

**Expected result:** All work from cache with no failed-chunk screen. Sounds play with no network, because they are generated on the phone.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-04: Airplane mode: guest check-in

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** One earlier visit. Airplane mode.

**Steps:**

1. Tap **Start the check-in** and finish it.
2. Read the result.
3. Tap **Sign in to save**.
4. Tap **Email me a code instead** with a valid address.

**Expected result:** The check-in and result work offline. Sign-in shows **We couldn't reach AnxioCare. Check your connection and try again.**. The result is still there on going back.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-05: Signed in, no connection: saved data screens

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in. Then airplane mode with the app reopened.

**Steps:**

1. Open **Home**.
2. Open **Journal** and **Trends**.
3. Open **Settings**.
4. Open **Privacy notice**.

**Expected result:** Home shows the guest first-run screen by design. Journal and Trends show **You're offline, or the connection dropped** with **Try again** and **Go to Help**, not a sign-in form. Privacy says the operator details can't be loaded right now. Settings shows **We can't load your account**, with **Try again** (KI-9).

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-06: Signed-in check-in ends with no connection

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in. Answer six items online, then airplane mode.

**Steps:**

1. Answer the rest.
2. See the result.
3. Turn the network back on.
4. Tap **Save result**.

**Expected result:** Shows **We couldn't save this just now. It's safe in this tab, so you can try again.**. The result stays. Saving succeeds once, with no duplicate in **Trends**, dated when it was taken.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-07: Journal save with no connection

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in. Thought record at step 5.

**Steps:**

1. Airplane mode on.
2. Tap **Save thought record**.
3. Read the message.
4. Airplane mode off. Tap **Save thought record** again.

**Expected result:** The error says **We couldn't reach AnxioCare. Check your connection and try again. Your draft is safe here.**. All text is kept. The second save creates one record.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-08: First visit on flaky 2G

**Priority:** P0 | **Device:** Low-end Android, Chrome

**Preconditions:** Clear site data. Real weak signal, or Chrome remote-debug throttling at Slow 2G.

**Steps:**

1. Open the app. Note seconds to the first boot links and to Home.
2. Tap **Get help** as soon as you can.
3. Stay 2 minutes for precaching. Then go to airplane mode.
4. Open Help again.

**Expected result:** Help is usable before everything has loaded, because it is in the first bundle. Note the precache: 42 entries, about 841 KiB uncompressed. Record whether Help opens offline after 2 minutes. Record data used if the phone shows it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-09: Signal drops during navigation

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Online, not yet cached if possible (first visit). Toggle airplane mode between taps.

**Steps:**

1. Tap **Tools** with no connection on a first visit.
2. Read the screen.
3. Tap **Go to Help**.
4. Reconnect. Tap **Reload**.

**Expected result:** **This screen didn't load** with **Go to Help** and **Reload**. Help works from the first bundle with no reload. The header still has **Get help**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-10: Captive portal or dead Wi-Fi

**Priority:** P2 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Wi-Fi connected with no internet: a phone hotspot with no data, or a hotel portal.

**Steps:**

1. Open the app.
2. Tap **Journal** while signed in.
3. Wait for the request to time out (up to 20 seconds).
4. Tap **Get help**, then **Call 14416** and cancel.

**Expected result:** The offline banner may not appear, because the phone believes it is online. Requests end in an offline-style message rather than hanging forever. Help works throughout. Record the seconds spent waiting.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-11: Coming back online

**Priority:** P2 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Offline with the banner showing.

**Steps:**

1. Turn the network back on.
2. Check the banner.
3. Tap **Try again** on an error state.

**Expected result:** The banner goes without a reload. **Try again** loads the data.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-OFF-12: Data saver

**Priority:** P2 | **Device:** Low-end Android, Chrome

**Preconditions:** Chrome Lite mode or Android data saver on.

**Steps:**

1. Open the app. Take a check-in. Open Help.

**Expected result:** Works. Fonts may arrive late, and text stays readable meanwhile.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Real email (MT-MAIL)

Automated mail goes to a file or to a local SMTP stub. Nothing has ever reached a real inbox. These cases need the production SMTP provider with SPF and DKIM set up.

### MT-MAIL-01: Delivery to the big inboxes

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Fresh addresses at Gmail, Outlook, Yahoo and Rediffmail, or the nearest available.

**Steps:**

1. Request a code for each with **Email me a code instead**.
2. Time delivery.
3. Note inbox or spam.

**Expected result:** All arrive in the inbox within a minute. Anything in spam or later than 2 minutes is a release blocker for that provider, since the code lasts 10 minutes.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-02: Spam folder and authentication

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** A received message in Gmail. Show original.

**Steps:**

1. Read SPF, DKIM and DMARC results.
2. Read From, Reply-To and Subject.
3. Search the raw source for the words anxiety, anxio, health and mental.

**Expected result:** SPF and DKIM pass, and DMARC passes or is at least aligned. From is **Account Team** at a neutral domain unless overridden. The raw source does not contain those words, including in headers added by the provider.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-03: What a lock screen shows

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Mail app notifications on, previews shown when locked.

**Steps:**

1. Lock the phone.
2. Request a code from another device.
3. Read the notification without unlocking.

**Expected result:** Sender **Account Team**, subject **Your sign-in code**, first line **Use this code to sign in.**. Note that the code itself may show in the preview: record whether it does. Nothing mentions anxiety, health, or the app.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-04: Other mail previews on a lock screen

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** As above.

**Steps:**

1. Trigger each: email change (both addresses), account deletion, a later sign-in, a completed email change.
2. Read each notification.

**Expected result:** Subjects are exactly **Your verification code for your new address**, **Your verification code for your current address**, **Your confirmation code**, **New sign-in to your account** and **Your email address was changed**. Each is neutral. A shared-inbox reader learns nothing about health.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-05: iPhone code autofill

**Priority:** P0 | **Device:** Recent iPhone, Safari

**Preconditions:** Mail set up on the iPhone. Sign in using Safari.

**Steps:**

1. On **Check your email**, tap the **6-digit code** field.
2. Wait for the keyboard suggestion from Mail.
3. Tap it.

**Expected result:** If iOS offers it, the code fills all six boxes and signs in without pressing anything. iOS offers Mail codes only on some versions: record what happened, with the version.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-06: Android code autofill

**Priority:** P0 | **Device:** Low-end Android, Chrome

**Preconditions:** Gmail on the phone. Chrome.

**Steps:**

1. On the code screen, tap the field.
2. Look for a suggestion.
3. If there is none, read the code from the notification.

**Expected result:** The numeric keypad opens. Record whether autofill is offered. Typing by hand works and verifies on the eighth digit.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-07: Paste, with the space

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Code copied from the email, where it prints as `123 456`.

**Steps:**

1. Long-press the field and paste.
2. Repeat with the code in a whole sentence copied from the email.

**Expected result:** The space and words are dropped, all six boxes fill, and it verifies. Only one verification request goes out.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-08: Switching to the mail app and back

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** On the code screen.

**Steps:**

1. Switch to the mail app, copy the code.
2. Switch back. On a low-end phone the tab may reload.
3. Paste.

**Expected result:** The email address and code screen survive. If the phone killed the tab, you land back at **Sign in with your email** with nothing broken, and a new code can be requested.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-09: Wrong code

**Priority:** P1 | **Device:** Any phone

**Preconditions:** On the code screen.

**Steps:**

1. Enter a wrong six digits.
2. Read the message.
3. Enter the right code.

**Expected result:** **That code didn't work. Check the latest email, or send a new code.**. The field clears and regains focus. The right code then works.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-10: Expired code

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A code more than 10 minutes old.

**Steps:**

1. Enter it.
2. Tap **Send a new code** when enabled.
3. Use the new code.

**Expected result:** The expired code shows the same wrong-code message. The new one works.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-11: Resend cooldown, and only the latest code

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Just requested a code.

**Steps:**

1. Watch **Send a new code in <n>s** count down from 45.
2. At zero, tap **Send a new code**.
3. See **New code sent. Use the latest one.**
4. Enter the older code. Then the newer.

**Expected result:** The button stays disabled during the countdown. The old code fails. The new code works.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-12: Sixth code in an hour

**Priority:** P1 | **Device:** Any phone

**Preconditions:** One address, one network, no other requests in the last hour.

**Steps:**

1. Request codes until six have been asked for, waiting out each cooldown.
2. Count mails received.

**Expected result:** Only five mails arrive. The sixth still shows **New code sent. Use the latest one.**, by design, because the response must not reveal quota or account state. Record how confusing this feels, and check the line **Check your spam folder, and that the address is right. If you don't get it in a few minutes, try again later.** is enough.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-13: Address spellings

**Priority:** P2 | **Device:** Any phone

**Preconditions:** A Gmail address.

**Steps:**

1. Sign in as `name@gmail.com`.
2. Sign out. Sign in as `Name@Gmail.com`.
3. Sign out. Sign in as `name+x@gmail.com`.
4. Sign out. Sign in as `n.a.m.e@gmail.com`.

**Expected result:** Case variants are the same account. `+tag` and dotted variants share the send quota, but are separate accounts here, with mail going as typed. Record what you see in **Settings** for each.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-14: Later sign-in notice

**Priority:** P1 | **Device:** Any phone

**Preconditions:** An existing account.

**Steps:**

1. Sign in on a new device.
2. Read the mail in the inbox.

**Expected result:** A mail titled **New sign-in to your account** names a coarse device like **Chrome on Android**, and tells the person to use **Sign out on all devices**. The first sign-in of a new account sends no such notice.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-MAIL-15: Provider outage

**Priority:** P2 | **Device:** Laptop terminal

**Preconditions:** Staging. Point SMTP at a dead host, or use wrong credentials.

**Steps:**

1. Request a code from the app.
2. Read the app's response and the server log.

**Expected result:** The app still moves to **Check your email** (the 202 never reveals delivery). No code arrives. The log has a failure with no address and no provider message. Help and tools are unaffected.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Sign-in screens: every control (MT-AUTH)

Reached from **Sign in to see saved results**, **Sign in to save**, or a tab that needs an account.

### MT-AUTH-01: Sign up from Home

**Priority:** P0 | **Device:** Any phone

**Preconditions:** New address.

**Steps:**

1. On Home tap **Sign in to see saved results**.
2. Read **Sign in**.
3. Enter the address. Tap **Email me a code instead**.
4. Enter the code.

**Expected result:** Goes to **Check your email** showing the address, then **Before we save anything**. The code screen says **The email just says "Your sign-in code". It won't mention anxiety or health.**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-02: Empty and bad addresses

**Priority:** P1 | **Device:** Any phone

**Preconditions:** On the sign-in screen.

**Steps:**

1. Tap **Email me a code instead** with an empty field.
2. Enter `not-an-email`. Tap again.
3. Fix it. Watch the message clear.

**Expected result:** **Enter your email address.**, then **That doesn't look like an email address. Check it and try again.**. No request reaches the server for either. The error clears when typing.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-03: **Continue without an account**

**Priority:** P1 | **Device:** Any phone

**Preconditions:** On the sign-in screen.

**Steps:**

1. Tap **Continue without an account**.

**Expected result:** Goes to Home, as a guest. Nothing was created.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-04: **Use a different email**

**Priority:** P1 | **Device:** Any phone

**Preconditions:** On the code screen.

**Steps:**

1. Tap **Use a different email**.
2. Enter another address and continue.

**Expected result:** Back to the email form. The destination is kept. The back button does not return to the first address's code screen.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-05: **Continue** on a partial code

**Priority:** P1 | **Device:** Any phone

**Preconditions:** On the code screen.

**Steps:**

1. Type four digits. Check **Continue**.
2. Type four more.

**Expected result:** **Continue** is disabled until six digits. On the sixth, it verifies by itself and shows **Checking your code**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-06: Code screen opened directly

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Signed out.

**Steps:**

1. Open `/sign-in/code` in a new tab.

**Expected result:** Goes straight to the email form, with no blank page and no crash.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-07: Why am I here

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed out.

**Steps:**

1. Tap the **Journal** tab.
2. Read the text.
3. Back. Tap **Trends**.
4. Read the text. Back.

**Expected result:** **Thought records are saved to your account, encrypted, so sign in to write one.** and **Trends need saved check-ins, so sign in to see yours.**. Back returns to where you were. After sign-in you land on the tab you asked for.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-08: Already signed in

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Signed in.

**Steps:**

1. Open `/sign-in`.
2. Open `/sign-in/code`.

**Expected result:** `/sign-in` goes straight on to the app, with no second sign-in. Record what `/sign-in/code` does.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-09: Sign-in lockout residual

**Priority:** P2 | **Device:** Laptop terminal

**Preconditions:** Staging only. A test address.

**Steps:**

1. Make 20 wrong guesses at live codes, using scripted requests (4 sends in about an hour at 5 an hour per client, or several clients).
2. Request a fresh code, and enter it correctly.
3. Check a session already signed in on another device.
4. Try deleting the account from that session.

**Expected result:** The right code is refused for up to 24 hours with **That code didn't work. Check the latest email, or send a new code.**. This is the accepted residual risk: `docs/SECURITY-EXCEPTIONS.md`. The existing session keeps working, and account deletion still works, because caps are per purpose. After two wrong codes on one screen, a note says sign-in for this address can be paused for up to 24 hours (KI-8). It appears for anyone who gets two wrong, whatever the state of the address.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-10: Rate-limit message

**Priority:** P2 | **Device:** Laptop terminal

**Preconditions:** Staging. A disposable address.

**Steps:**

1. Send 21 `POST /auth/otp/request` in 10 minutes from one network. See MT-SEC-11.
2. Then try the app from that network.

**Expected result:** The app shows **Too many tries for now. Wait a few minutes, then try again.**. Other routes and Help keep working.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-11: Create an account with a real password manager

**Priority:** P0 | **Device:** iPhone Safari with iCloud Keychain, and Android Chrome with Google Password Manager

**Preconditions:** New address. A guest result in the tab, from a check-in.

**Steps:**

1. On the result, tap **Create an account**.
2. Fill in the address. In **Password**, accept the password the phone suggests.
3. Tap **Continue**. Enter the code from the mail.
4. Agree on **Before we save anything**.
5. Accept the phone's offer to save the password.

**Expected result:** The phone offers a strong password, and to save it against the address. You return to the result, and are offered **Save this result to your account?**. Record exactly what each phone offered.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-12: Create account for an address that has an account

**Priority:** P0 | **Device:** Any phone

**Preconditions:** An address with an account, and access to its inbox.

**Steps:**

1. On **Create an account**, enter that address and a new password. Tap **Continue**.
2. Compare the next screen with the same step for a new address.
3. Read the mail.

**Expected result:** The screens match. The mail, **About your account**, says you already have an account and to sign in or reset your password. It has no code, and doesn't mention health. Nothing about the account changed: the old password still works.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-13: Sign in with a saved password

**Priority:** P0 | **Device:** iPhone Safari, and Android Chrome

**Preconditions:** A password saved by the phone in MT-AUTH-11. Signed out.

**Steps:**

1. Open **Sign in**. Accept the phone's offer to fill the address and password.
2. Tap **Sign in**.

**Expected result:** Both fields fill. You're signed in. A **New sign-in to your account** mail arrives.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-14: A wrong password, the pause, and a known device

**Priority:** P1 | **Device:** Two phones, or a phone and a private browser window

**Preconditions:** Staging. A disposable account with a password, signed in once on phone A, then signed out there. Phone B has never signed in to it, and is on a different network from the attempts in step 2.

**Steps:**

1. On phone B, enter a wrong password three times.
2. On phone B, enter a wrong password until 10 have failed. Then enter the right one.
3. On phone A, sign in with the right password.
4. On phone B, from another network (Wi-Fi to mobile data), sign in with the right password.

**Expected result:** Each failure says **That email and password don't match. Try again, or use "Forgot your password?".**, clears the field and moves focus to it. From the third, a note explains the pause in general terms. After 10 from that network, the right password gets the same message there, for a day. Phone A, a known device, signs in. Phone B signs in from the other network.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-15: Show and hide, and paste

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A password copied to the clipboard.

**Steps:**

1. On **Sign in**, paste into **Password**.
2. Tap **Show password**, then **Hide password**.
3. Send the form with the password showing, and a wrong password.

**Expected result:** Paste works. The toggle shows and hides, and says which it's doing to a screen reader. After sending, the password field is hidden and empty.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-16: Forgot password, on a second device

**Priority:** P0 | **Device:** Two devices

**Preconditions:** An account signed in on device A.

**Steps:**

1. On device B, **Sign in**, **Forgot your password?**, **Email me a code**.
2. Enter the code and a new password. Tap **Set new password**.
3. On device A, open Trends.
4. Read the mails.
5. Repeat step 1 with an address that has no account.

**Expected result:** Device B is signed in. Device A is signed out. **Your password reset code** and **Your password was changed** arrive, and name nothing about health. The address with no account sees the same screen, and gets no mail.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-17: Change and add a password in Settings

**Priority:** P1 | **Device:** Two devices

**Preconditions:** One account with a password, and one made by email code.

**Steps:**

1. With the first, on **Settings**, **Sign-in and security**, tap the **Password** row (**Set**). Try a wrong current password, then the right one.
2. On the second, tap the **Password** row (**Not set**), and follow **Add a password**.
3. Check the other device on each.

**Expected result:** A wrong current password changes nothing. Each success keeps this device, signs out the other, and mails **Your password was changed**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-18: Google, for real

**Priority:** P0 | **Device:** iPhone Safari, Android Chrome, and the installed app on each

**Preconditions:** Production, or staging with the real Google client. Nothing has ever run against real Google.

**Steps:**

1. Take a check-in as a guest, then tap **Sign in to save**.
2. Read the line under **Continue with Google**, then tap it. Choose a Gmail account, or a Workspace account, whose address has no account here.
3. Read Google's consent screen. Check which permissions it lists.
4. Finish, and agree to the notice.
5. Repeat from an installed app icon. Record what happens to the window.

**Expected result:** Google shows the name you set, and asks only for your email address. You return signed in, go through consent, and **Save this result to your account?** is offered. Record whether the guest result survives in the installed app, where the phone may open Google in a separate view.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-19: Google with an existing address, connecting, and disconnecting

**Priority:** P0 | **Device:** Any phone

**Preconditions:** An account with a password, on an address that is also a Google account.

**Steps:**

1. Sign out. Tap **Continue with Google**, with that account.
2. Sign in with your password. In **Settings**, tap the **Google** row, then **Connect Google**. You signed in moments ago, so it goes straight to Google: choose that Google account. (After 10 minutes it would first ask you to confirm it's you.)
3. Read the mail. Sign out, then **Continue with Google** again.
4. Wait over 10 minutes. In **Settings**, tap the **Google** row (**Connected**), then **Disconnect**. Confirm it's you, this time with an emailed code, then confirm.
5. Connect Google again, then sign out and reset the password with **Forgot your password?**.

**Expected result:** Step 1 is refused with a message to sign in another way and connect Google in Settings; nothing is linked. Step 2 returns to Settings, which says Google is connected, and **Google sign-in was added to your account** arrives. Step 3 signs in to the same account, with its data. Step 4 asks to confirm before disconnecting, needs no password, and mails a notice. Step 5 removes Google, and a mail says Google was disconnected because the password was reset.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-20: Google button off

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A deployment with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` unset.

**Steps:**

1. Open **Sign in** and **Create an account**.
2. Open `/api/v1/auth/google/start` directly.

**Expected result:** No button, and no mention of Google. The direct link returns to **Sign in** with a neutral message.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-21: Screen reader on the new screens

**Priority:** P1 | **Device:** iPhone with VoiceOver, or Android with TalkBack

**Preconditions:** Signed out.

**Steps:**

1. Go through **Sign in** with a wrong password, then **Create an account** to the code, with the screen off.

**Expected result:** Each field is named. The hint is read. Errors are announced. Focus lands on each new screen's heading. **Show password** says what it does, and what state it's in.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-AUTH-22: Tooling against real Supabase

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** The Supabase project from [DEPLOYMENT.md](../DEPLOYMENT.md). The tools have only met embedded Postgres.

**Steps:**

1. Run `npm run db:setup`, twice.
2. Run `npm run db:verify`.
3. Run `npm run doctor` with the production environment.
4. Search the terminal output for your database password and for a value from `.env.secrets`.

**Expected result:** Both setups succeed. The second says **No pending migrations**, and doesn't change `.env.secrets`. Every check says **PASS**. Neither secret is in the output. **Record anything that differs from the docs:** this is the first time these have met Supabase.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Consent (MT-CON)

Reached after the first code on a new account.

### MT-CON-01: Read and accept

**Priority:** P0 | **Device:** Any phone

**Preconditions:** New account, code entered.

**Steps:**

1. Read **Before we save anything** to the end, on a phone.
2. Tap **privacy notice**, read, go back.
3. Tap **terms**, read, go back.
4. Tick **I am 18 or older.** and **I agree to AnxioCare storing my check-ins and thought records, which are health information, as described above.**
5. Tap **Agree and continue**.

**Expected result:** Plain language, nothing hidden. Going to the legal pages and back keeps you on the gate. After agreeing, you land on the place you were heading.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CON-02: One box or none ticked

**Priority:** P0 | **Device:** Any phone

**Preconditions:** On the consent screen.

**Steps:**

1. Tap **Agree and continue** with neither ticked.
2. Tick one and tap again.
3. Tick both.

**Expected result:** **Please tick both boxes to continue. If you would rather not, you can still use the check-in and tools without an account.**. The message clears when a box changes. No consent is sent until both are ticked.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CON-03: Declining

**Priority:** P0 | **Device:** Any phone

**Preconditions:** New account on the consent screen.

**Steps:**

1. Tap **Not now, sign me out**.
2. Check Home.
3. After 24 hours and the purge, query the database as in MT-DEP-11.

**Expected result:** You are a guest on Home, and the tools still work. Before you tap, the screen says **If you don't agree, nothing more is saved, and this new account, which holds only your email address and this device's name, is deleted after 24 hours.** (KI-4). The account row is gone by about 25 hours after it was created.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CON-04: Re-prompt after a version bump: journey

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Staging. An account with a saved check-in, consented. Deploy a build with `CONSENT_VERSION` raised in `packages/shared/src/schemas.ts`.

**Steps:**

1. Open the app, signed in.
2. Look at Home.
3. Tap **Trends**.
4. Accept on the consent screen.
5. Check Trends and Home.

**Expected result:** Home goes straight to **We've updated our privacy notice**, with **What changed** and **Your data is kept** (KI-1). After accepting, your data is intact, and a new consent row exists with the new version and date.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CON-05: Re-prompt: rights while not agreeing

**Priority:** P0 | **Device:** Any phone

**Preconditions:** As MT-CON-04, not yet accepted.

**Steps:**

1. Open **Settings**.
2. Look for **Download my data**, **Delete my account**, and **Sign out**.
3. From the consent screen, read the last line, then tap **Not now, sign me out**.
4. Sign in again.

**Expected result:** All three are in Settings and work without agreeing, under **Your agreement is needed** (KI-1). **Download or delete my data** on the consent screen leads there. The last line reads **If you don't agree, your account and data stay as they are, but the app can't show or save your check-ins and journal until you do.**, with nothing about 24 hours (KI-4).

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CON-06: Old tab sends the old version

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Staging. Tab open on the consent screen of the old build. New build with a raised version deployed.

**Steps:**

1. Tick both, tap **Agree and continue** in the old tab.
2. Reload and try again.

**Expected result:** The old tab gets a readable error (the server only accepts the current version), not a crash and not a false success. After reload, it works.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CON-07: Consent screen when not signed in

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Signed out.

**Steps:**

1. Open `/consent`.

**Expected result:** Goes to the sign-in form.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CON-08: Guest result across consent

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Guest result on the phone, new address.

**Steps:**

1. Tap **Sign in to save**.
2. Complete code and consent.

**Expected result:** Returns to the result with **Save this result to your account?**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Check-in (MT-CHK)

Every button on `/check-in` and `/check-in/:step`.

### MT-CHK-01: Start to finish, by touch

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Guest.

**Steps:**

1. Tap **Start the check-in**. Read **Seven questions about the last two weeks**.
2. Tap **Begin**.
3. Answer each item.
4. Answer the difficulty question.

**Expected result:** One question per screen. Auto-advance feels unhurried: about a quarter of a second, with the choice visibly marked first. Progress shows `1/7` to `7/7`, then **Last one**. The stem is on each.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-02: Double tap and fast tap

**Priority:** P1 | **Device:** Low-end Android, Chrome

**Preconditions:** On any question.

**Steps:**

1. Double-tap an option.
2. Tap one option then another quickly.

**Expected result:** Moves one question. The last option tapped before advancing is what is stored. Check by going **Back**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-03: **Back** and the browser back

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Answered three items.

**Steps:**

1. Tap the **Back** arrow.
2. Check the previous answer is marked.
3. Use the system back gesture.
4. Change an answer.
5. Go on and finish.

**Expected result:** Answers persist and can be changed. The score reflects the changed answer. Back from question 1 reaches the intro.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-04: **Not now**

**Priority:** P1 | **Device:** Any phone

**Preconditions:** On the intro.

**Steps:**

1. Tap **Not now**.

**Expected result:** Home. Nothing stored.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-05: Resume after leaving

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Answered three items.

**Steps:**

1. Tap the wordmark to go Home.
2. Read **Continue your check-in** and its count.
3. Tap it.
4. Go to `/check-in`. Read the buttons.
5. Tap **Start again**.

**Expected result:** The count says **You've answered 3 of 7 questions.**. Resuming lands on question 4. The intro shows **Continue from question 4** and **Start again**. **Start again** clears the answers.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-06: **Get help** during a question, and back

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Mid check-in.

**Steps:**

1. Tap **Get help**.
2. Tap the system back.

**Expected result:** Help opens in one tap. Back lands on the same question, with no answers lost.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-07: All answers **Not at all**

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Guest.

**Steps:**

1. Answer **Not at all** seven times.

**Expected result:** The difficulty question is skipped. The result shows **Minimal range**, 0 out of 21, with no difficulty line.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-08: Tampering with the URL

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Answered two items.

**Steps:**

1. Edit the URL to `/check-in/6`.
2. Then `/check-in/abc`, `/check-in/0`, `/check-in/8`.
3. Then `/check-in/difficulty`.

**Expected result:** `/6` lands on the first unanswered question. Bad steps go to the intro. `/difficulty` too early goes to the first unanswered question. No crash.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-09: Close the tab midway

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Answered three items in a browser tab.

**Steps:**

1. Close the tab.
2. Reopen the app in a new tab.

**Expected result:** No answers remain, matching **Without an account, your answers stay in this browser tab and are gone when you close it.**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-10: Phone call during a check-in

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Mid check-in.

**Steps:**

1. Receive a call, or switch away for 10 minutes.
2. Return.

**Expected result:** Same question, answers intact.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-11: Signed-in check-in saves itself

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in, consented.

**Steps:**

1. Take a check-in.
2. Watch the end.

**Expected result:** **Saving your result** appears briefly, then the saved result. One entry appears in **Trends**. No save prompt.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CHK-12: Storage blocked

**Priority:** P2 | **Device:** Recent iPhone, Safari

**Preconditions:** Private Browsing, or a phone where site data is blocked.

**Steps:**

1. Take a check-in.
2. Reload midway.

**Expected result:** The check-in works until reload. No crash. Note what reload does.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Result (MT-RES)

Answers below give each boundary band. The score is the sum, with **Not at all** 0, **Several days** 1, **More than half the days** 2 and **Nearly every day** 3.

### MT-RES-01: Minimal, 4

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Answers 1,1,1,1,0,0,0, difficulty **Not difficult at all**.

**Steps:**

1. Read the whole screen.

**Expected result:** **Minimal range**, **4 out of 21**, the plain meaning and the screening line. No **Talk to a professional**. **Keep an eye on it** is shown. **talk to someone now** is present. The scale marks **Minimal** in words.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-02: Mild, 5

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Answers 1,1,1,1,1,0,0, difficulty **Somewhat difficult**.

**Steps:**

1. Read the whole screen.

**Expected result:** **Mild range**, **5 out of 21**. Difficulty reads **You said these problems have made day-to-day life somewhat difficult.**. No **Talk to a professional**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-03: Moderate, 10

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Answers 2,2,2,1,1,1,1, difficulty **Very difficult**.

**Steps:**

1. Read the whole screen.
2. Tap the linked 14416 under **Talk to a professional**, and cancel.

**Expected result:** **Moderate range**. **Talk to a professional** appears at exactly 10. The link dials.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-04: Severe, 15 and 21

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Answers 3,3,3,2,2,1,1, then all 3s, difficulty **Extremely difficult**.

**Steps:**

1. Read each screen from the top.
2. Note what is above the fold.
3. Read **If you're having thoughts of harming yourself**.

**Expected result:** Calm, not alarming. **You don't have to manage this alone** with **Call 14416** is prominent. The self-harm section states the questions do not ask about that. No red alarm styling, no celebration, no streak.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-05: Colour is not the only signal

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Any result. Grayscale mode on (Android) or a colour filter (iOS).

**Steps:**

1. Read the scale.

**Expected result:** The band is readable from words, range numbers and position alone.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-06: Links on the result

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Any result.

**Steps:**

1. Tap **slow breathing**. Back.
2. Tap **grounding**. Back.
3. Tap **talk to someone now**. Back.

**Expected result:** Each opens the right screen. Back returns to the same result, and a guest result remains.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-07: Guest refresh, then close

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Guest result.

**Steps:**

1. Reload.
2. Go Home. Read **Your check-in result is still here**. Tap it.
3. Close the tab. Reopen the app.

**Expected result:** It survives reload and returns from Home. After closing, it is gone. Opening `/result` then goes to the check-in intro.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-08: Save a guest result through sign-in

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Guest result, an account.

**Steps:**

1. Tap **Sign in to save**.
2. Complete sign-in.
3. Tap **Save result**.
4. Open **Trends**.

**Expected result:** Returns to the result, then saves once, and lands on the saved result. Date and time are those of the check-in, not the save.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-09: **Don't save**

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in, viewing an unsaved result.

**Steps:**

1. Tap **Don't save**.
2. Tap **Keep result**.
3. Tap **Don't save**, then **Discard result**.

**Expected result:** **Discard this result?** opens. Keep closes it and changes nothing. Discard goes Home, and the result is gone.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-10: A result too old to save

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Guest result held open in a tab for more than 24 hours, then sign in.

**Steps:**

1. Tap **Save result**.

**Expected result:** **This result is more than a day old, so it can't be saved. You can take a new check-in instead.**. Nothing saved.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-11: Saved result: delete

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in, saved result open.

**Steps:**

1. Tap **See all your check-ins**. Back.
2. Tap **Delete this result**.
3. Tap **Keep result**.
4. Tap it again, then **Delete result**.
5. Back to the old URL.

**Expected result:** **Delete this result?** guards it. After deleting, you land on **Trends** with the row gone. The old URL shows **There's nothing at this address**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-12: `/result` with nothing there

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Fresh tab, guest.

**Steps:**

1. Open `/result`.

**Expected result:** Goes to the check-in intro.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RES-13: Attribution and date

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Any result.

**Steps:**

1. Scroll to the end.
2. Read **Check in again around <date>**.

**Expected result:** The GAD-7 attribution is shown. The date is 14 days after the check-in, and correct in India time near midnight.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Printing for a doctor (MT-PRN)

One automated test checks the print stylesheet in an emulated desktop browser. Nobody has looked at the paper.

### MT-PRN-01: Save as PDF on Android

**Priority:** P1 | **Device:** Low-end Android, Chrome

**Preconditions:** Result in the **Moderate** band with a difficulty answer.

**Steps:**

1. Tap **Print for a doctor**.
2. Choose Save as PDF.
3. Open the PDF.

**Expected result:** Contains **GAD-7 screening answers**, the seven items, each answer, each score, the total and band, date, difficulty, **Not a diagnosis**, and the 112 and Tele-MANAS line. No tab bar, no **Get help**. Fits one page if possible.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PRN-02: Print or PDF on iPhone

**Priority:** P1 | **Device:** Recent iPhone, Safari

**Preconditions:** Same result.

**Steps:**

1. Tap **Print for a doctor**.
2. Pinch out the preview, save or share it.

**Expected result:** As MT-PRN-01. Record whether the print dialog appears at all in Safari and in the installed app. `window.print()` in an iOS standalone app is a known risk.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PRN-03: Dark mode and always-light paper

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Theme **Dark**.

**Steps:**

1. Print the result.

**Expected result:** White paper with dark text. No dark background and no wasted ink. The scale is legible.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PRN-04: Show it to a doctor

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A real printout and PDF. A clinician.

**Steps:**

1. Ask: could you use this in a consultation? Is anything missing or misleading?

**Expected result:** Clinician confirms the document is usable and identifies the instrument and the scoring. Record their words.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PRN-05: What the printout says about you

**Priority:** P2 | **Device:** Any phone

**Preconditions:** A PDF.

**Steps:**

1. Read the browser-added header, footer and default file name.
2. Read PDF properties.

**Expected result:** Record whether **Your result** and **AnxioCare** appear (the document title is used by many browsers, with the URL). It may be fine for a doctor, but the owner should know a printout left in a shared printer tray names the service.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-PRN-06: Paper print from desktop

**Priority:** P2 | **Device:** Desktop browser

**Preconditions:** A real printer.

**Steps:**

1. Print a **Severe** result.
2. Read it.

**Expected result:** Clear. The support block is omitted as print-hidden, and the summary has the helpline line. The clinician agrees this is acceptable.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Tools: breathing, grounding, sounds (MT-TOL)

No automated test ever plays a sound, feels a vibration or holds a wake lock. Grounding and Sounds have axe coverage only. **Protect your ears:** begin every listening test with the phone at low volume, and raise it slowly. The in-app slider starts at 70.

### MT-TOL-01: Default breathing session

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Open **Breathe** from Tools.

**Steps:**

1. Check **Slow exhale** and **3 min** are selected, and the line reads **In for 4, out for 6.**.
2. Read **If you feel dizzy or short of breath, stop and breathe normally.**
3. Tap **Begin**.
4. Follow for 2 minutes.

**Expected result:** **Settle in** for 3 seconds, then **Breathe in** and **Breathe out**, with a count. Motion is smooth, and matches the count. The warning stays: **Dizzy or short of breath? Stop and breathe normally.**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-02: Each rhythm and length

**Priority:** P1 | **Device:** Any phone

**Preconditions:** On breathing setup.

**Steps:**

1. Run **Box** for **1 min**.
2. Run **4-7-8** for **1 min**.
3. Run **Slow exhale** for **5 min** to the end.
4. Time each with a stopwatch.

**Expected result:** Phases match the summary text. Sessions end on a whole cycle near the chosen length. They end at **Take a moment before you move on**, with no score, streak, or congratulations.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-03: **Stop**, and the end screen

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A session.

**Steps:**

1. Tap **Stop** mid-session.
2. Start again and finish.
3. Tap **Go again**. Stop it.
4. Finish, tap **Try grounding**.
5. Finish another, tap **Back to tools**.

**Expected result:** Stop returns to setup at once. Each end-screen button goes where it says.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-04: Haptics

**Priority:** P1 | **Device:** Low-end Android, Chrome

**Preconditions:** Android, vibration on. iPhone Safari has no `navigator.vibrate`.

**Steps:**

1. On setup, tick **Vibrate**.
2. Tap **Begin**.
3. Feel each phase change.
4. Untick and repeat.
5. On iPhone, look for the checkbox.

**Expected result:** One short pulse at each phase change, none during **Settle in**. Unticked gives none. On iPhone, the **Vibrate** control is absent, not broken. Battery saver may suppress it: record that.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-05: Wake lock during breathing

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Auto-lock at its shortest. Charger unplugged.

**Steps:**

1. Run a **5 min** session without touching the screen.
2. Note if the screen dims or locks.
3. Tap **Stop**, wait for auto-lock.

**Expected result:** The screen stays on for the whole session where supported, and locks normally afterwards. Record on iOS Safari and in the installed app.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-06: Lock or switch away during breathing

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A session running.

**Steps:**

1. Press the power button. Wait 30 seconds. Unlock.
2. Switch to another app and back.
3. Check the wake lock, by waiting for auto-lock.

**Expected result:** The session carries on from where it was when hidden, not jumped ahead, and the screen stays awake for the rest of it (KI-6). Automated tests prove this on a mock only: record what really happens.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-07: Sound with breathing

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Low volume. On setup.

**Steps:**

1. Choose **Sea at night** under **Sound**.
2. Tap **Begin**. Listen.
3. Tap **Stop**.
4. Finish a session with sound, then tap **Go again**.

**Expected result:** The sound fades in and out with no click, and stops on **Stop**. **Go again** brings the chosen sound back (KI-5). Locking the phone stops the sound, and it returns on unlocking if the session is still going.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-08: Listen to every sound

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Good headphones, then the phone speaker. Start at low volume.

**Steps:**

1. Open **Sounds**. Play **Monsoon rain** for 2 minutes.
2. **Sea at night** for 2 minutes.
3. **Ceiling fan** for 2 minutes.
4. **Tanpura** for 2 minutes.
5. Note each one's label while playing: **Playing. Tap to stop.**

**Expected result:** Each matches its description. No clicks or pops at the loop point, no harshness and no sudden loudness. No tone that hurts on a phone speaker at full volume. A calm person would call it calming. Record your honest impression.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-09: Safe volume

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Headphones, sound meter app if available.

**Steps:**

1. Set the phone to about half. Slider at 100. Note the loudness.
2. Slide **Volume** from 100 to 0 and back while playing.
3. At 0, check for silence.

**Expected result:** Nothing is startling at the top of the slider. Slider changes are smooth and audible, and it reads as a percentage to a screen reader. Record the level if you have a meter.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-10: Stop with a locked screen

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A sound playing, screen locks.

**Steps:**

1. Lock the phone.
2. Is it still playing? Note it.
3. Look for any lock-screen control.
4. Try to stop it without unlocking.
5. Unlock, return, and tap to stop.

**Expected result:** The sound stops when the phone locks, on both platforms, and the label no longer says it's playing on return. Record any platform where it keeps playing, because the app relies on the browser saying the page is hidden. There are no lock-screen controls in the current build, because the app does not use Media Session. A tap must start it again.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-11: Interrupted by a phone call

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A sound playing. A second phone to ring it.

**Steps:**

1. Receive a call. Answer it.
2. Hang up. Return to the app.
3. Check the label and whether sound is audible.
4. Tap to stop. Tap to play again.

**Expected result:** Sound must not play over the call. On return, the label is truthful: either the sound has stopped, or it says **Paused by your phone. Tap to play again.** (KI-7). Record what happens, because this depends on the browser reporting the interruption. A tap must restore sound. P0 because the person may be on a helpline call.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-12: Silent switch, Bluetooth, and other audio

**Priority:** P1 | **Device:** Recent iPhone, Safari

**Preconditions:** iPhone with a ring/silent switch. Bluetooth earphones. A music app.

**Steps:**

1. Play with the switch on silent.
2. Connect and disconnect earphones while playing.
3. Start music in another app during playback.

**Expected result:** On silent, Web Audio is expected to be muted. There is no on-screen explanation, so record whether a person would think it is broken. Disconnecting must not blast the speaker at a loud level unexpectedly.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-13: Leaving the screen stops it

**Priority:** P2 | **Device:** Any phone

**Preconditions:** A sound playing.

**Steps:**

1. Tap **Get help**.
2. Back. Play again. Tap a tab.
3. Check silence, within about a second.

**Expected result:** Fades out when leaving, as the screen promises: **They stop when you leave this screen or your phone locks.**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-14: Switching sounds

**Priority:** P2 | **Device:** Any phone

**Preconditions:** A sound playing.

**Steps:**

1. Tap another sound.
2. Tap it again.

**Expected result:** The first is replaced, with only one playing and the label moved. The second tap stops it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-15: Grounding, start to finish

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Open **Grounding** from Tools.

**Steps:**

1. Read **Name 5 things you can see**.
2. Tap each numbered circle. Watch **Tap once for each one.**
3. Tap the last ticked circle again to untick.
4. Tap **Next sense** through **Notice 4 things you can feel**, **Listen for 3 things you can hear**, **Find 2 things you can smell**, **Notice 1 thing you can taste**.
5. Tap **Finish**.

**Expected result:** Counts are right, and **Next sense** works without ticking everything (no one is forced). Five 48px circles fit one row at 320px. It ends at **You're here, in this room**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-16: Grounding end and exit

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Finished grounding.

**Steps:**

1. Tap **Go through it again**. Tap the close control (**Back to tools**).
2. Finish again. Tap **Try breathing**.
3. Finish again. Tap **Back to tools**.

**Expected result:** Each goes where it says. Restart clears all ticks.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TOL-17: **Tools** screen links

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Guest and signed in.

**Steps:**

1. Tap **Breathe**, **Grounding**, **Sounds**, **Thought record**, one after another.

**Expected result:** Guest: **Thought record** goes to sign-in, with **Needs an account.** having said so. Signed in: opens the form.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Journal (MT-JRN)

Signed in and consented throughout.

### MT-JRN-01: Write a thought record: all five steps

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Empty journal.

**Steps:**

1. On **Journal** read **Nothing here yet**. Tap **Write a thought record**.
2. On **What happened?** type and tap **Next**.
3. On **What went through your mind?** type and tap **Next**.
4. On **How did it feel?** choose chips, add your own, move **How strong was it?**, tap **Next**.
5. On **Look at the thought from both sides** fill **What supports it?** and **What doesn't fit?**, tap **Next**.
6. On **Is there a more balanced way to see it?** type, tap **Rate how it feels now**, set it, tap **Save thought record**.

**Expected result:** Lands on the saved record, with headings **What happened**, **How it felt**, **What supported the thought**, **What didn't fit**, **A more balanced view**, **Afterwards**. It appears first in the list.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-02: Required parts

**Priority:** P1 | **Device:** Any phone

**Preconditions:** New record.

**Steps:**

1. Tap **Next** on an empty step 1.
2. Fill it. Tap **Next** on an empty step 2.

**Expected result:** **Write a few words about what happened, even just "at work".** and **Write the thought in your own words. It only needs to be short.**. Both are kind, and both clear on typing.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-03: Skip what you can

**Priority:** P1 | **Device:** Any phone

**Preconditions:** New record.

**Steps:**

1. Fill steps 1 and 2 only. Tap **Next** through to the end.
2. Tap **Rate how it feels now**, then **Skip this**.
3. Save.
4. Open the record.

**Expected result:** Saved. Empty sections have no heading. No **Afterwards**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-04: Moving between steps

**Priority:** P1 | **Device:** Any phone

**Preconditions:** New record at step 3.

**Steps:**

1. Tap **Previous step**.
2. Use the system back gesture.
3. Reload at step 3 with both earlier steps filled, and confirm the browser's leave warning.

**Expected result:** Text persists when moving back. Reload loses the draft (in memory only). The browser warns first. If you reach the end with required parts empty, you are sent to the empty step.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-05: Leaving: discard or keep

**Priority:** P1 | **Device:** Any phone

**Preconditions:** New record with text.

**Steps:**

1. Tap the **Close** control.
2. Read **Discard this thought record?**. Tap **Keep writing**.
3. Tap **Close**, then **Discard draft**.

**Expected result:** Keep leaves your text. Discard exits to the list with no draft. **Close** on an untouched form leaves without asking.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-06: A draft waiting

**Priority:** P1 | **Device:** Any phone

**Preconditions:** New record with text.

**Steps:**

1. Tap **Get help**.
2. Go to Home. Read **Continue your thought record**.
3. Go to **Journal**. Read the main button.
4. Tap it.

**Expected result:** Home shows **Your draft is here until you sign out or close the app.**. The list button is **Continue your draft**. The text is intact.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-07: Edit

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A saved record.

**Steps:**

1. Tap **Edit**.
2. Change step 2. Tap **Next** to the end. Tap **Save changes**.
3. Edit again, change something, tap **Close**, read **Discard your changes?**, tap **Discard changes**.

**Expected result:** The change shows immediately and after reload. Discard leaves the saved version alone.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-08: Delete

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A saved record.

**Steps:**

1. Tap **Delete**. Read **Delete this thought record?**.
2. Tap **Keep record**.
3. Tap **Delete**, then **Delete record**.
4. Back to the old URL.

**Expected result:** Keep changes nothing. Delete returns to the list with it gone. The old URL shows **There's nothing at this address**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-09: Limits, long text and other scripts

**Priority:** P1 | **Device:** Any phone

**Preconditions:** New record.

**Steps:**

1. Paste 2,100 characters into a field.
2. Type Hindi, Tamil and emoji.
3. Add a long custom feeling, and add feelings until ten.
4. Save, reload and read.

**Expected result:** The field stops at 2000. All scripts round-trip exactly. No sideways scroll. An eleventh feeling is ignored without error.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-10: Session expires mid-journal

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Signed in. Record with text at step 5. Revoke this session from a second device, or delete its row on staging.

**Steps:**

1. Tap **Save thought record**.
2. Read the sign-in screen.
3. Sign in with the same email.
4. Return to the form.

**Expected result:** You land on **Sign in**, with **You were signed out. Sign in with the same email and what you were working on comes back.**. After sign-in, your text is back, and saving creates exactly one record.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-11: Session expires: someone else signs in

**Priority:** P0 | **Device:** Any phone

**Preconditions:** As MT-JRN-10, up to the sign-in screen. A second account.

**Steps:**

1. Sign in as the second account.
2. Open **Journal**, Home and `/journal/new`.

**Expected result:** No trace of the first person's text, anywhere. The held work is discarded for good.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-12: Session expires and the tab is reloaded

**Priority:** P1 | **Device:** Any phone

**Preconditions:** As MT-JRN-10, at the sign-in screen.

**Steps:**

1. Reload.
2. Sign in.

**Expected result:** Held work is gone, because it is in memory only. No browser storage holds it (check dev tools on a desktop).

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-13: **Show older entries**

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Staging account with more than one page of records.

**Steps:**

1. Scroll to the end, tap **Show older entries**.

**Expected result:** More load with no repeats. The button goes at the end.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-JRN-14: The cap

**Priority:** P3 | **Device:** Laptop terminal

**Preconditions:** Staging. Account seeded to 2,000 records by script.

**Steps:**

1. Try to save another.

**Expected result:** A readable message beginning **You've reached the limit of** appears, and the draft is kept.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Trends and Home (MT-TRD)

Signed in unless stated.

### MT-TRD-01: Empty, one, many

**Priority:** P1 | **Device:** Any phone

**Preconditions:** New account.

**Steps:**

1. Open **Trends**. Read it. Tap **Start the check-in** and finish.
2. Open **Trends**. Read it.
3. Add a second and third (`takenAt` can be seeded on staging).

**Expected result:** Empty message, then **One check-in so far. The line starts with your next one.**, then a dashed line with bands labelled in words. The summary sentence is neutral and does not judge going up or down.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TRD-02: Table alternative

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Two or more check-ins.

**Steps:**

1. Tap **Show these as a table**.
2. Read it. Tap **Hide the table**.

**Expected result:** Columns **Date**, **Score** and **Range**, newest first. No sideways page scroll at 320px.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TRD-03: Open and delete a row

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Two or more check-ins.

**Steps:**

1. Tap a row. Back.
2. Tap a delete icon. Read **Delete this check-in?**. Tap **Keep check-in**.
3. Tap again, then **Delete check-in**.

**Expected result:** The sheet names the date. The row and chart update without reload. The icon's accessible name includes the date.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TRD-04: **Show older check-ins**

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Staging account with more than a page.

**Steps:**

1. Tap **Show older check-ins**.

**Expected result:** More rows load, the chart includes them, and no repeats appear.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TRD-05: Home first run

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Guest.

**Steps:**

1. Read Home.
2. Tap **Overwhelmed? Breathe first**.
3. Back. Tap **Start the check-in**.

**Expected result:** Honest, calm. **Seven questions, about two minutes.** is accurate when timed. **For adults, 18 and over. A screening, not a diagnosis.** is shown.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TRD-06: Home with an account

**Priority:** P1 | **Device:** Any phone

**Preconditions:** At least one saved check-in.

**Steps:**

1. Check the date line and greeting at different hours, and with and without a name.
2. Read the mood card at the top, then **Your check-ins**: **Last check-in · <date>**, the band and score, and the **Next <date>** badge.
3. Tap **See result**. Back. Tap **Check in now**.
4. Tap each of **Breathe**, **Ground**, **Sounds**, **Write** under **For right now**.
5. Under **Your space**, tap **Safety plan**, **Mood log** and **Report for your doctor**.

**Expected result:** Only the mood card has the stitched border. Greeting matches the phone's time. **Next <date>** is 14 days on. Breathe stands out on the dark tile. Links go to the right places.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TRD-07: Home when a check-in is due

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Last check-in more than 14 days old (seed on staging).

**Steps:**

1. Read the top card.
2. Tap **Anxiety check (GAD-7)**. Back. Tap **Reflection**.

**Expected result:** **Time for a check-in** leads the page, under **It's been two weeks since <date>**, with both choices and **Last time: <band>, <score> out of 21. See result**. No nagging, no streak talk. Today's mood shows as one quiet line below it. GAD-7 opens the intro; Reflection opens its first question.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-TRD-08: No check-ins yet

**Priority:** P2 | **Device:** Any phone

**Preconditions:** New account.

**Steps:**

1. Read Home. Tap **Anxiety check (GAD-7)**.

**Expected result:** **Time for a check-in** under **Your first check-in**, with no "Last time" line, and the choice works.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Settings (MT-SET)

Guest and account states.

### MT-SET-01: Guest

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed out.

**Steps:**

1. Open **Settings**. Read **You're not signed in**. Tap **Sign in**.
2. Sign in, or go back. Try each theme under **Appearance**.
3. Tap each of **Privacy notice**, **Terms of use**, **About AnxioCare and the GAD-7**.

**Expected result:** Sign-in returns to Settings. Theme works for a guest. Legal pages open.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-02: Your name

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in.

**Steps:**

1. Tap the **Name** row. In **Your name**, type a name and tap **Save name**.
2. See **Name saved** and the row's new value. Check Home and the profile card. Reload.
3. Open it again, clear it, **Save name**.
4. Try 61 characters, Hindi and emoji.

**Expected result:** The sheet starts with the saved name each time. Home greets by name, and greets without one after clearing; the row then says **Not set**. The field stops at 60. Scripts round-trip.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-03: Email change, success

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in on two devices. Both inboxes open on a third.

**Steps:**

1. Tap the **Email** row.
2. Enter the new address, tap **Send codes**.
3. Find each code. Fill **Code sent to your current address** and **Code sent to your new address**.
4. Tap **Confirm new email**.
5. Check the second device.
6. Check the old inbox.
7. Sign out. Sign in with the new address. Then try with the old.

**Expected result:** **Email updated. Use it next time you sign in.**. The other device is signed out. The old inbox has **Your email address was changed**. All data is present under the new address. The old address now starts a new account, with no data.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-04: Email change: the borrowed phone

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Signed in. Attacker controls only the new inbox.

**Steps:**

1. Tap the **Email** row, enter an address you control, **Send codes**.
2. Fill the new address's code, and any six digits for the current one.
3. Tap **Confirm new email**.
4. Check the owner's inbox.

**Expected result:** **Those codes didn't work. Check both emails and enter the latest code from each.**. The address is unchanged, and the message does not say which code failed. The owner receives **Your verification code for your current address** and is warned.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-05: Email change: negative paths

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in.

**Steps:**

1. Enter `nonsense`. Tap **Send codes**.
2. Enter an address that already has an account. Complete with both correct codes.
3. Close the sheet with the **Close** control midway. Reopen.
4. Lose a code: wait for **Send new codes**, and tap it.
5. Enter your own current address as the new one.

**Expected result:** **That doesn't look like an email address.**. A taken address is only revealed after both correct codes, with a conflict message. Closing resets the sheet. **Send new codes** waits 45 seconds, then mails both inboxes and says **New codes sent. Use the latest one from each inbox.** (KI-10). Record what entering your own address does.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-06: Signed-in devices

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in on two devices.

**Steps:**

1. Read the **Signed-in devices** row (**This device and 1 other**). Tap it and read both devices in the sheet.
2. Tap the other row's **Sign out**. Read **Sign out this device?**. Tap **Keep signed in**.
3. Tap again, then **Sign out device**.
4. Use the other device.

**Expected result:** This device is marked **This device**, the other has **Last used <date>**. Labels are coarse, such as **Safari on iPhone**. The revoked device goes to sign-in on its next request.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-07: Sign out

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in, with a guest result and a draft.

**Steps:**

1. Tap **Sign out**.
2. Press the back button.
3. Open `/trends`.

**Expected result:** Home for a guest. The result and draft are gone. Back shows no data. Trends goes to sign-in.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-08: Sign out on all devices

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in on two devices.

**Steps:**

1. Tap **Sign out on all devices**. Read **Sign out on all devices?**. Tap **Stay signed in**.
2. Tap again, then **Sign out everywhere**.
3. Check the other device. Sign in again.

**Expected result:** Both end. Data stays.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-09: Data export: download

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in, with a name, three check-ins, two thought records, two devices. Read the copy under **Your data**.

**Steps:**

1. Tap **Download my data**.
2. See **Preparing**, then **Download started.**
3. Find the file.
4. Check the file name.
5. Open it in a JSON viewer.

**Expected result:** The file arrives on both platforms, including in the installed app: `a.click()` on a blob in iOS standalone mode is a known risk, so record it. Name is `account-data-YYYY-MM-DD.json`, with nothing naming the service.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-10: Data export: contents

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** The file from MT-SET-09, and the screens in the app.

**Steps:**

1. Check top-level keys: `exportedAt`, `account`, `consents`, `assessments`, `journal`, `sessions`.
2. Compare `account.email`, `displayName`, `createdAt`.
3. Compare each assessment's answers, score, severity, difficulty, `takenAt`.
4. Compare each journal entry, all fields, against the app.
5. Check `consents` has version, both flags, and acceptance time.
6. Check `sessions` has labels, created, last seen, expiry.
7. Search for wrapped keys, hashes, code data and other users' data.

**Expected result:** Everything held about you is there, decrypted, and correct. No key material, HMACs or anyone else's data. Valid JSON. Hindi text is intact. Compare with the promise: **A copy of everything we hold about you, as a JSON file.**. Note that audit rows are pseudonymous, and are not exported.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-11: Data export: limits

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in.

**Steps:**

1. Download 11 times inside an hour.
2. Read the message.
3. Try with no connection.

**Expected result:** After ten: **Too many tries for now. Wait a few minutes, then try again.**. Offline: the connection message. The button returns to **Download my data**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-12: Account deletion: full path

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** An account with data, signed in on two devices. Database access on staging.

**Steps:**

1. Tap **Delete my account**. Read every line of **Delete your account?**.
2. Tap **Keep my account**. Reopen.
3. Tap **Email me a code**.
4. Enter a wrong code. Read the error.
5. Enter the right code. Tap **Delete everything now**.
6. Read the Settings notice. Check the other device.
7. Run the SQL in MT-DEP-12.

**Expected result:** **Encrypted backups age out within <n> days.** matches the real backup plan. Keep changes nothing. A wrong code deletes nothing. Afterwards: **Your account and all your data have been deleted.**. The other device is signed out. Only pseudonymous audit rows remain. Mail subject is **Your confirmation code**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-13: Account deletion: then sign up again

**Priority:** P0 | **Device:** Any phone

**Preconditions:** Just deleted the account.

**Steps:**

1. Sign in with the same address.
2. Read the consent screen.
3. Check Home, **Trends**, **Journal**, **Settings**.
4. Check the export.

**Expected result:** A brand-new account: consent again, **No check-ins saved yet**, no name, no journal, one device. Nothing of the old account can be reached.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-14: Account deletion: negative

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in.

**Steps:**

1. Open the sheet. Close with **Close** or Esc, or by tapping the backdrop.
2. Reopen. Tap **Email me a code**, then close. Reopen.
3. Use a sign-in code in place of the delete code.
4. Ask for a code and wait 11 minutes.

**Expected result:** Closing leaves the account. Reopening restarts the sheet. Sign-in codes fail. An expired code fails, and **Send a new code**, after its 45-second wait, gets a fresh one (KI-10).

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-15: Theme

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Any state.

**Steps:**

1. Tap **Phone setting**, **Light**, **Dark**, in each phone theme.
2. Reload. Reopen after closing.
3. Run breathing in **Light**.

**Expected result:** Applies immediately. It persists across reloads, with no flash of the wrong theme. Breathing stays night-coloured regardless.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SET-16: Legal pages have real content

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Production config set.

**Steps:**

1. Open **Privacy notice** and read **Who we are** and **Who else is involved**.
2. Tap the grievance email link.
3. Open **Terms of use**, tap **Get help** in the text. Back.

**Expected result:** Real operator name, grievance address and locations, with no placeholders. The `mailto:` opens mail. **Read the terms** and **Read the privacy notice** cross-link. The date in **Version dated <date>** matches the consent version.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Shared phones (MT-SHR)

People in India often share a phone. A browser tab, a downloads folder and a mail preview can all reveal mental health use. Two testers, one phone.

### MT-SHR-01: Guest leaves, next person opens the browser

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Person A takes a guest check-in and leaves the tab open, without closing it.

**Steps:**

1. Person B opens the browser and the same tab.
2. Tap the wordmark to go Home.

**Expected result:** Person B sees A's result, and **Your check-in result is still here** on Home. This is what the design does, and what **It goes away when you close this tab.** warns about. Record it and judge whether the warning is prominent enough.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-02: Guest closes the tab

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Person A finishes and closes the tab.

**Steps:**

1. Person B reopens the browser. Check recent tabs and history.
2. Open the app.

**Expected result:** No answers or score in the app. History shows URLs like `/result` only, and nothing about scores. The tab switcher thumbnail may show content for a while: record it. Chrome "reopen closed tab" may restore `sessionStorage`: record whether it brings the result back.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-03: Signed-in person walks away

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A signed in, no sign-out.

**Steps:**

1. Person B opens the app and looks at **Trends** and **Journal**.

**Expected result:** B sees A's data: there is no app lock, because a session lasts 30 days idle. This is a real limit of a session cookie. Record it, and confirm that **Sign out** is easy to find, and the owner has accepted it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-04: Signed out, then the next person

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A signs out.

**Steps:**

1. B presses back repeatedly.
2. B opens **Trends** and **Journal**.
3. B signs in with their own email.
4. B checks all screens and the journal draft.

**Expected result:** No A data at any point: no cached pages, no drafts, no name, no email in the form. Check the browser's autofill: the email field may suggest A's address, which is browser behaviour but worth recording.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-05: Person B tries to take over the account

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A signed in, walks away. B controls another inbox.

**Steps:**

1. B tries the **Email** row, changing to their own address.
2. B tries **Delete my account**.
3. B opens **Download my data**.

**Expected result:** Email change and deletion need a code from A's inbox and fail. **Note:** the download needs no fresh code: a borrower holding the unlocked session can download everything. That is how the current design works: record it for the owner.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-06: Download left on the phone

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A downloaded their data.

**Steps:**

1. B opens Files or Downloads.
2. B opens the JSON.

**Expected result:** File name is neutral, but the contents are readable, as Settings warns: **It isn't encrypted once it's on your phone, so keep it somewhere safe.**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-07: Shared inbox

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A household mail account.

**Steps:**

1. Generate every mail type.
2. Read them as another household member.

**Expected result:** A reader learns there is an account somewhere, and nothing about health. No subject or body names the service. Note the body of the email-change notice says **reply to the operator through the contact details in the app**, without naming it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-08: Installed app icon

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Installed.

**Steps:**

1. Look at the home screen name.
2. Check recent apps list and lock-screen media.

**Expected result:** The icon reads **AnxioCare**, which itself hints at the subject. Record it for the owner: the name on the home screen is visible to anyone holding the phone.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-09: Notification tray

**Priority:** P2 | **Device:** Low-end Android, Chrome

**Preconditions:** After sign-in mail.

**Steps:**

1. Pull down the notification tray with the phone unlocked in front of someone.

**Expected result:** Same as MT-MAIL-03. The code is visible, health is not mentioned.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SHR-10: Family member in private mode

**Priority:** P1 | **Device:** Any phone

**Preconditions:** A second person using Incognito on the shared phone.

**Steps:**

1. Sign in, take a check-in.
2. Close Incognito. Check normal browsing.

**Expected result:** Nothing from the Incognito session appears in normal browsing, and the session ends with it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Assistive technology and display settings (MT-ACC)

Axe finds roughly a third of accessibility problems and has never heard this app speak. Findings go into `docs/ACCESSIBILITY.md`. If you can, have a daily screen reader user run these.

### MT-ACC-01: TalkBack: reach help

**Priority:** P0 | **Device:** Low-end Android, Chrome

**Preconditions:** TalkBack on. Eyes off the screen if you can.

**Steps:**

1. Open the app.
2. Find **Get help** by swiping.
3. Double-tap. Find and activate **Call 14416**. Cancel.
4. Repeat from a check-in question.

**Expected result:** Each screen is announced after navigation. **Get help** is found near the top. Call links read their number digit-friendly, and open the dialler.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-02: VoiceOver: reach help

**Priority:** P0 | **Device:** Recent iPhone, Safari

**Preconditions:** VoiceOver on.

**Steps:**

1. As MT-ACC-01, using VoiceOver.

**Expected result:** As MT-ACC-01. Note **Open:** is read before the helpline hours.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-03: TalkBack: full check-in

**Priority:** P0 | **Device:** Low-end Android, Chrome

**Preconditions:** TalkBack on.

**Steps:**

1. Do the whole check-in.
2. At each question, listen to what is read and in what order.
3. Choose an option and listen.
4. Listen to the result.

**Expected result:** The question is announced on arrival, then stem and options, and which is selected. After the auto-advance, focus lands on the next question, without a stray announcement. The result reads band, then score, then meaning. The scale makes sense when read aloud.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-04: VoiceOver: full check-in

**Priority:** P0 | **Device:** Recent iPhone, Safari

**Preconditions:** VoiceOver on.

**Steps:**

1. As MT-ACC-03.

**Expected result:** As MT-ACC-03. Note whether the 260ms advance cuts off speech, and whether that is a problem for this user.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-05: Screen reader: sign-in and code

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** TalkBack, then VoiceOver.

**Steps:**

1. Fill the email field. Listen to its label, note and error.
2. On the code screen, listen to the field.
3. Enter a wrong code. Listen.
4. Listen as **Send a new code in <n>s** counts.

**Expected result:** Label, hint and error are read. The drawn boxes are hidden, and the real input reads its digits. The error is announced via the alert, and focus returns. The countdown does not spam announcements.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-06: Screen reader: consent

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Screen reader on.

**Steps:**

1. Read the consent page, then tick both boxes.
2. Trigger the missing-tick error.

**Expected result:** Headings navigate. Each checkbox reads its whole sentence. The error is announced.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-07: Screen reader: breathing

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Screen reader on.

**Steps:**

1. Select rhythm and length.
2. Tap **Begin**.
3. Follow without looking, for 2 minutes.
4. Find **Stop**.

**Expected result:** Phases are announced via the live region: **Settle in**, **Breathe in**, **Breathe out**. Record whether speech keeps up with short phases, and whether it helps or gets in the way. **Stop** is easy to find.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-08: Screen reader: sounds and sliders

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Screen reader on.

**Steps:**

1. Toggle a sound. Listen to the state.
2. Change **Volume**.
3. In a thought record, change **How strong was it?**.

**Expected result:** Toggle state is read. Sliders can be changed by the screen reader's gestures, and read **<n> percent** and **<n> out of 10**.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-09: Screen reader: sheets

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Screen reader on.

**Steps:**

1. Open any sheet such as **Delete this result?**.
2. Try to move outside it.
3. Close it.

**Expected result:** Announced as a dialog with its title. Focus stays inside, and returns to the opener on close.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-10: Screen reader: trends

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Two or more check-ins.

**Steps:**

1. Read the chart.
2. Open and read the table.
3. Find a row's delete control.

**Expected result:** Chart reads as one image with the summary. Table headers are read with cells. **Delete check-in from <date>** is read for the icon.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-11: Screen reader: journal form

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Screen reader on.

**Steps:**

1. Go through all five steps.
2. Trigger an error on step 1.
3. Use the chips and **Add feeling**.

**Expected result:** Each step is announced as a heading. The labelled field reads hint and error. Chip state is read.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-12: Large font on Android

**Priority:** P0 | **Device:** Low-end Android, Chrome

**Preconditions:** Android font size and display size at largest. Chrome text scaling at 200%.

**Steps:**

1. Walk Home, a question, a result, Help, the code screen, a sheet.

**Expected result:** Everything readable. No clipped text, no sideways scroll, and no button text cut off. **Call 14416** stays reachable. The boxes on the code screen may be tight: record it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-13: Large font on iPhone

**Priority:** P0 | **Device:** Recent iPhone, Safari

**Preconditions:** iOS Larger Text at maximum, and Safari text size at 200%.

**Steps:**

1. As MT-ACC-12.

**Expected result:** As MT-ACC-12. Note iOS Larger Text does not reach ordinary web text, so Safari's control is the real test. Pinch zoom also works, because the viewport does not forbid it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-14: Dark mode with real eyes

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Phone in dark mode, at low brightness, indoors and outdoors.

**Steps:**

1. Walk every tab, a result, a sheet, and the code screen.

**Expected result:** Legible. No white flash. Status bar colour matches. Focus and selection are visible. Note the option borders, which have low contrast by calculation.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-15: Light mode in sunlight

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Outdoors, full daylight.

**Steps:**

1. Read a question and result.
2. Find **Get help**.

**Expected result:** Readable. Record anything that washes out.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-16: Reduced motion

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Android: remove animations. iOS: Reduce Motion.

**Steps:**

1. Run breathing.
2. Open a sheet.
3. Navigate between screens.

**Expected result:** No scaling or spinning. Breathing still guides by words and counts. Sheets appear with no slide. Nothing is lost.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-17: Colour-blind review

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Android colour correction, iOS colour filters, or Chrome DevTools vision emulation for protanopia, deuteranopia, tritanopia, achromatopsia. A colour-blind tester if you can.

**Steps:**

1. Check the result scale, selected options, chart bands, errors and the current tab.

**Expected result:** Every state is distinguishable. Selected options have a tick as well as fill. Errors have words. The active tab has weight and a background, not just colour.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-18: External keyboard

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari; Desktop browser

**Preconditions:** Bluetooth keyboard, or desktop.

**Steps:**

1. Tab from the page start. Check **Skip to content** appears.
2. Activate it.
3. Do the whole check-in by keyboard.
4. Use **Appearance** options by Tab and by arrow keys.
5. Open and close a sheet with Esc.
6. Use the **Volume** slider with arrows.

**Expected result:** Focus is always visible, and never hidden behind the sticky header or tab bar. Everything is operable. Check-in answers move with arrow keys and Space selects. Theme options are one Tab stop, and arrow keys choose (KI-11). `live/keyboard.spec.ts` covers this in emulation: a person still has to confirm that it's usable.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-19: Zoom and reflow

**Priority:** P2 | **Device:** Desktop browser

**Preconditions:** Desktop at 1280 wide.

**Steps:**

1. Zoom to 400%.
2. Walk the main screens.

**Expected result:** One-column layout, no loss of content, and no two-way scroll except the data table.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-20: Text spacing

**Priority:** P2 | **Device:** Desktop browser

**Preconditions:** Desktop, with a text-spacing bookmarklet (line height 1.5, paragraph 2, letter 0.12, word 0.16).

**Steps:**

1. Walk Home, Result, Consent, Settings.

**Expected result:** No clipped or overlapping text.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-21: High contrast

**Priority:** P2 | **Device:** Low-end Android, Chrome; Desktop browser

**Preconditions:** Android high-contrast text, and Windows forced colours mode.

**Steps:**

1. Walk a question, the code screen, a result and a sheet.

**Expected result:** Options, selection, code boxes and focus remain visible.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-22: Switch or voice control

**Priority:** P2 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Android Switch Access or Voice Access; iOS Voice Control.

**Steps:**

1. Say or select **Get help**.
2. Answer a question by name.

**Expected result:** Visible labels work as voice names. Record any icon button that is hard to reach.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-ACC-23: Cognitive load in distress

**Priority:** P2 | **Device:** Any phone

**Preconditions:** A person not on the team, with a time limit.

**Steps:**

1. Ask them to find a number to call, starting from any screen.
2. Time it. Ask what was confusing.

**Expected result:** Reached in under 10 seconds from any screen, with no explanation given.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Routes, navigation and error screens (MT-NAV)

A route map is at the end of this section.

### MT-NAV-01: Bottom tabs

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Guest and signed in.

**Steps:**

1. Tap **Home**, **Tools**, **Journal**, **Trends**, **Settings**.
2. Use back and forward.

**Expected result:** Correct screen and active tab each time. The tab bar is hidden on focus screens: check-in, breathing, grounding, sign-in, consent, and journal form. Scroll position resets going forward, and is restored going back.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-02: Wordmark and **Get help** on every route

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Walk the route map.

**Steps:**

1. On each route, find the wordmark and **Get help**.
2. Tap each once.

**Expected result:** Both are present on all routes, in the same place. The wordmark goes Home.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-03: 404

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Any state.

**Steps:**

1. Open `/no-such-page`.
2. Tap **Go home**. Back. Tap **Go to Help**.

**Expected result:** **There's nothing at this address**. No server error text. The address in the title stays sensible.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-04: Another person's link, and a malformed link

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed in as B. A result and record URL belonging to A.

**Steps:**

1. Open A's `/result/<id>` and `/journal/<id>`.
2. Open `/result/nonsense`.

**Expected result:** Each shows **There's nothing at this address**. No clue that the item exists.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-05: Deep links while signed out

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Signed out.

**Steps:**

1. Open `/journal/new`.
2. Sign in.

**Expected result:** Asked to sign in, and returned to `/journal/new` after.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-06: A bad `next` link

**Priority:** P2 | **Device:** Any phone

**Preconditions:** Signed out.

**Steps:**

1. Open `/sign-in?next=https://example.com`.
2. Open `/sign-in?next=//example.com`.
3. Sign in.

**Expected result:** You stay inside the app. Never redirected off site.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-07: Server down

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** Staging. Stop the service or the database.

**Steps:**

1. Reload a cached app.
2. Open **Journal** while signed in.
3. Open **Get help**.
4. Restart. Tap **Try again**.

**Expected result:** **This didn't load**, or the offline state, with **Try again** and **Go to Help**. Help works. Recovery works without reload.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-08: A corrupt record

**Priority:** P2 | **Device:** Laptop terminal

**Preconditions:** Staging. Damage one `payload_ct` row with SQL.

**Steps:**

1. Open **Journal**.
2. Open the record.

**Expected result:** An error state, not raw text, with a way out. Other screens work. Log has `decrypt_failed` and no content.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-NAV-09: Last-resort error

**Priority:** P2 | **Device:** Desktop browser

**Preconditions:** Staging or a dev build, with a deliberate throw in the shell.

**Steps:**

1. Trigger it.
2. Tap **Go to Help**. Back. Tap **Reload**.

**Expected result:** **Something went wrong**, **Reloading usually sorts it out. Help is one tap away if you need it.**, and both controls work. There is no automated test of `RootError`.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### Route map

Every route in `apps/web/src/router.tsx`, and the cases that exercise it.

| Route | Needs account | Cases |
| --- | --- | --- |
| `/` | No | MT-TRD-05 to 08, MT-DEV-01 |
| `/help` | No | MT-HELP-01 to 17, MT-OFF-01, MT-ACC-01 |
| `/check-in` | No | MT-CHK-01, 04, 05 |
| `/check-in/:step` | No | MT-CHK-01 to 03, 06 to 10, MT-ACC-03 |
| `/result` | No | MT-RES-01 to 10, 12, MT-PRN-01 to 06 |
| `/result/:id` | Yes | MT-RES-11, 13, MT-NAV-04 |
| `/tools` | No | MT-TOL-17 |
| `/tools/breathe` | No | MT-TOL-01 to 07, MT-ACC-07 |
| `/tools/ground` | No | MT-TOL-15, 16 |
| `/tools/sounds` | No | MT-TOL-08 to 14, MT-ACC-08 |
| `/settings` | No, more when signed in | MT-SET-01 to 16, MT-PWA-01, 02 |
| `/sign-in` | No | MT-AUTH-01 to 03, 07, 08, 13 to 15, MT-NAV-06 |
| `/create-account`, `/create-account/code` | No | MT-AUTH-11, 12, 20 |
| `/forgot-password`, `/forgot-password/reset` | No | MT-AUTH-16 |
| `/sign-in/code` | No | MT-MAIL-05 to 12, MT-AUTH-04 to 06 |
| `/consent` | Signed in | MT-CON-01 to 08 |
| `/privacy`, `/terms`, `/about` | No | MT-SET-16, MT-CLN-09, MT-HELP-09 |
| `/trends` | Yes | MT-TRD-01 to 04, MT-ACC-10 |
| `/journal` | Yes | MT-JRN-01, 06, 13 |
| `/journal/new` | Yes | MT-JRN-01 to 06, 09 to 12, MT-NAV-05 |
| `/journal/:id` | Yes | MT-JRN-07, 08, MT-NAV-04 |
| `/journal/:id/edit` | Yes | MT-JRN-07 |
| `*` | No | MT-NAV-03 |

## Clinical and copy review (MT-CLN)

For a qualified clinician (psychiatrist, clinical psychologist) and, where noted, a lawyer. These are sign-off items. No code test can do them. Device: any, or a printed copy.

### MT-CLN-01: GAD-7 wording and cut points

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** Published GAD-7 at hand. `packages/shared/src/gad7.ts`.

**Steps:**

1. Compare the stem, items, options, difficulty stem and options, word for word.
2. Compare cut points: 0-4, 5-9, 10-14, 15-21.
3. Compare the attribution.

**Expected result:** Identical to the published instrument. Clinician signs.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-02: Band meanings

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** The four band meanings in `gad7.ts`, and the result screens.

**Steps:**

1. Read them as someone receiving this alone at night.

**Expected result:** Accurate, non-diagnostic, not frightening, not falsely reassuring. Clinician notes any change.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-03: Severe screen and self-harm wording

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** Screens from MT-RES-04 and Help.

**Steps:**

1. Read **You don't have to manage this alone**.
2. Read **These questions don't ask about that, so your score can't tell us. Please take those thoughts seriously.**
3. Read the guidance on staying with someone, and on means.

**Expected result:** In line with safe-messaging practice, calm, and actionable. Clinician signs off exact words, or supplies replacements.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-04: Screening, never diagnosis

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** A full text walk through the app.

**Steps:**

1. Search all copy for diagnosis, disorder, you have, condition.

**Expected result:** The app says screening throughout, and uses **diagnose** only to say that it does not. No AI advice, no invented statistics. No gamification.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-05: Next steps and referral

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** Result screens for each band.

**Steps:**

1. Read **What you could do next** at each band.
2. Check **Check in again around <date>** reasoning.

**Expected result:** Clinically sensible. 10 and over recommends a professional. Helpline routing is right for someone in India without a doctor.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-06: Breathing and grounding safety

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** Breathing screens. Terms **Breathing and grounding**.

**Steps:**

1. Review the three rhythms.
2. Review the dizziness warnings.
3. Review the grounding hints.

**Expected result:** Suitable for adults with anxiety. Warnings are adequate, including for panic, asthma, and pregnancy, if the clinician thinks so. 4-7-8 is suitable for a first-time anxious user, or a note is added.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-07: Thought record

**Priority:** P1 | **Device:** Desktop browser

**Preconditions:** Journal form copy.

**Steps:**

1. Review prompts as CBT practice.
2. Consider someone who writes about self-harm there.

**Expected result:** The prompts are fair. **Consider:** nobody monitors entries, and the form shows no special help when someone writes about self-harm, though **Get help** is always on screen. Clinician says if that is enough, given that Terms state nobody monitors.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-08: Language and audience

**Priority:** P1 | **Device:** Any phone

**Preconditions:** People who use English as a second language, in India.

**Steps:**

1. Ask them to read a result and the consent page.
2. Ask what it means.

**Expected result:** Understood. The app is English only. GAD-7 validated translations are not in this build. Record whether this leaves people out, and whether that blocks launch.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-09: Legal review

**Priority:** P0 | **Device:** Desktop browser

**Preconditions:** A lawyer familiar with DPDP Act 2023 and the Rules 2025. `Legal.tsx`.

**Steps:**

1. Review **Privacy notice** and **Terms of use**.
2. Review the consent wording, 18+ basis, and the grievance promise **We aim to respond within 7 days.**
3. Review the statement about backups.

**Expected result:** Signed off, or changes listed. The spec requires legal review, and this has not happened.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-CLN-10: Tone

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Someone who has lived with anxiety, if possible.

**Steps:**

1. Walk the app.
2. Ask what felt cold, childish, or alarming.

**Expected result:** Warm and human, and the opposite of neon-on-slate. Record quotes.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Post-deployment smoke: Supabase and Render (MT-DEP)

The code has never run on Supabase or Render. Run once on staging and again on production. Set `export ORIGIN=https://<service>.onrender.com` first. Save output. Commands are read-only unless stated.

### MT-DEP-01: Service up

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Deployed.

**Steps:**

1. `curl -si "$ORIGIN/healthz"`
2. `curl -si "$ORIGIN/readyz"`
3. `curl -s "$ORIGIN/api/v1/meta"`

**Expected result:** `{"status":"ok"}` from both with status 200. Meta shows the real operator, grievance address, backup days, `Mumbai, India`, `Singapore`, and mail provider, with no secret.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-02: Migrations and pre-deploy

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Render dashboard.

**Steps:**

1. Read the pre-deploy log.
2. In the SQL editor: `SELECT * FROM app.schema_migrations;`
3. Redeploy. Read the log again.

**Expected result:** `001_init.sql` applied once, and the second run is a no-op.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-03: Least-privilege role at boot

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Render logs. SQL editor.

**Steps:**

1. Search the logs for `fatal`.
2. `SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'anxiocare_runtime';`
3. Check the `DATABASE_URL` user in Render.

**Expected result:** The server booted, so `assertRuntimeRole` passed. All four flags false. The URL uses `anxiocare_runtime.<project-ref>` on the session pooler (port 5432).

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-04: Supabase REST cannot reach the tables

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Project ref and anon key.

**Steps:**

1. `curl -s "https://<ref>.supabase.co/rest/v1/users?select=*" -H "apikey: <anon>" -H "Authorization: Bearer <anon>"`
2. `curl -s "https://<ref>.supabase.co/rest/v1/" -H "apikey: <anon>"`
3. In SQL: `SELECT tablename FROM pg_tables WHERE schemaname = 'public';`

**Expected result:** No user data and no `app` tables. Not-found or schema error. `public` holds none of our tables.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-05: RLS and policies live

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** SQL editor.

**Steps:**

1. `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'app';`
2. `SELECT tablename, roles FROM pg_policies WHERE schemaname = 'app';`

**Expected result:** RLS true on all. Policies only for `anxiocare_runtime`, and none on `schema_migrations`. Note the spec said no policies, and the code needs them for a role with no BYPASSRLS. See KI-12.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-06: Database TLS and region

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Supabase dashboard.

**Steps:**

1. Check the region is Mumbai (`ap-south-1`).
2. Check `DATABASE_CA_CERT` is Supabase's CA, and the app connects.
3. Temporarily set a wrong CA on staging. Deploy.

**Expected result:** Mumbai. With a wrong CA, the app refuses to start: the health check fails and the deploy is not promoted. Restore it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-07: Client IP self-check: log line

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Render logs after real browser traffic.

**Steps:**

1. Search logs for `client ip resolved`.

**Expected result:** `client ip resolved: public IPv4 via header` or `public IPv6 via header`. **`private/proxy` or `via hops` on real traffic means everyone may share one rate-limit bucket: do not launch.** No address appears in any log line.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-08: Client IP self-check: buckets

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Laptop, plus a phone hotspot as a second network. From `apps/api/README.md`.

**Steps:**

1. `URL=$ORIGIN/api/v1/meta; r() { curl -s -o /dev/null -D - "$@" "$URL" | grep -i "^x-ratelimit-remaining"; }`
2. `r; r`
3. `r -H "X-Forwarded-For: 203.0.113.9"`
4. `r -H "CF-Connecting-IP: 203.0.113.9"`
5. Run `r` from the second network.

**Expected result:** Falls by one each time. Forged headers get no new bucket, or Cloudflare refuses them. A jump back up means forgery works: fix before launch. The second network starts near 600.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-09: Real journey on production

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Production. A throwaway address.

**Steps:**

1. Sign up, consent, check-in, journal, export, delete, as one person, on a real phone.
2. Read the logs for that time.

**Expected result:** All works. Logs show method, route template, status, duration and request id only. There is no email, no IP, no query string.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-10: Encryption at rest on the real database

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** SQL editor, after MT-DEP-09 with data present.

**Steps:**

1. `SELECT email_ct, display_name_ct, email_hash FROM app.users LIMIT 3;`
2. `SELECT payload_ct FROM app.journal_entries LIMIT 3;`
3. `SELECT octet_length(payload_ct) FROM app.assessments LIMIT 5;`

**Expected result:** Binary only, nothing readable. Assessment lengths are identical. Journal lengths fall in 4 KB steps.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-11: Purge runs

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** Render logs, at least 60 seconds after boot. An unconsented account more than 24 hours old.

**Steps:**

1. Search logs for `purge_completed`.
2. `SELECT count(*) FROM app.users WHERE consent_version IS NULL AND created_at <= now() - interval '24 hours';`

**Expected result:** One line after a minute, then hourly. Count is 0 after a purge. Note timers die with the process: confirm it runs on the chosen plan, which must not sleep.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-12: Deletion on the real database

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Before deleting, note the blind index and audit pseudonym are not readable: note the user id from the export instead.

**Steps:**

1. After MT-SET-12: `SELECT count(*) FROM app.users WHERE id = '<id>';`
2. Same for `assessments`, `journal_entries`, `sessions`, `consents`, by `user_id`.
3. `SELECT action, created_at FROM app.audit_log WHERE action = 'account_delete' ORDER BY created_at DESC LIMIT 1;`

**Expected result:** All zero. Audit row exists, with a time at midnight UTC only.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-13: Migration credential is not in the server

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Render shell.

**Steps:**

1. `tr "\0" "\n" < /proc/$(pgrep -f dist/server.js | head -1)/environ | grep -c DATABASE_MIGRATION_URL`
2. Run this on staging only, then close the shell.

**Expected result:** `0`. Not verified on Render so far, per `docs/SECURITY-EXCEPTIONS.md`.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-14: Backups match the promise

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** Supabase plan page.

**Steps:**

1. Read the backup retention.
2. Compare with `BACKUP_RETENTION_DAYS` and the app's **within <n> days**.

**Expected result:** They match. The app states this to people.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-15: Restore drill

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** Staging restore from a Supabase backup, with the same keys.

**Steps:**

1. Restore. Boot the app against it.
2. Sign in as a test user and read data.
3. Try with a wrong `ENCRYPTION_KEYS`.

**Expected result:** Data decrypts with the right keys. Wrong keys fail with no leak. The spec says losing keys loses all data, so confirm a separate key copy exists.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-16: Key rotation drill

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** Staging. See `apps/api/README.md`.

**Steps:**

1. Add a key, activate, deploy.
2. `npm run rotate-keys -w @anxiocare/api`
3. Remove the old key, deploy.
4. Sign in and read data.

**Expected result:** Everything readable. The script has only been exercised through its library function in tests.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-17: CI runs

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** GitHub. A PR with a deliberately failing test on a branch.

**Steps:**

1. Check `verify` and `e2e` and `CodeQL` run.
2. Check the failing test blocks merge.
3. Check Render waits (`autoDeployTrigger: checksPass`).
4. Check Dependabot opened something, and secret scanning and push protection are on.

**Expected result:** All observed. GitHub Actions has not run once so far. Note Linux runners will use a different WebKit build than the Mac used for the current results.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-18: Cold start and instance sleep

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Service idle for 30 minutes, on the chosen plan.

**Steps:**

1. Open the app on a real phone. Time it.
2. Request a code. Time the mail.

**Expected result:** Acceptable. The `starter` plan in `render.yaml` should not sleep: confirm it.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-19: Compression on the edge

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** Production.

**Steps:**

1. `curl -sI -H "Accept-Encoding: gzip, br" "$ORIGIN/assets/$(curl -s "$ORIGIN/" | grep -oE "index-[^\"]+\.js" | head -1)" | grep -iE "content-encoding|content-length|vary"`
2. `curl -s -D - -o /dev/null -H "Accept-Encoding: gzip, br" "$ORIGIN/api/v1/meta" | grep -iE "content-encoding|cache-control"`

**Expected result:** The script has a `content-encoding` of `gzip` or `br`, and `vary` names `accept-encoding`. The server sends precompressed files itself (KI-13). The API answer has `cache-control: no-store, no-transform`, and **no** `content-encoding`. If it has one, Render's edge is compressing API responses despite `no-transform`: record it, and tell whoever owns `docs/SECURITY-EXCEPTIONS.md`.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-DEP-20: Boot refusal on bad config

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** Staging, one change at a time.

**Steps:**

1. Set `MAIL_TRANSPORT=file:/tmp/x`, deploy.
2. Remove `DATABASE_CA_CERT`, deploy.
3. Set `MAIL_FROM` with a revealing word, deploy.

**Expected result:** Each refuses to start, and the log names the variable and never the value. Restore each.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Security smoke on production (MT-SEC)

From a laptop. `export ORIGIN=https://<service>.onrender.com`. These repeat on the real edge what automated tests check on localhost. A proxy can add, drop or change any of these headers. Use your own test account and address, and keep to these requests.

### MT-SEC-01: HTML headers

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `curl -sI -H "Accept: text/html" "$ORIGIN/" | tr -d "\r"`

**Expected result:** `content-security-policy: default-src 'none';script-src 'self';style-src 'self';img-src 'self';font-src 'self';connect-src 'self';manifest-src 'self';worker-src 'self';frame-ancestors 'none';base-uri 'none';form-action 'self'` (nothing added by the edge). `strict-transport-security: max-age=31536000; includeSubDomains`. `referrer-policy: no-referrer`. `x-content-type-options: nosniff`. `cross-origin-opener-policy: same-origin`. `cross-origin-resource-policy: same-origin`. `x-frame-options: DENY`. `permissions-policy` includes `camera=()`. `cache-control: no-cache`. No `access-control-allow-origin`. No `x-powered-by`. Header casing and CSP spacing may differ; the directives may not.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-02: Caching by kind

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `A=$(curl -s "$ORIGIN/" | grep -oE "/assets/index-[^\"]+\.js" | head -1)`
2. `curl -sI "$ORIGIN$A" | grep -i cache-control`
3. `curl -sI "$ORIGIN/sw.js" | grep -i cache-control`
4. `curl -sI "$ORIGIN/manifest.webmanifest" | grep -i cache-control`
5. `curl -sI "$ORIGIN/api/v1/meta" | grep -i cache-control`
6. Check the same responses for `cf-cache-status`.

**Expected result:** `public, max-age=31536000, immutable`, then `no-cache`, `no-cache`, `no-store, no-transform`. The edge has not cached `/api` or HTML.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-03: CSRF

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `curl -si -X POST "$ORIGIN/api/v1/auth/logout" -H "content-type: application/json" -d "{}"`
2. `curl -si -X POST "$ORIGIN/api/v1/auth/logout" -H "Origin: https://evil.example" -H "x-anxiocare-csrf: 1" -H "content-type: application/json" -d "{}"`
3. `curl -si -X POST "$ORIGIN/api/v1/auth/logout" -H "Origin: $ORIGIN" -H "content-type: application/json" -d "{}"`
4. `curl -si -X POST "$ORIGIN/api/v1/auth/logout" -H "Origin: $ORIGIN" -H "x-anxiocare-csrf: 1" -H "content-type: application/json" -d "{}"`

**Expected result:** First three: 403 `application/problem+json`, `csrf_failed`. Fourth: 204.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-04: No CORS

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `curl -si -X OPTIONS "$ORIGIN/api/v1/me" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET"`

**Expected result:** No `access-control-allow-*` header in the response.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-05: Session cookie on the real origin

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Chrome remote debugging or desktop browser. Sign in.

**Steps:**

1. In DevTools, read the verify response's `Set-Cookie`.
2. Read Application, Cookies.
3. In the console: `document.cookie`, and `Object.keys(localStorage)`, and `Object.keys(sessionStorage)`.

**Expected result:** `__Host-session`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`. `document.cookie` is empty. localStorage holds at most `anxiocare-theme`. sessionStorage holds only `anxiocare.checkin.v1` and `anxiocare.result.v1`, for a guest flow.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-06: Unauthenticated access

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `for p in me assessments journal auth/sessions me/export; do curl -s -o /dev/null -w "$p %{http_code}\n" "$ORIGIN/api/v1/$p"; done`

**Expected result:** All 401, with a problem document.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-07: HTTP goes to HTTPS, and TLS

**Priority:** P0 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `curl -sI "http://${ORIGIN#https://}/"`
2. `echo | openssl s_client -connect ${ORIGIN#https://}:443 -servername ${ORIGIN#https://} 2>/dev/null | grep -E "Protocol|Verify return"`
3. `curl -s --tls-max 1.1 "$ORIGIN/healthz"; echo "exit $?"`

**Expected result:** A redirect to HTTPS. TLS 1.2 or 1.3, and a verified chain. TLS 1.1 is refused.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-08: Validation and errors reveal nothing

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `head -c 70000 /dev/zero | tr "\0" a > /tmp/big; curl -si -X POST "$ORIGIN/api/v1/auth/otp/request" -H "Origin: $ORIGIN" -H "x-anxiocare-csrf: 1" -H "content-type: application/json" --data-binary @/tmp/big | head -1`
2. `curl -si -X POST "$ORIGIN/api/v1/auth/otp/request" -H "Origin: $ORIGIN" -H "x-anxiocare-csrf: 1" -H "content-type: application/json" -d "{\"email\":\"a@example.com\",\"x\":1}"`
3. `curl -si "$ORIGIN/api/v1/nope"`
4. `curl -si "$ORIGIN/assets/nope.js"`

**Expected result:** 413, then 400 `validation_failed`, then 404 problem documents. No stack, path, SQL or framework detail.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-09: Enumeration

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** One address with an account, one without. Both yours.

**Steps:**

1. `for e in known@yours.example new@yours.example; do curl -s -o /dev/null -w "$e %{http_code} %{time_total}\n" -X POST "$ORIGIN/api/v1/auth/otp/request" -H "Origin: $ORIGIN" -H "x-anxiocare-csrf: 1" -H "content-type: application/json" -d "{\"email\":\"$e\"}"; done`
2. Repeat three times, respecting the 5-an-hour limit.

**Expected result:** Both are 202, empty body, same headers, and no consistent timing difference beyond network noise.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-10: Nothing external, no leaks in the bundle

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** None.

**Steps:**

1. `curl -s "$ORIGIN/" | grep -Eo "https?://[^\"<> ]+"`
2. `curl -sI "$ORIGIN$A.map" | head -1`
3. `curl -s "$ORIGIN$A" | grep -Eic "supabase\.co|postgres://|smtp\.|ENCRYPTION_KEYS"`
4. On a real phone with Chrome remote debugging, watch the Network tab across a whole journey.

**Expected result:** No external URLs in the page. Source maps 404. Grep count is 0. All requests stay on the origin, apart from a tapped `wa.me` or helpline site.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-11: Route limit, forged address

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** A disposable address you own. Sends up to five real mails.

**Steps:**

1. `for i in $(seq 1 21); do curl -s -o /dev/null -w "%{http_code} " -X POST "$ORIGIN/api/v1/auth/otp/request" -H "Origin: $ORIGIN" -H "x-anxiocare-csrf: 1" -H "X-Forwarded-For: 198.51.100.$i" -H "CF-Connecting-IP: 198.51.100.$i" -H "content-type: application/json" -d "{\"email\":\"you+smoke@yours.example\"}"; done`
2. Count mails received.

**Expected result:** The 21st is 429, despite rotating the forged headers. At most five mails arrive. Wait 10 minutes before other sign-in tests from this network.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-12: Cross-user on production

**Priority:** P1 | **Device:** Any phone

**Preconditions:** Two test accounts.

**Steps:**

1. As A, note a result id and record id.
2. As B, open them in the app.
3. As B, use `fetch` in DevTools to `DELETE` A's record with the CSRF header.

**Expected result:** 404 each time, and A's data is unchanged.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-13: CSP in a real browser

**Priority:** P2 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Chrome remote debugging or Safari Web Inspector.

**Steps:**

1. Walk all tabs and the breathing, sounds and print flows with the console open.

**Expected result:** No CSP violations, on real Chrome and real Safari.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SEC-14: Dependencies and scanners

**Priority:** P1 | **Device:** Laptop terminal

**Preconditions:** Repository.

**Steps:**

1. `npm audit --omit=dev`
2. `npm audit --audit-level=high`
3. Read the latest CodeQL run.

**Expected result:** First is clean. Second passes: the six low and moderate build-tool items are documented in `docs/SECURITY-EXCEPTIONS.md`. CodeQL has no open high items.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Quick exit on real phones (MT-QX)

Automation proves the history entry is replaced, memory is cleared and Escape works, in emulated browsers with a local stub for the weather page. It can't show what a real phone's back button, tab switcher, recent-apps screen or installed app do.

### MT-QX-01: Tap Quick exit on Android Chrome

**Priority:** P0 | **Device:** Low-end Android, Chrome

**Preconditions:** Two tabs of history: open **About**, then **Tools**.

**Steps:**

1. Tap **Quick exit** in the header.
2. Time how long the app stays visible.
3. Press the phone's Back button once.

**Expected result:** The weather search replaces the app at once, with no question asked. Back lands on **About**, not **Tools**. Nothing of Tools flashes on screen.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-02: Tap Quick exit on iPhone Safari

**Priority:** P0 | **Device:** Recent iPhone, Safari

**Preconditions:** As MT-QX-01.

**Steps:**

1. Tap **Quick exit**.
2. Swipe back from the left edge.
3. Open the tab switcher.

**Expected result:** The weather search appears at once. Back lands on **About**. Note whether the tab switcher thumbnail still shows the app: that is outside the app's control, and should be recorded.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-03: Quick exit in the installed app

**Priority:** P0 | **Device:** Low-end Android, installed; Recent iPhone, home-screen app

**Preconditions:** App installed to the home screen and opened from its icon.

**Steps:**

1. Open **Tools**, then tap **Quick exit**.
2. Note where the weather page opens: inside the app window, or in the browser.
3. Open the recent-apps screen.

**Expected result:** The app content is gone at once. Record where the weather page opened and what the recent-apps screen shows. If the app's own window still shows AnxioCare in recent apps, raise it with the owner.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-04: Quick exit mid check-in

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** None.

**Steps:**

1. Start the check-in and answer two questions.
2. Tap **Quick exit**.
3. Go Back until you reach the app.

**Expected result:** The app opens without the answers: the check-in starts again. **Get help** and **Quick exit** were both visible on the question screen.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-05: Quick exit with a sheet open, and with an unsaved draft

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in.

**Steps:**

1. Settings, tap **Delete my account**, so the sheet is open. Tap **Quick exit** inside the sheet.
2. Open the app again. Journal, write a few words in a new thought record, and tap **Quick exit**.

**Expected result:** Both leave at once. No "Leave site?" or other dialog appears.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-06: Quick exit with no connection

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** One earlier visit. Airplane mode on.

**Steps:**

1. Open **Help**.
2. Tap **Quick exit**.

**Expected result:** The app is gone from the screen at once, even though the weather page can't load. The browser's own offline page is fine.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-07: Escape three times on a keyboard

**Priority:** P1 | **Device:** Tablet or phone with a Bluetooth keyboard; laptop browser

**Preconditions:** None.

**Steps:**

1. On **Sign in**, type in the email field and press Escape three times quickly.
2. Tap the page heading, then press Escape three times quickly.
3. Press Escape three times slowly, a second apart.

**Expected result:** Typing in the field never exits. Three quick presses outside a field exit at once. Slow presses don't.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-08: Quick exit with a screen reader

**Priority:** P1 | **Device:** Android TalkBack; iPhone VoiceOver

**Preconditions:** Screen reader on.

**Steps:**

1. Swipe through the header.
2. Activate **Quick exit**.

**Expected result:** It is announced as "Quick exit, button", before **Get help**. Activating it leaves at once.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-09: Quick exit leaves the account signed in, as Help says

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in.

**Steps:**

1. Tap **Quick exit**.
2. Open the app again from history or the icon.
3. Read **About quick exit** on **Help**.

**Expected result:** The account is still signed in, which is what Help says. The wording is plain about what quick exit can't do.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-QX-10: Quick exit at 320px and in landscape

**Priority:** P2 | **Device:** Small phone, or a 320px-wide browser

**Preconditions:** None.

**Steps:**

1. Look at the header in portrait at 320px.
2. Rotate to landscape.

**Expected result:** **Quick exit** reads **Exit** and sits beside **Get help**. Nothing overlaps or is cut off. **Get help** remains the most prominent.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Safety plan, mood log and report on real phones (MT-SP)

Automation proves the plan opens offline after one load, that nothing readable is stored, and that sign-out and another account clear it, all with a browser switch, not a radio. Nobody has dialled from the plan, kept it for a week in Safari, or looked at the PDF.

### MT-SP-01: Signed-in plan opens in airplane mode after one load

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in, a plan with one person and a phone number saved. Open **Your safety plan** once while online.

**Steps:**

1. Close the browser. Airplane mode on.
2. Open the app and go to the plan from **Help**, **Open your safety plan**.

**Expected result:** The plan shows, with **You're offline. This is the copy saved on this device on <date>.** The call buttons are there. Changing the plan says it needs a connection.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-02: Offline plan in the installed app

**Priority:** P0 | **Device:** Low-end Android, installed; Recent iPhone, home-screen app

**Preconditions:** As MT-SP-01, in the installed app.

**Steps:**

1. Airplane mode on. Open the installed app.
2. Open the plan.

**Expected result:** As MT-SP-01.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-03: One-tap call from the plan rings the right person

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A plan with a test contact whose number you own, written as **+91 98xxx xxxxx** with spaces.

**Steps:**

1. Open the plan. Tap **Call <name>, <number>**.
2. Let it ring, then hang up.
3. Tap **Call 112** and cancel in the dialler, without calling.

**Expected result:** The dialler opens with the right number, spaces removed, and the call goes through. 112 opens the dialler.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-04: Signing out removes the offline copy

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** As MT-SP-01, online.

**Steps:**

1. Settings, **Sign out**.
2. Airplane mode on. Open **Your safety plan**.

**Expected result:** No plan from the account is shown. The helplines still are.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-05: Second account on the same phone

**Priority:** P0 | **Device:** One phone, two test accounts

**Preconditions:** Account A has a plan, opened once on this phone.

**Steps:**

1. Clear cookies or let A's session lapse, without signing out.
2. Sign in as account B, open **Your safety plan**.
3. Airplane mode on, reload.

**Expected result:** B never sees A's plan, online or offline.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-06: Guest plan, then sign in and move it

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Not signed in.

**Steps:**

1. Make a plan as a guest. Read the line about where it's kept.
2. Sign in. Open **Your safety plan**.
3. Tap **Move it to your account**.

**Expected result:** The guest line says it is kept only on this device, encrypted. After signing in, the offer appears. After moving, the plan is in the account and the offer is gone.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-07: Safari 7-day eviction

**Priority:** P1 | **Device:** Recent iPhone, Safari

**Preconditions:** A guest plan in Safari, not installed.

**Steps:**

1. Don't open the site for 8 days.
2. Open **Your safety plan**.

**Expected result:** Record whether the plan survived. If it is gone, that matches the known limit in docs/modules/safety-plan.md. Check the same in the home-screen app.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-08: Plan readable in a crisis

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** A full plan.

**Steps:**

1. Read the plan at arm's length, in both themes, with large text on in the phone's settings.

**Expected result:** The steps are numbered and in large type. Nothing is cut off. Call buttons are easy to hit.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-09: Print or save the plan as PDF

**Priority:** P1 | **Device:** Android Chrome; iPhone Safari

**Preconditions:** A full plan.

**Steps:**

1. Tap **Print or save as PDF**.
2. Save as PDF, and open the file.

**Expected result:** Black on white. Every step and number is there. No buttons or header.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-10: Doctor report as an A4 PDF

**Priority:** P1 | **Device:** Android Chrome; iPhone Safari; a desktop browser

**Preconditions:** Signed in with check-ins, mood days and a plan.

**Steps:**

1. Open **Make a report for your doctor** from Trends.
2. Turn on **Mood notes** and **Safety plan**. Tap **Save as PDF or print**.
3. Save as PDF. Print one page on paper if you can.

**Expected result:** A4 pages, black on white, each section starting on a new page. The footer reads **Self-reported. A screening, not a diagnosis.**, then the GAD-7 attribution and the date. No controls. Record where page breaks fell on each browser.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-11: A clinician reads the report

**Priority:** P1 | **Device:** Paper or PDF from MT-SP-10

**Preconditions:** None.

**Steps:**

1. Give the report to a clinician. Ask what it tells them and what is missing or misleading.

**Expected result:** They can read scores, ranges, difficulty and the mood averages without explanation, and nothing reads as a diagnosis.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-SP-12: Daily mood log on a real phone

**Priority:** P2 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** Signed in.

**Steps:**

1. On Home, tap one word in **How are you today?**. Tap a second word quickly while it saves.
2. Tap **Add a note**, write one, **Save note**. Tap **Change**, pick another word.
3. Turn on airplane mode, tap **Change** and a word; read the message; turn it off and tap again.
4. Log yesterday on **Your mood log**. Try a future date in the picker.
5. Check the time zone: log just after midnight.
6. At 320px wide (small phone or zoom), check **Very good** fits its step.

**Expected result:** One tap saves: **Saved for today** and **You're feeling <word>**, with no Save button. The quick second tap does nothing. The note and the new word are kept together. Offline, the word stays pressed with an error, and the next tap saves. One entry per day, on the phone's own date. Future dates can't be chosen. No streaks or reminders anywhere. Every step's word is readable.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Reflections on real phones (MT-RF)

### MT-RF-01: Choosing at the start of a check-in

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** None.

**Steps:**

1. Tap **Start the check-in** on Home.
2. Read both choices. Choose **Anxiety check (GAD-7)** and answer it to the end. Go back to Home.
3. Start again and choose **Reflection**.

**Expected result:** "What would you like to do?" with two large choices, each saying what it is. Get help and Quick exit stay at the top. The GAD-7 is the same seven questions and the same result as before. The Reflection starts straight away, one question per screen.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RF-02: A reflection reads kindly, with no score

**Priority:** P1 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** None.

**Steps:**

1. Answer a Reflection honestly. Add a short note.
2. Read the result. Do another reflection straight away.

**Expected result:** No number, no range, no severity word and no chart. A short summary in plain words, your answers, and suggestions that match what came up. "This is a reflection, not a test or a diagnosis." The second reflection asks five different questions.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RF-03: A heavy answer brings Get help forward, calmly

**Priority:** P0 | **Device:** Low-end Android, Chrome; Recent iPhone, Safari

**Preconditions:** None.

**Steps:**

1. Do reflections until one asks about feeling hopeless, everything being too much, or not coping (see the 8 marked in [CLINICAL-SAFETY.md](../CLINICAL-SAFETY.md#reflection-questions)). Answer **A lot**.
2. Tap the call button on the result.

**Expected result:** "Support is here if you want it" comes first, calm, not alarming. The call button rings the first helpline. All helplines and the safety plan are one tap away.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RF-04: Saving, history and the report

**Priority:** P1 | **Device:** Recent iPhone, Safari; a desktop browser

**Preconditions:** None.

**Steps:**

1. As a guest, do a Reflection. Sign in. Save it from Home's "Your reflection is still here".
2. Signed in, do another. Open Trends and each reflection there. Delete one.
3. Open the report, turn on **Reflections** and **Reflection notes**, and save it as PDF.

**Expected result:** Both are saved and appear in Trends with a "Reflection" label and date, never on the score chart. Each opens to its questions and answers. The report lists them, with notes only when that option is on.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RF-05: Offline reflection

**Priority:** P2 | **Device:** Android Chrome, installed app

**Preconditions:** The app has been opened once online.

**Steps:**

1. Turn on airplane mode. Do a Reflection, as a guest and signed in.

**Expected result:** It starts and finishes with no connection. Signed in, the result says it couldn't be saved yet, and **Save reflection** works once back online.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

### MT-RF-06: A clinician reads the bank

**Priority:** P0 | **Device:** Paper or screen

**Preconditions:** None.

**Steps:**

1. Give a clinician the 100 questions and the result wording in [CLINICAL-SAFETY.md](../CLINICAL-SAFETY.md#reflection-questions), and the app.

**Expected result:** Items 24 to 28 of the clinician sign-off are completed.

**Result:** ☐ Pass ☐ Fail ☐ Blocked ☐ N/A, device and build: ____________

**Notes:** ____________

## Release sign-off

One page per release. Do not sign for anything you did not see.

| | |
| --- | --- |
| Release or commit SHA | |
| Environment and URL | |
| Date | |
| Consent version | |
| Helplines verified-on date in the build | |

### Helpline call record

Required for every release. A number nobody phoned does not get signed.

| Service | Number | Operator | Date and time | Caller | Tap opened dialler (Android, iPhone) | Answered, by whom | Hours confirmed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Emergency | 112 | | | | Dialler only. No call placed | Not applicable | Not applicable |
| Tele-MANAS | 14416 | | | | | | |
| Tele-MANAS | 14416 (second operator) | | | | | | |
| Tele-MANAS (toll-free) | 1800-891-4416 | | | | | | |
| Vandrevala Foundation | +91 99996 66555 | | | | | | |
| Vandrevala Foundation WhatsApp | 919999666555 | | | | | | |
| iCALL (TISS) | +91 91529 87821 | | | | | | |

### Gates

| Gate | Needed | Status | Evidence | Initials |
| --- | --- | --- | --- | --- |
| Automated: typecheck, lint, Vitest, Playwright on this SHA | All pass, in CI as well as locally | | | |
| `npm audit --omit=dev` | Clean | | | |
| All P0 manual cases | Pass, on the named devices | | | |
| All P1 manual cases | Pass, or a written acceptance by the owner | | | |
| Known issues KI-1 to KI-13 | Each fix confirmed on a real device, or accepted in writing | | | |
| Helpline call record above | Complete, and date in the build matches | | | |
| Client IP self-check (MT-DEP-07, 08) | `public … via header`, and separate buckets | | | |
| Production headers (MT-SEC-01 to 07) | Pass, with output saved | | | |
| Real mail (MT-MAIL-01 to 04) | Inbox, neutral on the lock screen | | | |
| Backups match the stated retention (MT-DEP-14) | Match | | | |
| Screen reader journeys (MT-ACC-01 to 04) | Pass | | | |
| Clinician sign-off (MT-CLN-01 to 06) | Signed | | | |
| Legal sign-off (MT-CLN-09) | Signed | | | |
| `docs/ACCESSIBILITY.md` updated with manual findings | Done | | | |

### Decisions

| Item | Decision: fix, accept, defer | Owner | Date |
| --- | --- | --- | --- |
| | | | |

### Signatures

| Role | Name | Signature | Date | Release: go or no-go |
| --- | --- | --- | --- | --- |
| Product owner | | | | |
| Tester | | | | |
| Clinician (wording and safety) | | | | |
| Legal (privacy and terms) | | | | |
