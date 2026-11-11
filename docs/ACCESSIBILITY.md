# Accessibility

Target: WCAG 2.2 level AA, because the spec requires it and because a person in distress has less capacity to fight an interface.

**AnxioCare does not claim WCAG 2.2 AA conformance.** Conformance needs a person testing with assistive technology, and that hasn't happened. As of 2026-11-06, the evidence is automated checks in emulated browsers, including scripted key presses, plus reading the code. No screen reader, no person using a keyboard, no real phone and no user with a disability has been involved. This page says what is known for each criterion, so the gaps can be closed.

## What was actually verified

| Check | Status | Scope |
| --- | --- | --- |
| Axe, mocked API | Passed on 2026-11-06 | axe-core 4.14.0, tags `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`. 47 screens, light and dark, at 390px wide, on WebKit and Chromium: `apps/web/e2e/audit.spec.ts` |
| Axe, real stack | Passed on 2026-11-06 | Guest and signed-in screens with long real data, delete sheet, light and dark: `apps/web/e2e/live/a11y.spec.ts` |
| No sideways overflow | Passed on 2026-11-06 | 320, 390, 430px and 568x320 landscape, mocked. 320px and 568x320, including anything cut off by the screen edge, live |
| Landscape, 568x320 | Passed on 2026-11-06 | Tab bar fits, targets 44px or more, content scrolls clear of it. Each check-in answer can be reached. Stop reachable in a breathing session: `audit.spec.ts`, `live/landscape.spec.ts` |
| Component behaviour | Passed on 2026-11-06 | Accessible names and roles used by Testing Library queries, chart labelling and table, offline announcement |
| Reduced motion | Passed on 2026-11-06 | Breathing session only: `resilience.spec.ts` |
| Tap target, 44px | Passed on 2026-11-06 | Header and tab bar links only: `audit.spec.ts` |
| Focus after a wrong code | Passed on 2026-11-06 | The code field only: `live/auth.spec.ts` |
| Keyboard operation | Passed on 2026-11-06, by script | Sign-in, consent, check-in with arrow keys and Space, a sheet, theme options, sounds: `live/keyboard.spec.ts`. Journal, Trends and other sheets are not walked. WebKit uses Option+Tab, as macOS Safari needs by default |
| Focus on route change | Passed on 2026-11-06 | To the `h1`, on links, Back and each check-in step: `live/keyboard.spec.ts` |
| Sheet focus | Passed on 2026-11-06 | Takes focus, stays inside for 12 Tabs, Esc and its own button hand it back to the opener. One sheet, in `live/keyboard.spec.ts` |
| Skip link | Passed on 2026-11-06 | First Tab reaches it, it shows, and it moves focus to the content: `live/keyboard.spec.ts` |
| Focus not obscured | Passed on 2026-11-06 | Settings at the phone size and 568x320. It failed first, and `scroll-padding` fixed it: `live/keyboard.spec.ts` |
| Soundscape teardown | Passed on 2026-11-06 | Start, stop, hide and unmount close the `AudioContext` without errors, on mocked Web Audio. Nothing beyond that is claimed |
| TalkBack, VoiceOver | **Not tested** | See MT-ACC-01 to 11 |
| Large fonts, zoom, text spacing | **Not tested** | See MT-ACC-12, 13, 19, 20 |
| Colour vision, high contrast | **Not tested** | See MT-ACC-17, 21 |
| Real devices | **Not tested** | See MT-DEV |

**How far axe goes.**

- Only **serious and critical** violations fail the tests. Moderate and minor ones don't fail and aren't reported, so the true number is unknown.
- Axe can find a minority of accessibility problems. A pass doesn't show a screen reader experience is any good.
- It checks states the test reached. These states aren't reached: most sheets, most error states, the offline banner, the update prompt, breathing's end screen, grounding after its first step, a sound playing.
- It runs in desktop browser engines, with emulated viewports.

## WCAG 2.2 checklist

Status terms:

- **Axe:** axe rules for this criterion ran and found nothing serious or critical. A human check is still needed.
- **Code:** read in the source, and looks right. No test proves it.
- **Partial:** some of it is tested, and the rest is not.
- **Human:** only a person can judge this, and nobody has yet.
- **At risk:** the code gives reason to doubt it.
- **N/A:** the app has nothing this applies to.

No row says "Pass", on purpose. Fill in the last column as manual testing happens.

### 1. Perceivable

| Criterion | Level | Status | Evidence, and what a person must check | Manual case | Human result |
| --- | --- | --- | --- | --- | --- |
| 1.1.1 Non-text content | A | Axe, Human | Icons are `aria-hidden`, with text or `aria-label`. Chart is one labelled image with `<title>` and `<desc>` (`TrendChart.test.tsx`). Check the names make sense when spoken | MT-ACC-03, 10 | |
| 1.2.1 Audio-only and video-only | A | N/A | No prerecorded speech or video. Soundscapes are non-speech ambient sound, generated live | | |
| 1.2.2 Captions | A | N/A | No video | | |
| 1.2.3 Audio description or alternative | A | N/A | No video | | |
| 1.2.4 Captions, live | AA | N/A | No live media | | |
| 1.2.5 Audio description | AA | N/A | No video | | |
| 1.3.1 Info and relationships | A | Axe, Human | Landmarks, headings, labels, fieldsets, `<table>` with `scope`. The print table has no `scope`. Check reading structure by screen reader | MT-ACC-06, 10 | |
| 1.3.2 Meaningful sequence | A | Human | DOM order follows the visual one, by reading. In the OTP input, the drawn boxes are hidden from AT | MT-ACC-03, 05 | |
| 1.3.3 Sensory characteristics | A | Human | Copy doesn't rely on shape or position, by reading. "Follow the circle" has spoken phase words too | MT-ACC-07 | |
| 1.3.4 Orientation | AA | Partial | The manifest sets no orientation (tested), so nothing locks it. Layouts fit 568x320 in emulation (tested). Not tried on a real phone, or installed | MT-DEV-06, 07 | |
| 1.3.5 Identify input purpose | AA | Axe, Code | `autocomplete="email"`, `given-name`, `one-time-code` | MT-MAIL-05, 06 | |
| 1.4.1 Use of colour | A | Partial | Chart bands in words (`TrendChart.test.tsx`). Selected state has a tick. Result scale has words, numbers and position. Current tab has weight. Check all by colour filter | MT-ACC-17, MT-RES-05 | |
| 1.4.2 Audio control | A | Code | Nothing plays automatically. Sounds start on a tap, with stop and volume, and end when the screen is hidden (tested on a mock). Check nothing is stranded at a locked screen | MT-TOL-09, 10 | |
| 1.4.3 Contrast, minimum | AA | Axe | Light and dark on reached states. Computed: body text 12.67:1 light, 14.81:1 dark; soft text 6.59:1 light, 9.57:1 dark. States not reached by axe need checking. Check outdoors | MT-ACC-14, 15 | |
| 1.4.4 Resize text | AA | Human | Viewport allows zoom (`viewport-fit=cover`, no `user-scalable=no`). Sizes in rem. Not tried at 200%, and the eight OTP boxes are the likely weak point | MT-ACC-12, 13 | |
| 1.4.5 Images of text | AA | N/A | None. Icons and the wordmark are not body text | | |
| 1.4.10 Reflow | AA | Partial | No overflow at 320px, which is the 1280px-at-400% case, on reached states. Data table scrolls in its own region. Not tried by zooming | MT-ACC-19, MT-DEV-03 | |
| 1.4.11 Non-text contrast | AA | **At risk** | Not checked by axe. Computed by hand from `styles.css`: field border 7.45:1, focus ring 6.48:1 light and 10.01:1 dark, pass. **OTP box border at 50% opacity: 2.33:1 in light, under 3:1.** Option and chip borders 1.40:1 light and 1.70:1 dark, though these have text labels to identify them. Slider tracks are browser default. Needs a person to judge | MT-ACC-14, 21 | |
| 1.4.12 Text spacing | AA | Human | Not tried. Fixed-height OTP boxes and `h-14` header are the places to watch | MT-ACC-20 | |
| 1.4.13 Content on hover or focus | AA | N/A | No tooltips or hover content | | |

### 2. Operable

| Criterion | Level | Status | Evidence, and what a person must check | Manual case | Human result |
| --- | --- | --- | --- | --- | --- |
| 2.1.1 Keyboard | A | Partial | Main journeys operated by scripted key presses (see above). Not every screen, and no person | MT-ACC-18 | |
| 2.1.2 No keyboard trap | A | Partial | Native `<dialog>`, with Esc and close. One sheet tested by script | MT-ACC-18 | |
| 2.1.4 Character key shortcuts | A | N/A | None | | |
| 2.2.1 Timing adjustable | A | Human | Sign-in code lasts 10 minutes, and can be re-requested. That may count as a security exception, and a person should judge. Breathing is user-started, with stop. 260ms auto-advance after an answer is the thing to watch for AT | MT-ACC-03, 04 | |
| 2.2.2 Pause, stop, hide | A | Code | Breathing motion starts by tap, and has **Stop**. Under reduced motion it doesn't scale or spin (tested). Skeleton animation shows only while loading | MT-ACC-16 | |
| 2.3.1 Three flashes | A | Code | Nothing flashes, by reading. Check breathing visually | MT-ACC-16 | |
| 2.4.1 Bypass blocks | A | Partial | **Skip to content** link (tested), and landmarks | MT-ACC-18 | |
| 2.4.2 Page titled | A | Axe, Code | `PageTitle` sets each route's title. Note some titles differ from the on-screen heading on purpose | MT-ACC-01 | |
| 2.4.3 Focus order | A | Partial | Focus moves to the `h1` on navigation, and native `<dialog>` handles sheets, both tested by script. Whether the order makes sense is for a person | MT-ACC-18 | |
| 2.4.4 Link purpose, in context | A | Axe, Human | Link names checked by axe. Helpline call links read "Call 14416", with the service as the heading above. Check by screen reader | MT-ACC-01, 02 | |
| 2.4.5 Multiple ways | AA | Code | A small app, with tabs, Home links and Tools. Saved items are reached via lists | | |
| 2.4.6 Headings and labels | AA | Human | Present. Whether they describe well is for a person | MT-ACC-11 | |
| 2.4.7 Focus visible | AA | Code, Human | 3px `:focus-visible` outline. Not looked at on each screen, especially **Breathe** night canvas and chips | MT-ACC-18 | |
| 2.4.11 Focus not obscured, minimum | AA | Partial | New in 2.2. Sticky header and fixed tab bar, with `scroll-padding` in `styles.css` to clear them. Settings tested by script. Sticky bottom buttons, and other screens, are not | MT-ACC-18 | |
| 2.5.1 Pointer gestures | A | Code | No path or multi-point gestures | | |
| 2.5.2 Pointer cancellation | A | Code | Native click events | | |
| 2.5.3 Label in name | A | Partial | Where `aria-label` is used, it includes the visible text, as in "Sign out Chrome on Android". The axe rule for this is experimental, and isn't on | MT-ACC-22 | |
| 2.5.4 Motion actuation | A | N/A | No shake or tilt. `Permissions-Policy` blocks accelerometer and gyroscope | | |
| 2.5.7 Dragging movements | AA | Human | New in 2.2. Volume and strength use native `<input type="range">`. Native tapping on the track and keyboard steps should qualify. Check on phones | MT-ACC-08 | |
| 2.5.8 Target size, minimum | AA | Axe | Axe's 24px rule. The project's own 44px standard is only tested in the header and tab bar. Inline links in paragraphs (self-harm call links) are the ones to check by hand | MT-DEV-10, MT-HELP-11 | |

### 3. Understandable

| Criterion | Level | Status | Evidence, and what a person must check | Manual case | Human result |
| --- | --- | --- | --- | --- | --- |
| 3.1.1 Language of page | A | Axe | `lang="en-IN"` | | |
| 3.1.2 Language of parts | AA | Human | "Pa Sa Sa Sa" in the tanpura description, and Hindi words if any are added. People's own journal text isn't marked: reasonable, but check how it is read | MT-JRN-09 | |
| 3.2.1 On focus | A | Code | Nothing happens on focus | | |
| 3.2.2 On input | A | Human | Answering a question auto-advances, and a complete code submits itself. Both are declared in copy or pattern, and options are buttons, but a person should judge the auto-advance | MT-ACC-03, 04 | |
| 3.2.3 Consistent navigation | AA | Code | One `Shell`. Tabs hide on focus screens by design | MT-NAV-01 | |
| 3.2.4 Consistent identification | AA | Code | Same names throughout, by reading | | |
| 3.2.6 Consistent help | A | Partial | New in 2.2. **Get help** is proved present on all guest and signed-in routes (`live/safety.spec.ts`), in the same header component. Same position by reading | MT-NAV-02 | |
| 3.3.1 Error identification | A | Partial | Errors in words with `role="alert"`, tested for main forms | MT-ACC-05 | |
| 3.3.2 Labels or instructions | A | Axe, Code | All fields labelled. Hints linked by `aria-describedby` | MT-ACC-05, 11 | |
| 3.3.3 Error suggestion | AA | Code | Messages say what to do next, as in `lib/api.ts`. At the guess cap, a general note appears after two wrong codes, without saying whether this address is capped: [accepted risk](SECURITY-EXCEPTIONS.md#sign-in-lockout-of-a-new-device) | MT-AUTH-09 | |
| 3.3.4 Error prevention (legal, financial, data) | AA | Partial | Deleting an account needs a fresh code, and is tested. All deletes confirm, and most are tested. Consent has two explicit boxes | MT-SET-12 | |
| 3.3.7 Redundant entry | A | Code | New in 2.2. Drafts and answers persist across steps. Email retained on the code screen | MT-CHK-03 | |
| 3.3.8 Accessible authentication, minimum | AA | Partial | New in 2.2. No puzzle or transcription test. Passwords allow paste and password managers (`autocomplete` tested in `live/accounts.spec.ts`), and an emailed code or Google are alternatives. Copying a code is allowed by paste and autofill (tested in `OtpInput.test.tsx`). Real autofill not tried | MT-MAIL-05, 06, 07 | |

### 4. Robust

| Criterion | Level | Status | Evidence, and what a person must check | Manual case | Human result |
| --- | --- | --- | --- | --- | --- |
| 4.1.2 Name, role, value | A | Axe, Human | Axe rules pass on reached states. Tests find controls by role and name. `role="radio"` theme options have the keyboard pattern (tested). Check state announcements | MT-ACC-03, 08, 09 | |
| 4.1.3 Status messages | AA | Partial | `role="status"`, `role="alert"` and `aria-live` throughout. Offline is tested for role. Nothing has listened to them | MT-ACC-05, 07 | |

## Keyboard and screen reader expectations, per screen

What each screen should do, from reading the code. **Scripted key presses cover part of it, as listed above. None of it has been checked by a person with a keyboard, or with a screen reader.** Use it as the expected result, and record what you find. On every screen: Tab first reaches **Skip to content**, then the wordmark, then **Get help**, then, at wide widths, the tabs. On navigation, focus moves to the screen's `h1`.

| Screen | Keyboard | Screen reader should announce |
| --- | --- | --- |
| Home, guest (`/`) | Tab to **Start the check-in**, **Overwhelmed? Breathe first**, **Sign in to see saved results** | The question heading, then the description. Resume cards read as links with both lines |
| Home, account | Tab to last-result buttons, then four quick links | Greeting, last check-in, band and score in words, next date |
| Help (`/help`) | Tab through call links in page order. Enter opens the dialler where one exists | "If you or someone else is in immediate danger". Each service name is a heading, followed by "Open:" and hours. "Message on WhatsApp". Website links add "(needs internet)" |
| Check-in intro | Tab to **Begin**, or **Continue from question n** and **Start again**, and **Not now** | Heading, four points |
| Check-in question | Tab to **Back**, then four options. Arrow keys move between them. Enter or Space selects, and after 260ms focus moves to the next question's heading | "Question n of 7" progress, stem, question, a group named for the question, and each option's pressed state. Check speech isn't cut off by the advance |
| Difficulty | As above | "All seven questions answered", and the question |
| Saving | Nothing to operate | "Saving your result", by `role="status"` |
| Result, guest and saved | Tab through inline links, **Print for a doctor**, and save or delete controls. Severe: call link comes first | Band and score in the heading ("Moderate range: 12 out of 21"), and meaning. The scale reads as a labelled figure with the current band marked |
| Tools | Tab through four links | Name and description of each |
| Breathe, setup | Tab through rhythm and length buttons, **Sound** select, **Vibrate** if present, **Begin** | Pressed state of each. Rhythm summary is live |
| Breathe, session | **Stop** is the only control besides the shell | "Settle in", then each phase by live region. The count isn't spoken, on purpose |
| Breathe, finished | Three controls | Heading, then a reflective line |
| Grounding | Tab to the numbered buttons and **Next sense**. **Back to tools** closes it | Step heading, hint, and "Tap once for each one. n of m." live. "Thing 2 of 4, noticed" |
| Sounds | Tab to four toggle buttons, then **Volume**. Arrow keys on the slider | Pressed state, "Playing. Tap to stop." or "Paused by your phone. Tap to play again.", and volume as a percent |
| Sign in | **Continue with Google** if on, email and password fields, **Show password**, **Forgot your password?**, **Sign in**, **Email me a code instead**, **Create an account**, **Continue without an account** | Labels and error as an alert. A failed sign-in clears the password and moves focus to it |
| Create account | Optional name, email, password with its hint, **Show password**, **Continue** | Hint by `aria-describedby`, error as an alert, focus moves to the password if it's refused |
| Choose a new password | Code, then password with its hint, **Set new password** | Label, hint, error as an alert. A hidden username field for password managers |
| Code | Single real input; arrows and typing work. **Continue**, **Send a new code**, **Use a different email** | "6-digit code", digits as typed, not the boxes. "Checking your code" and errors, by live region. Focus returns to the field on error |
| Consent | Links, two checkboxes, two buttons, then links to Settings and the tools. A re-prompt has **What changed** first | Headings, each checkbox's whole sentence, error as an alert |
| Trends | Row link and delete in order. **Show these as a table** | Summary sentence, chart as one image, table with headers, "Delete check-in from date" |
| Journal list | Main button, entries as links | Date, thought, situation for each |
| Journal form | **Close**, field, **Previous step**, **Next**. Chips by Tab, and Enter in **Add your own** adds it | Step's question as heading and label, hint, error as an alert. "Step n of 5". Slider "n out of 10" |
| Journal entry | **Edit**, **Delete** | Date, thought as heading, sections with headings |
| Header | **Quick exit** before **Get help** | "Quick exit, button" (shows **Exit** below 480px) |
| Safety plan | Call buttons, **Change your plan**, **Print or save as PDF**, **Delete this plan** | Steps as headings, "Step n: title". Calls named "Call <name>, <number>" |
| Safety plan form | One fieldset per step: items, **Remove item n**, **Add another**, **Add a person** | Legend is the step title, prompt and example as text |
| Mood card and log | Five word buttons with pressed state in one row (one tap saves), **Add a note**, **Change** | Group named "How are you today?". Chart as one image with a summary, and a table |
| Doctor report | Period radios, section checkboxes, **Save as PDF or print** | Preview region "Report preview", tables with captions and column headers |
| Settings | Long Tab order, in section order. **Appearance** is one Tab stop, and arrow keys choose. With consent outstanding, the agreement prompt comes first, and the name and email change are absent | Section headings. "This device" or "Last used". "Sign out Chrome on Android" |
| Any sheet | Focus goes inside, trapped. Esc or **Close** dismisses, and focus returns. Tapping the backdrop closes | Dialog named by its heading |
| Legal pages | Links only | Heading structure, version date |
| Not found | **Go home**, **Go to Help** | "There's nothing at this address" |
| Error screens | **Go to Help**, **Reload**, **Try again** | Heading, or `role="alert"` for inline error states |
| Offline banner | Nothing | "You're offline. Help, breathing and grounding still work." by `role="status"`. Note a status region added at load may not be spoken: check |
| Update prompt | **Later**, **Refresh** | "New version available" by `role="status"` |

## Known limits

Known today, and honest about being unresolved:

1. **No assistive technology has been used.** Everything above is expectation.
2. **Orientation:** nothing locks it now, but it hasn't been tried installed, or on a real phone.
3. **Focus could still be hidden** behind sticky bottom buttons, or on screens the script doesn't walk. 2.4.11.
4. **OTP box borders are under 3:1 in the light theme,** by calculation: 2.33:1. The label and the current-box highlight help. A person should judge.
5. **Keyboard runs are scripts,** on some screens. A person may still find it hard to use.
6. **Auto-advance** at 260ms may interrupt a screen reader. There is no setting to turn it off.
7. **Sign-in codes expire in 10 minutes,** which is a security decision, and may be tight with some disabilities. A new one can be requested after 45 seconds.
8. **The breathing live region** may overrun short phases, or be unwelcome. There is no way to silence it without leaving.
9. **English only.** The GAD-7 is shown only in English, because only validated translations should be used and none are in this build. That's a real barrier in India, though not a WCAG one.
10. **No lock-screen audio controls.** A sound ends when the browser reports the page hidden. On a platform that keeps playing without reporting that, it couldn't be stopped without unlocking.
11. **Print view:** the print table has no `scope` attributes, and PDF output isn't tagged in any controlled way.
12. **Moderate and minor axe issues aren't tracked:** see above.

## Publishing a statement

No formal VPAT or accessibility statement should be published until the manual column above is filled in.
