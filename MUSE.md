# Project briefing — In-Ear Brief (for Muse / any coding agent in this repo)

Read this, README.md, and PLAN.md before changing anything. This file is
the shared state between Joshua (the human, product owner) and the
agents who work on this project with him.

## What this is

A Meta AI hackathon project: an **in-ear brief generator**. It reads a
speaker's notes before a lecture or talk and generates short timing and
content cues, delivered in-ear (Bluetooth hearing aid / earbuds / Meta
Glasses), so the speaker stays on track without looking down at notes.
Deliverable for the hackathon: a working web demo + a 3-minute demo
video. Native iOS/Android is post-hackathon scope.

## Architecture (settled — do not re-litigate)

- **Meta Model API is the app's core**: notes → cue-plan generation and
  analysis. `src/providers/meta-model.js` calls Muse Spark at
  `https://api.meta.ai/v1/chat/completions` with structured JSON output
  against `schema/cue-plan.schema.json`, validates the result, and falls
  back to the local provider on any failure.
- **Grok (xAI) is voice only**: `src/tts/grok.js` pre-generates cue audio
  (one MP3 per cue) before the talk. It never generates or analyzes plans.
- **Local provider** (`src/providers/local.js`): deterministic offline
  generator. Used for tests, as the Meta fallback, and in the web page's
  paste box. Keep it working and key-free.
- Two separate API keys, both in the gitignored root `.env`:
  `MODEL_API_KEY` (Meta's own name for its key; `META_MODEL_API_KEY` is
  an accepted alias) and `XAI_API_KEY` (Grok). Neither key works on the
  other service.

## Product rules (from Joshua — these override convenience)

1. **Input is any text.** Requiring structured markdown is a product
   failure. Users paste free-form prose or upload an outline (bullets /
   numbered lists, few verbatim lines) into a field. Formatting is
   inferred, never demanded. The local parser, the CLI, the web paste
   box, and the Meta prompt all honor this contract.
2. **Cues are short** — a few words, understandable in one ear, mid-talk,
   by a user with hearing impairment. Hearing aid is the primary audio
   endpoint (tested clearer than Meta Glasses). Grok voice default:
   Eve at speed 0.92 — chosen because Joshua can understand Grok voices.
3. **Never print, log, or commit API keys.** `.env` stays gitignored.
   If a command would echo a key, stop and say so instead.

## Current state (2026-11-02)

- Implemented and tested: local generator (any-format input), Meta
  provider (mock-tested end to end), Grok TTS provider (mock-tested),
  anchor-phrase matcher prototype, web runner with paste box and
  audio-first playback with speech-synthesis fallback.
- `npm test` runs five suites and must stay green.
- **Not yet verified**: the live Meta call with Joshua's real key
  (`node src/generate.js --provider meta-model <notes> <out.json>`
  should end with `(provider: meta-model)`). This is the next step.
- **Not yet done**: no Grok audio generated (needs `XAI_API_KEY` +
  `node src/generate-audio.js examples/sample-cue-plan.json examples/audio`);
  live microphone anchor tracking (the web runner's tracking panel is a
  simulation); other TTS providers beyond the registry stub.

## Working agreements

- Run `npm test` after every change; do not commit on red.
- Small, focused commits with descriptive messages.
- Plans carry provenance: `generatedBy` (which provider) and
  `targetSource` (where the talk length came from: override / notes /
  estimated / default). Preserve both fields.
- If a design question is open, check PLAN.md's phase notes before
  inventing an answer — and ask Joshua rather than re-deciding settled
  items above.
