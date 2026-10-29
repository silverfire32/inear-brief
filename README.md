# In-Ear Brief Generator

A speaker's copilot you hear instead of read. The night before a lecture or
public talk, it turns the speaker's notes and comments into a **cue plan**:
short spoken prompts — content cues and timing cues — delivered in-ear
(Bluetooth earpiece or Meta Glasses) while the talk is running, so the speaker
stays on track, hits their timing, and remembers key points without ever
looking down at notes.

Built for the Meta AI hackathon. Demo target: a web app and a 3-minute demo
video. Post-hackathon target: native iOS + Android apps consuming the same
cue plans.

## How it works

1. **Generate (night before).** Notes go in; a model (Meta Model API, or the
   built-in local stand-in) restructures them into sections, estimates each
   section's duration from word count at a configurable speaking pace
   (~130 wpm default), and writes a small set of short cues per section:
   an opening cue, a wrap-up cue, plus global time warnings.
2. **Run (talk day).** A runner plays the cues on schedule into one earbud.
   Cues are pre-generated audio (or speech synthesis in the web prototype) —
   no network dependency mid-talk.
3. **Track (stretch goal).** The microphone periodically samples the
   speaker's own voice; an anchor-phrase matcher checks recognized words
   against distinctive phrases placed at section boundaries. When an anchor
   lands, the schedule re-anchors: running early shifts cues up, running
   late drops optional cues and pulls warnings in. Low confidence falls
   back to the plain time schedule — tracking adjusts the plan, it never
   hijacks it.

## The cue plan is the product

Everything speaks one format (`schema/cue-plan.schema.json`): sections with
target start/duration, cues with type and offset, anchor phrases per
section. The generator writes it, the runner reads it, the matcher adjusts
against it. New platforms (native apps later) are new shells around the
same format.

## Layout

- `src/generate.js` — notes → cue plan (provider-switched).
- `src/providers/local.js` — deterministic stand-in: heading split,
  word-count timing, template cues, keyword anchor extraction. Needs no
  API key; used for development and tests.
- `src/providers/meta-model.js` — Meta Model API provider stub. Same
  interface; reads `META_MODEL_API_KEY` from the environment. Fill in the
  request/response mapping once the key is set up.
- `src/matcher.js` — anchor-phrase matcher: given recognized speech text,
  reports the most likely current section and a confidence score.
- `web/` — the demo web app: loads a cue plan, runs it on schedule with
  speech-synthesis cues, shows progress. Open `web/index.html`.
- `examples/` — sample talk notes and the cue plan generated from them.
- `tests/` — runnable checks for the generator and matcher.

## Quick start (no API key needed)

```sh
npm test   # generator + matcher checks
node src/generate.js examples/sample-notes.md examples/sample-cue-plan.json
python3 -m http.server 8000   # then open http://localhost:8000/web/
```

With the Meta Model API:

```sh
export META_MODEL_API_KEY=...   # set via secure entry, never committed
node src/generate.js --provider meta-model examples/sample-notes.md out.json
```

## Design rules

- Cues are **short** — a few words each. A cue competes with the speaker's
  train of thought; it is a nudge, not a paragraph from the notes.
- **Pre-generate** cue audio before the talk wherever possible.
- Tracking is **advisory**: it re-anchors at section boundaries and degrades
  gracefully to the time schedule.
- One ear only. The speaker still needs to hear the room.
