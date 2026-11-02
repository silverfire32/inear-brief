# Build plan

Hackathon scope: a working web demo + 3-minute demo video. Everything is
ordered so each phase is demoable on its own if time runs out.

## Phase 0 — Scaffold (done)

Repo layout, cue-plan schema, sample notes, local stand-in generator,
anchor matcher prototype, minimal web runner. Runs end-to-end with no
API key.

## Phase 1 — Generator, real model

- Set up the Meta Model API key (secure entry; never in chat or in git).
- Fill in `src/providers/meta-model.js`: prompt the model to return the
  cue-plan JSON for given notes + target talk length.
- Prompt goals: clean section splits from messy notes, cues of ≤ 6 words,
  2–3 distinctive anchor phrases per section (phrases the speaker will
  actually say near the transition), flag sections that are too dense
  for their time slot.
- Compare model output vs. local stand-in on the sample notes; tune.

## Phase 2 — Web runner + cue audio (Fix 2)

- Load a cue plan; big Start button (also unlocks audio on iOS Safari).
- Voice decision (2026-10-29, from iPhone tests): system speech
  synthesis is too artificial for the user to comprehend quickly
  through his hearing aid (Safari offered only default voices;
  Personal Voice is not visible to Safari; Meta Glasses audio was
  mushier than the hearing aid). Cues are therefore pre-generated
  recordings, with system TTS kept only as a per-cue fallback.
- `src/tts/` implements the voice-provider interface; Grok TTS is the
  first provider (voices eve/ara/rex/sal/leo, default speed 0.92).
  `node src/generate-audio.js <plan.json> <out-dir>` renders one MP3
  per cue + `manifest.json`. Runner is audio-first: it plays the
  manifest's files when present. **Blocked only on the xAI API key**
  (secure entry, at Joshua's computer) — pipeline and tests are done
  and pass against a mock endpoint with no key.
- Voice layer is provider-agnostic by design: final product offers a
  selection of decent voices, or users connect their chosen voice
  model/provider with their own key (registry in `src/tts/index.js`).
- On-screen progress: current section, elapsed vs. planned, next cue.
- Manual "advance" control for when a section ends early (cheap stand-in
  for tracking in the demo, and a permanent fallback in the real app).

## Phase 3 — Anchor tracking (stretch)

- `src/matcher.js` already matches recognized text against anchors and
  reports probable section + confidence.
- Wire it to speech recognition: desktop Chrome for the demo video
  (recognition is solid there); iPhone Safari recognition is the shakiest
  link — if it fights back, record the tracking segment on desktop.
- On anchor hit: re-anchor remaining cues. On lateness: drop `optional`
  cues, pull the two-minute warning in. On low confidence: do nothing.

## Phase 4 — Demo video (3 minutes)

1. (0:00) The problem: speaker glancing at notes, losing the thread,
   running long.
2. (0:30) Night before: paste notes, set talk length, get a cue plan —
   show sections and cues.
3. (1:15) The talk: earbud in, cues arriving — opening cue, wrap-up cue,
   two-minute warning. Speaker never looks down.
4. (2:15) The stretch: "speaker" skips ahead / runs long; an anchor match
   fires and the cues visibly re-time.
5. (2:45) Close: cue plan is portable — same plan runs the future native
   apps on iOS and Android.

## Post-hackathon

- Native iOS + Android runners (React Native or separate thin shells):
  background audio, on-device speech recognition (Apple Speech framework /
  Android SpeechRecognizer), Bluetooth routing incl. Meta Glasses as an
  audio endpoint.
- Pre-generated cue audio via TTS at plan time.
- Rehearsal mode: practice run that measures the speaker's real pace and
  recalibrates the plan.

## Open decisions

- Open-weights model (e.g. Glimmer-class) vs. Meta Model API for
  generation — only matters if API limits or offline generation become
  an issue; the provider switch makes this a config change, not a rewrite.
- Demo recording surface for the tracking segment: iPhone Safari vs.
  desktop Chrome (decide after a 10-minute recognition test on the phone).
