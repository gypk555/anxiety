# Relief tools

## Purpose

Give a person something calming to do right now, with no account, no network and no download.

The thought record is listed on the Tools screen too, but needs an account. See [journal](journal.md).

## User-facing behaviour

**`/tools`.** A link to each tool.

**`/tools/breathe`.** Choose a rhythm (slow exhale: in 4, out 6; box: 4-4-4-4; 4-7-8), a length (1, 3 or 5 minutes), and optionally a sound and vibration. "Begin" gives 3 seconds of "Settle in", then rings that grow and shrink, with the word and a seconds count, and under them a quiet "Breath 3" cycle counter in a polite live region. It is never a score, goal or streak. "Stop" is always there, and so is "Dizzy or short of breath? Stop and breathe normally." It ends with a neutral note. It always uses the dark "night" canvas. The manifest lists it as a home-screen shortcut.

**`/tools/ground`.** The 5-4-3-2-1 senses in five steps, with India-specific hints such as a pressure cooker. Tap once per thing. "Next sense" works whether or not all are ticked.

**`/tools/sounds`.** Monsoon rain, Sea at night, Ceiling fan, Tanpura, plus a volume slider. Sound stops when leaving the screen.

## How it works

**Breathing.** [breathing.ts](../../apps/web/src/lib/breathing.ts) is pure. `phaseAt(pattern, elapsedMs)` works out the phase from elapsed time only, so throttled timers can't desync the word from the rings. A 150 ms interval updates the screen. `cyclesForMinutes` rounds to whole cycles, so a session ends after a full exhale. The rings are CSS transitions on separate layers, for cheap phones. A screen wake lock is requested where the browser allows. Vibration is offered only where `navigator.vibrate` exists.

**Sound.** [sound.ts](../../apps/web/src/lib/sound.ts) synthesises everything with Web Audio: filtered noise for rain, sea and fan, and a periodic wave for the tanpura. It fades in and out. No audio files are involved, so nothing changes in the CSP. A sound ends when the person leaves the screen, or the screen is hidden, and the `AudioContext` is then closed. In a breathing session it comes back when the screen does. If the browser takes the audio away while the screen is showing, the label says so, and a tap plays it again.

**Grounding.** Local state only, in [Ground.tsx](../../apps/web/src/routes/Ground.tsx).

## Key files

- [apps/web/src/routes/Tools.tsx](../../apps/web/src/routes/Tools.tsx)
- [apps/web/src/routes/Breathe.tsx](../../apps/web/src/routes/Breathe.tsx)
- [apps/web/src/routes/Ground.tsx](../../apps/web/src/routes/Ground.tsx)
- [apps/web/src/routes/Sounds.tsx](../../apps/web/src/routes/Sounds.tsx)
- [apps/web/src/lib/breathing.ts](../../apps/web/src/lib/breathing.ts)
- [apps/web/src/lib/sound.ts](../../apps/web/src/lib/sound.ts)
- [apps/web/src/ui/Rings.tsx](../../apps/web/src/ui/Rings.tsx)

## Data and API used

None. No table, endpoint or storage. Sound volume and settings are in memory.

## Security/privacy notes

- These tools send nothing and record nothing. No session history exists, so there's nothing to gamify or leak.
- The breathing warning appears both before and during a session, and in the Terms.

## Edge cases and failure behaviour

| Situation | What happens |
| --- | --- |
| Offline | Works after one visit: the chunks are precached |
| Reduced motion | No scaling. Words and count still guide |
| Screen reader | `role="status"` announces each word. The visual text is hidden from it |
| Browser lacks Web Audio | `/tools/sounds` says so and disables the buttons |
| Wake lock refused | Ignored. The screen may dim |
| No `navigator.vibrate` (such as iOS Safari) | The option doesn't appear |
| Very short screen | The setup picture hides at 620px or less |

## Tests that cover it

- [apps/web/src/lib/misc.test.ts](../../apps/web/src/lib/misc.test.ts) (`breathing rhythm`)
- [apps/web/src/lib/sound.test.ts](../../apps/web/src/lib/sound.test.ts), [apps/web/src/routes/Sounds.test.tsx](../../apps/web/src/routes/Sounds.test.tsx), [apps/web/src/routes/Breathe.test.tsx](../../apps/web/src/routes/Breathe.test.tsx)
- [apps/web/e2e/resilience.spec.ts](../../apps/web/e2e/resilience.spec.ts) (offline, reduced motion)
- [apps/web/e2e/audit.spec.ts](../../apps/web/e2e/audit.spec.ts)
- [apps/web/e2e/live/a11y.spec.ts](../../apps/web/e2e/live/a11y.spec.ts)

## Known limits

- `sound.test.ts` and `Sounds.test.tsx` prove start, stop, hide and unmount close the context without errors, on a mocked Web Audio. **That's all they prove. Nobody has listened, and nothing checks the audio itself.**
- A person can't leave a sound playing with the screen locked, on purpose, because it couldn't be stopped from there.
- The breathing timer pauses while the screen is hidden, and the wake lock is asked for again on return. This hasn't been tried on a real phone.
- The tools carry no clinical review yet, and no claim of effect is made.
- English only.
