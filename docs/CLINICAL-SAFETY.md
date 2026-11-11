# Clinical safety

How AnxioCare keeps its clinical content honest and what it cannot do. **No clinician has reviewed this app yet.** That review is a launch blocker. The sign-off form is at the end. For what the app promises legally, see [PRIVACY-COMPLIANCE.md](PRIVACY-COMPLIANCE.md).

This document was written by someone who is not a clinician. Where it makes a clinical judgement, it marks that as a question for the reviewer.

## What the app is and is not

**Is:** a self-check using a published screening questionnaire, some calming tools, a private journal, and a list of helplines.

**Is not:** a diagnosis, treatment, a medical service, an emergency service, or a risk assessment. Nobody monitors what people enter. No clinician, employer or family member has access. There is no AI advice.

## The instrument

**Source:** Spitzer RL, Kroenke K, Williams JBW, Löwe B. *A brief measure for assessing generalized anxiety disorder: the GAD-7.* Arch Intern Med. 2006;166(10):1092-1097.

**In the code:** `packages/shared/src/gad7.ts`. It is the only copy. The web app displays it, and the API computes the score from it.

**Reuse.** The developers' instruction manual says: "All of the measures included in Table 1 are in the public domain. No permission is required to reproduce, translate, display or distribute." The manual also says the measures were developed "by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc." The app shows that attribution as `GAD7_ATTRIBUTION`, on the Result and About pages. Note that the statement lists reproduce, translate, display and distribute. It does not mention modify. **Some copies on the web still carry an older Pfizer copyright line. The lawyer can confirm this.**

### Why the wording and cut points are fixed

A questionnaire's sensitivity and specificity belong to the words that were tested. Rewording an item, adding a helpful sentence or moving a threshold produces a different, unvalidated instrument, while still using the name of the validated one. So:

- Do not reword the items, options or thresholds, however kindly the reason.
- Do not reorder them.
- Do not add or remove a scale, and do not show subscale "breakdowns".
- Do not translate them yourself. Validated translations are said to be available from the PHQ Screeners site. Use one of those, with a clinician, if the app ever adds a language.

### Wording and the disclosed adaptation

| Part | In the code | Published | Status |
| --- | --- | --- | --- |
| Stem | "Over the last 2 weeks, how often have you been bothered by the following **problem**?" | "...by the following **problems**?" | **Adapted, on purpose.** See below. |
| Items 1 to 7 | As in `GAD7_ITEMS` | Same in meaning. Copies in circulation vary in small ways, such as "anxious, or on edge" with a second comma. | **Reviewer: compare character by character with the official form.** |
| Options | Not at all, Several days, More than half the days, Nearly every day | Same (manual). | Matches. |
| Difficulty item | "How difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?" | Manual quotes the same words. Forms usually add a lead-in, "If you checked off any problems,". | **Lead-in omitted.** The app asks this only if at least one answer was above zero, so the condition is applied by the app. The difficulty answer is not scored, and it is shown to the person and in the print view. **A second adaptation for the reviewer to accept or reject.** |
| Scoring | 0 to 3 per item, total 0 to 21 | Same. | Matches. |
| Severity bands | 0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe | "Scores of 5, 10, and 15" for mild, moderate and severe (manual). | Matches. |
| Referral point | 10 or above | The manual calls 10 a "yellow flag", and 15 a "red flag" for individuals where active treatment is probably warranted. Spitzer 2006 reports 89% sensitivity and 82% specificity at 10, for generalized anxiety disorder. | Matches. |

**The adaptation.** The published stem introduces a list of seven problems on one page. AnxioCare shows one item per screen, so each screen has one problem, and "the following problems" above a single line would read as an error. The stem therefore says "the following problem". Meaning is unchanged, and no item, option, score or threshold is altered. **This is the only change to the stem.** It is disclosed here and on the About page.

**The app discloses both adaptations.** The About page says the item and option wording is as published, and that the stem and the lead-in to the difficulty question are lightly adapted, because the app shows one question per screen. **Reviewer: is that wording acceptable, and is one item per screen itself a change worth recording?** Self-report instruments have often been moved to electronic and one-per-screen formats, but this document cites no study showing equivalence for the GAD-7.

**A later alternative.** Other studies suggest a lower cut point, around 8, for "any anxiety disorder". The app stays with the published 10 because it is the point in the source paper and the manual. **Reviewer: is that right for this audience?**

**Indian population and language.** The app is in English, and the 2006 sample was US primary care. This document does not establish validity in India. **Reviewer: comment, please.**

## Severity handling

| Score | The app shows | Why |
| --- | --- | --- |
| Every score | Range label, score of 21, plain meaning, "This is a screening, not a diagnosis. Only a doctor or mental health professional can diagnose anxiety." | Honest about what it is. |
| 0 to 9 | Calming tools, "keep an eye on it", next check-in date. | No recommendation for professional care, in line with the published cut point. |
| 10 to 21 | Also: "Talk to a professional", naming Tele-MANAS as a starting point. | `GAD7_REFERRAL_CUTOFF`. |
| 15 to 21 | Also: a prominent calm support section with a one-tap call, and fuller self-harm guidance. | Calm, never alarming. |

Severity changes words and position, never colour alone. There is no red score, celebration, streak or badge. The next check-in date is 14 days out, because the questions cover two weeks.

The print view shows the instrument's items, the answers and the total, marked "Not a diagnosis", for showing to a doctor.

## Self-harm messaging

**Why the app says anything.** The GAD-7 has no question about self-harm. The PHQ-9, its sibling, does. A person with severe distress might take the check-in, get a low score, and take that as reassurance. So:

- A "Get help" control is on every screen, including during the check-in. The check-in intro says so. Evidence: `apps/web/e2e/live/safety.spec.ts:22,30,47`.
- Every result says that these questions don't ask about thoughts of harming yourself, "whatever your score", with a link to help. A severe result shows the guidance in full.
- The guidance (`SelfHarmGuidance` in `Help.tsx`) says that this can ease with support, to call Tele-MANAS now, to call 112 or go to the nearest hospital if the person might act, to stay with someone they trust, and to put distance between themselves and anything they could use.
- Help works offline after one visit, with no login and no animation. Call links appear in static HTML, even with no JavaScript. Evidence: `safety.spec.ts:71,92`, `resilience.spec.ts:40,83`.

**The limits, stated plainly.**

- **The app does not assess risk.** It asks nothing about self-harm, and does not infer it.
- **Nobody reads what people write.** The journal is encrypted, there is no keyword detection, and no alert goes to anyone. A person could write a suicide note in a thought record, and nothing would happen. The Terms state "nobody at AnxioCare monitors what you enter".
- **It cannot reach anyone.** No emergency contact, no follow-up after a severe score, no location.
- **A helpline may not answer.** The app cannot know. iCALL is not open at all hours.
- **English only**, and it assumes a phone, a network and privacy to make a call.
- The wording has not had clinical review. **Reviewer: please check especially "it can ease with support", and the means-safety sentence.**

## Helpline verification

The numbers are in `packages/shared/src/helplines.ts`. `HELPLINES_CHECK_METHOD` and `HELPLINES_CHECKED_ON` set the sentence on the Help and About pages. Today that reads "Helpline numbers checked against published sources on 6 Nov 2026. They have not yet been confirmed by phone."

**The date in the code, 2026-11-06, is the desk research below, not a phone check,** and the app says so. Nobody has called these numbers. Calling them is still a launch blocker. That research didn't check 112, and couldn't fetch the official Tele-MANAS site, so "published sources" means what the table says, and no more.

### What desk research found on 2026-11-06

| Service | Number in the app | Found | To settle by phone |
| --- | --- | --- | --- |
| Tele-MANAS | 14416, and 1-800-891-4416 | 24x7 and toll-free ([MoHFW on X](https://x.com/MoHFW_INDIA/status/1958419392867270891), [IIT Kanpur](https://www.iitk.ac.in/counsel/TeleManas.php), [Find a Helpline](https://findahelpline.com/organizations/tele-manas)). The official [site](https://telemanas.mohfw.gov.in/) could not be fetched, because of a certificate error from the checking tool. | Both numbers work from Jio, Airtel, Vi and BSNL. Language menu. Open the website link from the app. |
| Vandrevala Foundation | +91 99996 66555, and WhatsApp on the same number | "Available 24 X 7 X 365", free ([foundation](https://www.vandrevalafoundation.com/free-counseling)). Its site warned of service being affected on 20 and 27 October, with no year. Paid sessions are a separate service. | Carrier charges, since it's a mobile number. Whether WhatsApp responds. |
| iCALL (TISS) | +91 91529 87821 | **Hours conflict.** See below. Free, per its [site](https://icallhelpline.org/). Also shows 022-25521111. | Hours, and languages. |
| 112 | 112 | Not independently checked in this research. | **Do not place a test call to emergency services.** Confirm from official sources instead, such as the government's Emergency Response Support System site (`112.gov.in`, which could not be reached from the checking tool). |

**The iCALL hour conflict.** The app says "Monday to Saturday, daytime. Check the website for current hours". That vague wording is deliberate, because sources disagree:

- [icallhelpline.org](https://icallhelpline.org/) homepage and chat widget: Monday to Saturday, 8:00 am to 9:00 pm.
- Other iCALL pages and TISS material, according to search results: Monday to Saturday, 10 am to 8 pm.

Call iCALL during the overlap, and ask. If the hours are confirmed, consider a precise value for `availability`, since someone at 8:30 pm should not have to wonder, and "daytime" may be misleading. A person in crisis should not need to check a website.

**"These services are free."** The Help page says so, and each service says the same of its counselling. Whether a caller pays their carrier for a mobile number was not confirmed. Check it, and change the sentence if needed.

### Procedure

Do this before launch, then **quarterly, in the first week of February, May, August and November.** Do it sooner if anyone reports a problem. `helplines.ts` itself asks for a check "before each release". In practice, follow the stricter of the two, or change that comment.

These are real crisis lines, and your call takes someone's time.

1. Open the deployed Help page on a real phone.
2. **Call at a quiet time, such as mid-morning on a weekday.** Tap the app's own link, because that also tests the `tel:` link.
3. Say straight away: "I'm not in crisis. I run a small app that lists your number for people in India, and I want to check our details. Is now all right?" If they are busy, thank them and call another day.
4. Ask:
   - Is this the right number to list? Do you prefer another?
   - What are your days and hours, today?
   - Which languages?
   - Is the call free to the caller, including carrier charges?
   - May we list you, and how should we describe you?
5. If you can't get through, try twice more at different times. Record it. If it still fails, treat it as a [safety incident](OPERATIONS.md#incident-response).
6. For Tele-MANAS, try both numbers, on at least two carriers if you can.
7. Send a WhatsApp message to Vandrevala using the app's link, with the same opening, and see if it is answered.
8. Open each website link in the app.
9. Record the result (below). Keep this log privately. It holds no user data.

Then, if everything is right:

1. Edit `packages/shared/src/helplines.ts`. **Set `HELPLINES_CHECK_METHOD` to `'phone'`, and `HELPLINES_CHECKED_ON` to the date of the calls,** and update any changed `display`, `tel`, `availability` or `description`. The app's sentence becomes "Helpline numbers confirmed by phone on...". Only do this when every number has been reached. If only some were, leave the method alone, and update the numbers you've confirmed. A test in `gad7.test.ts` pins the method, so that it can't change by accident: update it in the same commit, and say in the pull request who phoned and when.
2. A change to a number must also be made in both `display` and `tel`. The Help page, the severe result, the print view and the static fallback in `index.html` all draw from this file, so no other place needs editing.
3. Run `npm test`, then open a pull request and merge it.
4. After the deploy, open Help on your phone, and confirm the new date. People with the app installed get it once they accept the update prompt.

If a number has died, **remove it the same day** and deploy, rather than wait for the rest of the checks.

| Date | Service | Number tried | Carrier | Got through? | Hours and languages told | Free? | By |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | Tele-MANAS | 14416 | | | | | |
| | Tele-MANAS | 1-800-891-4416 | | | | | |
| | Vandrevala | +91 99996 66555 | | | | | |
| | Vandrevala | WhatsApp | | | | | |
| | iCALL | +91 91529 87821 | | | | | |

## Breathing and grounding

**What exists.** Paced breathing: Slow exhale (in 4, out 6), Box (4 each, with holds), and 4-7-8 (in 4, hold 7, out 8), for 1, 3 or 5 minutes. Slow exhale is the default, with no holds. Grounding is the guided 5-4-3-2-1 steps. Sounds are generated in the browser. Vibration is opt-in.

**Precautions in the app.**

- Before starting: "If you feel dizzy or short of breath, stop and breathe normally."
- During a session: "Dizzy or short of breath? Stop and breathe normally." with a Stop button always on screen.
- Terms: stop if you feel unwell, and "If you have a medical condition affecting your breathing, ask your doctor first."
- Reduced motion is honoured, and the session still guides. Evidence: `apps/web/e2e/resilience.spec.ts:73`.
- Nothing claims that the exercises treat anxiety. The wording is that they "can help you settle".

**For the reviewer.** Is the holds-based 4-7-8 pattern suitable with no further warning, for someone with a respiratory or heart condition, in pregnancy, or prone to panic when focusing on breath? Should it remain, or should the warning be stronger and shown before choosing it? Is it wise to offer "Breathe" on the Help page as something to do "while you wait"? Is 5-4-3-2-1 grounding fine for someone dissociating, or with trauma? This document asserts no clinical answer. The precaution in the app comes from the design specification, not from a clinical source.

## Copy rules

Follow these for every word shown to a person. They come from the [design specification](superpowers/specs/2026-11-06-production-rebuild-design.md), and they stay in force after launch.

| Rule | Example |
| --- | --- |
| Never "diagnosis" for a result. Always "screening". | "This is a screening, not a diagnosis." |
| Never "you have". Say what the answers suggest. | "Your answers suggest..." |
| No invented statistics. | Don't write "1 in 5 people", unless it is sourced and reviewed. |
| No gamification. | No confetti, streak, badge, celebration of a lower score. |
| No alarm. Severe is prominent and calm. | "You don't have to manage this alone." |
| No promises of outcome. | "can help you settle", not "will reduce your anxiety". |
| No AI advice. No personalised advice. | The app explains the score, and points to people. |
| Mail is neutral. | Nothing about anxiety or health in subject, body or sender. `mail.ts`, enforced by `hardening.test.ts:537`. |
| Don't stigmatise, and don't use suicide-as-crime language. | "thoughts of harming yourself". |
| Attribute the instrument wherever it is presented. | `GAD7_ATTRIBUTION`. |
| A person's score belongs to them. | No sharing, no comparison with others. |

Any change to clinical copy needs clinician review. That covers:

- `gad7.ts` severity meanings
- `Result.tsx`, `Help.tsx`, `CheckIn.tsx`, `Breathe.tsx` and `Ground.tsx`
- the Journal prompts
- the safety plan wording in `tracking.ts` and `SafetyPlan.tsx`
- the mood scale words
- the doctor report in `Report.tsx`
- the Terms

## Safety plan wording

**Not yet reviewed by a clinician. It needs review before launch, as items 19 to 23 of the sign-off.**

The plan follows the order and structure of the Stanley-Brown Safety Planning Intervention (Stanley and Brown, 2012). The wording is the app's own, not copied from the published template.

**Owner to decide:** whether the Stanley-Brown authors' permission or an attribution is needed to describe it this way, or to follow its structure. This document doesn't assert either way. The app currently names Stanley-Brown only in code comments and these docs, not on screen.

Rules applied:

- Every section is optional.
- Nothing is pre-filled except Emergency 112 and the shared `HELPLINES`, which come from `helplines.ts`.
- Examples are shown as "For example: …" hints, never as values.

Source: `SAFETY_PLAN_SECTIONS` in [packages/shared/src/tracking.ts](../packages/shared/src/tracking.ts), verbatim:

| # | Title | Prompt | Example |
| --- | --- | --- | --- |
| 1 | Warning signs that a hard time may be starting | Thoughts, feelings or things you do that tell you it is getting harder. | Not sleeping, staying in my room all day |
| 2 | Things I can do on my own to calm down | Small things that have helped before, even a little. | Slow breathing, a cold glass of water, a short walk |
| 3 | People and places that help me take my mind off things | Somewhere to go, or someone to be with, without having to talk about it. | Chai with a friend, the park near home |
| 4 | People I can ask for help | People you trust to call when it gets hard. | My sister, a friend from college |
| 5 | Professionals and helplines | Your own doctor or therapist, if you have one. The helplines below are always here. | My doctor at the clinic |
| 6 | Making my surroundings safer | Ways to put distance between you and anything you could use to hurt yourself. | Ask someone I trust to keep my medicines for now |
| 7 | What matters most to me, and reasons to keep going | People, hopes, or things you love. | My family, my dog, seeing the monsoon again |

Other plan copy, from [SafetyPlan.tsx](../apps/web/src/routes/SafetyPlan.tsx):

- Under the title: "For hard moments: what helps, and who to call. Written by you, in your own words."
- Empty plan: "Make a plan while things are calm". "A few lines in each part is plenty, and every part is optional. When a hard moment comes, it's here to read, one step at a time."
- Form: "Write it at a calmer time. Short lines are best, and every part is optional. You can change it whenever you like."
- Step 5, under Call 112: "Emergency services, if you or someone else is in immediate danger."
- Guest: "Without an account, your plan is kept only on this device, encrypted. You can delete it at any time."
- Account: "A copy is kept on this device, encrypted, so it opens without a connection. Signing out removes it."
- Offline: "You're offline. This is the copy saved on this device on <date>. Changes need a connection." With no copy: "You're offline, and no safety plan is saved on this device. The helplines below still work."
- Help: "Your safety plan". "The steps you wrote for hard moments, and the people you can call. Works without an account, and offline once it has opened." The severe result links to it as "Open your safety plan".

**About quick exit**, on Help ([Help.tsx](../apps/web/src/routes/Help.tsx)), verbatim:

> If you need to hide this app at once, tap "Quick exit" at the top of any screen, or press Escape three times quickly on a keyboard. It opens a weather search straight away and clears what this app was showing. It doesn't ask first, and it doesn't sign you out.
>
> It can't remove the pages you visited before it from your browser's history. Someone pressing Back may still see that AnxioCare was open, and if you were signed in, your account is still signed in on this phone.
>
> To leave no trace, use a private or incognito window, which your browser forgets when you close it. To clear it afterwards, delete your browsing history in your browser's settings, and sign out in Settings here.

**Mood log.** The scale is Very low, Low, Okay, Good, Very good. Home asks "How are you today?". The chart and every mention say "Your daily mood log, not a test score". It's never on the GAD-7 axis. There are no streaks or reminders.

**Doctor report.** The footer reads: "Self-reported. A screening, not a diagnosis.", then `GAD7_ATTRIBUTION`, then "Made on <date>, with AnxioCare." The mood section reads: "The person's own rating of each day, from 1 (Very low) to 5 (Very good). Not a test score, and not part of the GAD-7." Private writing (mood notes, plan, journal) is off by default.

## Hazard log

Likelihood and severity are unreviewed estimates. **The reviewer should change them.**

| ID | Hazard | Possible harm | Control | Evidence | Residual, and who holds it |
| --- | --- | --- | --- | --- | --- |
| H1 | Person at risk gets a low score and is reassured | Delayed care, self-harm | Statement on every result. Get help on every screen. | `safety.spec.ts:22,30,47`, `guest.spec.ts:14` | **Med-High.** Inherent to the instrument. Clinician. |
| H2 | Severe score, nobody follows up | Person is left alone | Prominent support. One-tap call. Tele-MANAS named. | `guest.spec.ts:14` | **High, by design.** The app can't act. Clinician, owner. |
| H3 | Self-harm content in the journal goes unseen | No response | Terms say nobody monitors. Help always one tap away. | Terms copy | **High, by design.** Clinician. |
| H4 | Wrong or dead helpline number | Help fails at the worst moment | Quarterly calls. Date displayed. Several lines listed. | Procedure above | Med. Owner. |
| H5 | Helpline closed at the hour of need (iCALL) | Unanswered call | Hours shown. Two 24x7 lines listed first. | `helplines.ts` | Med. Hours unresolved. Owner. |
| H6 | App unavailable or slow when needed | No help reached | Offline Help. Static call links. Service worker. | `resilience.spec.ts:4,40,83` | Med. A first visit needs network. Owner. |
| H7 | Reworded instrument invalidates the screening | Misleading result | One source file. Tests. This document. | `packages/shared/src/gad7.test.ts` | Low. Adaptation for review. Clinician. |
| H8 | Score wrong because of a bug or client tampering | Misleading result | Server computes. Shared code tested. | `data.test.ts:138,147`, `gad7.test.ts` | Low. Owner. |
| H9 | Result read as a diagnosis | False reassurance, or fear | "Screening" wording throughout, and on the print view. | `guest.spec.ts:14` | Med. Clinician. |
| H10 | Breathing exercise causes dizziness or panic | Physical distress, a fall | Warnings. Stop button. Gentle default. | `Breathe.tsx`, `resilience.spec.ts:73` | Low-Med. Clinician. |
| H11 | Lock screen or inbox reveals use of the app | Stigma, family harm, coercion | Neutral mail. Production refuses a revealing sender. | `hardening.test.ts:530,537` | Med. See [threat model](THREAT-MODEL.md). Owner. |
| H12 | Shared phone exposes results | Same, and possible abuse | Sign-out. Session list. No storage after sign-out. | `authorisation.spec.ts:43,90` | **Med-High. See R1 in the [threat model](THREAT-MODEL.md#r1-shared-phone-access-to-an-unlocked-session).** Owner. |
| H13 | Someone is locked out of sign-in by an attacker | Loses history, and possibly a coping tool | Help and tools need no sign-in. Manual relief. | `hardening.test.ts:179,222` | Med. See R2. Owner. |
| H14 | A child uses the app | Wrong-age tool, data duties | 18+ on account creation. Terms. Guest mode has no age question. | `data.test.ts:83` | Med. Lawyer, clinician. |
| H15 | Non-English reader misunderstands | Wrong answers, missed help | None. English only. Call button is a clear icon. | None | **Med-High for India.** Owner, clinician. |
| H16 | Frequent retakes cause fixation | Worse anxiety | 14-day suggestion. No streak. No nudge or notification. | `Result.tsx` | Low-Med. Clinician. |
| H17 | Trend chart read as progress or failure | Discouragement | No celebration. Plain text. Table alternative. | `TrendChart.test.tsx` | Low-Med. Clinician. |
| H18 | Crisis wording itself causes distress | Distress | Calm wording. Shown only as needed. | Unreviewed | Unknown. Clinician. |
| H19 | Thought record or check-in lost | Lost trust and work | Failures keep text in memory, and say so. Export. | `failures.spec.ts:38,105,211` | Low. Owner. |
| H20 | Someone nearby sees the app | Coercion, harm, stigma | Quick exit on every screen and in every sheet, and Escape three times. Help says plainly what it can't do | `quick-exit.spec.ts`, `quick-exit.test.ts` | **Med.** Earlier history entries stay, and the account stays signed in. Owner, clinician. |
| H21 | Safety plan unavailable in a crisis | Help not reached | Opens offline after one load. Helplines always shown in step 5 | `safety-plan.spec.ts` | Med. Safari can evict storage after 7 days. A first load needs a network. Owner. |
| H22 | Safety plan wording or examples read as advice, or distress | Harm | Optional, gentle wording, examples as hints only | Unreviewed | Unknown. Clinician. |
| H23 | Mood log read as a measure, or used to self-judge | Discouragement | "Not a test score". Own axis. No streaks or "missed" | `MoodChart.test.tsx`, `MoodCard.test.tsx` | Low-Med. Clinician. |
| H24 | A doctor reads the report as a diagnosis | Wrong care | Footer and attribution on every report. Self-reported | `Report.test.tsx` | Low-Med. Clinician. |

## Clinician review sign-off

To be completed by a qualified mental health professional registered in India. Give the reviewer this document, access to the deployed app or a test build, and `packages/shared/src/gad7.ts`.

**Reviewer**

- Name:
- Qualification and registration number:
- Organisation:
- Date:
- App version or commit reviewed:

For each item, mark Accepted, Accepted with changes, or Not accepted, and add comments.

| # | Item | Result | Comments |
| --- | --- | --- | --- |
| 1 | Items and options match the official GAD-7, character by character | | |
| 2 | Stem adaptation ("following problem") acceptable, and how it should be disclosed | | |
| 3 | Difficulty item without the lead-in, asked only when a symptom was reported | | |
| 4 | One item per screen, in English, for an adult Indian audience | | |
| 5 | Cut points and bands. Referral at 10. | | |
| 6 | Severity meanings in `SEVERITY_BANDS` | | |
| 7 | "Screening, not diagnosis" wording on the Result and print views | | |
| 8 | Severe result: support section, wording | | |
| 9 | Self-harm guidance, including the means-safety sentence | | |
| 10 | Statement on results with lower scores, and that the app does not assess risk | | |
| 11 | Helplines chosen, and their order | | |
| 12 | Breathing patterns and warnings, including 4-7-8 | | |
| 13 | 5-4-3-2-1 grounding and sounds | | |
| 14 | Thought record prompts in the journal | | |
| 15 | Next check-in at 14 days | | |
| 16 | Trends display | | |
| 17 | Hazard log: ratings changed, any hazards added | | |
| 18 | Anything else that could cause harm | | |
| 19 | Safety plan: section titles, prompts and examples, as in [Safety plan wording](#safety-plan-wording) | | |
| 20 | Safety plan: guest, device-copy and offline lines, and the Stanley-Brown basis | | |
| 21 | "About quick exit" on Help | | |
| 22 | Mood log scale words, and "not a test score" | | |
| 23 | Doctor report: sections, defaults, footer, mood wording | | |

**Overall**

- [ ] Suitable for public launch as is
- [ ] Suitable once the changes listed are made
- [ ] Not suitable

Changes required:

Review again by (date, at most 12 months away):

Signed:

## Sources

- Spitzer RL, Kroenke K, Williams JBW, Löwe B. *Arch Intern Med.* 2006;166(10):1092-1097. Abstract findings seen through [a publication record](https://fis.uke.de/portal/en/publications/a-brief-measure-for-assessing-generalized-anxiety-disorder-the-gad7(9b25d45b-37be-49d4-9326-2de477298991)/export.html). The full paper was not read.
- [Instructions for Patient Health Questionnaire (PHQ) and GAD-7 Measures](https://manual.jointcommission.org/pub/BHCInstruments/RomInstr00054/instructions_PHQ.pdf), hosted by The Joint Commission. Read in full for scoring, the cut points, the difficulty item and reuse.
- [CamCOPS GAD-7 notes](https://camcops.readthedocs.io/en/latest/tasks/gad7.html), quoting phqscreeners.com on permission.
- Lower cut point: seen only in search-result summaries, without a paper read here. The reviewer will know the current literature.

**Could not confirm:** the official form's exact text. Neither the [PHQ Screeners](https://www.phqscreeners.com/) site nor a clean official PDF of the form could be read, so the plural "problems" and the "If you checked off any problems" lead-in rest on third-party copies, and the owner's research note for the former. That is why item 1 of the review asks for a character-by-character check.
