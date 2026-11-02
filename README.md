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
- `src/providers/local.js` — deterministic stand-in: format-agnostic
  notes parsing (headings if present, else paragraphs / list blocks /
  chunked prose), word-count timing, template cues, keyword anchor
  extraction. Needs no API key; used for development, tests, the
  Meta provider's fallback, and the web page's paste-a-plan box.
- `src/providers/meta-model.js` — Meta Model API provider: the app's
  core generator. Calls Muse Spark (`https://api.meta.ai/v1` chat
  completions, structured JSON output), validates the returned plan
  against the schema contract, and falls back to the local provider on
  any API failure. Reads the key from `MODEL_API_KEY` (Meta's name;
  `META_MODEL_API_KEY` accepted as an alias).
- `src/matcher.js` — anchor-phrase matcher: given recognized speech text,
  reports the most likely current section and a confidence score.
- `src/tts/` — voice providers for pre-generated cue audio. `grok.js`
  (xAI Grok TTS) is the first implemented provider; `index.js` is the
  provider registry behind the bring-your-own-voice design (below).
- `src/generate-audio.js` — cue plan → one MP3 per cue + `manifest.json`
  (night-before step; the runner plays the files, never a live call).
- `web/` — the demo web app: loads a cue plan, runs it on schedule,
  playing pre-generated cue recordings when a manifest is present and
  falling back to speech synthesis for any cue without one. Open
  `web/index.html`.
- `examples/` — sample talk notes and the cue plan generated from them.
- `tests/` — runnable checks for the generator and matcher.

## Quick start (no API key needed)

```sh
npm test   # generator, matcher, TTS-shape, and .env-loader checks — no key needed
node src/generate.js examples/sample-notes.md examples/sample-cue-plan.json
python3 -m http.server 8000   # then open http://localhost:8000/web/
```

## Input: your notes, however you have them

**No format is required — this is a product rule, not a convenience.**
Real speakers do not write structured markdown. The generator accepts
any plain text:

- free-form prose (sections split at blank lines; one long paste is
  chunked automatically)
- a speech **outline**: bullet lists (`-`, `*`, `•`) or numbered
  lists, with few or no verbatim lines
- markdown with `#`/`##` headings, if that's what you happen to have
- text pasted straight into the web page's notes box, or into the CLI
  with `-` as the filename (end with Ctrl-D)

Talk length comes from, in order: the web form's length field or
`--minutes N`; a length stated anywhere in the notes ("a 15-minute
talk", "about 8 minutes", "half an hour"); an estimate from word
count; or — for sparse outlines — a clearly flagged 10-minute default
(`targetSource` in the plan says which). Section headings are derived
from the text when the notes don't have any.

## Where API keys go

Put a file named **`.env` in the project root** — the folder that
contains `package.json`, next to (not inside) `src/`. Copy
`.env.example` to `.env`. The app uses **two separate keys**:

```ini
# 1. The app's core — Meta Model API (notes -> cue plan / analysis).
#    MODEL_API_KEY is Meta's own name for this key.
MODEL_API_KEY=your-meta-key-here

# 2. Voice only — Grok/xAI TTS, for pre-generating cue audio.
#    A Meta key cannot call xAI, and an xAI key cannot call Meta.
XAI_API_KEY=your-xai-key-here
```

Set whichever you have; each feature needs its own. (The Meta key is
also read from `META_MODEL_API_KEY` as a backwards-compatible alias,
but `MODEL_API_KEY` is the name to use.) The two CLIs load the root
`.env` themselves (a value already set in your shell wins over the
file). `.env` is gitignored — never commit it or paste a key into
chat. `npm test` needs **neither** key: the generators are tested
against local providers and mock endpoints with fake keys.

With the Meta Model API (live plan generation):

```sh
# either set MODEL_API_KEY in the root .env (above), or:
export MODEL_API_KEY=...
node src/generate.js --provider meta-model examples/sample-notes.md out.json
# optional: META_MODEL_ID overrides the default model (muse-spark-1.3)
```

Pre-generate cue audio (natural voice, Fix 2):

```sh
# either set XAI_API_KEY in the root .env (above), or:
export XAI_API_KEY=...
node src/generate-audio.js examples/sample-cue-plan.json examples/audio
# options: --provider grok --voice eve|ara|rex|sal|leo --speed 0.92 --lang en
```

## Voice design

Live system TTS tested too artificial for the primary user (hearing
impairment; hearing aid is the clear endpoint, Meta Glasses mushier),
so cues are **pre-generated recordings**, rendered when the plan is
made — the same provider can stream live later if the tracking stretch
goal ever needs an unplanned cue, but nothing network-dependent runs
during a talk. Grok TTS is the first provider wired in (chosen
2026-10-29: its voices are ones the user already understands well;
~$15/1M chars, so a whole plan costs well under a cent).

Final-product direction: a selection of decent built-in voices **or**
letting users connect their chosen voice model. Every TTS provider
implements one interface (`src/tts/grok.js`) and registers in
`src/tts/index.js`, and a user's own cloned voice is just another
`voiceId` — so adding ElevenLabs / OpenAI / Azure / Polly later, or a
user bringing their own key and voice, is config, not a rewrite.

## Design rules

- Cues are **short** — a few words each. A cue competes with the speaker's
  train of thought; it is a nudge, not a paragraph from the notes.
- **Pre-generate** cue audio before the talk wherever possible.
- Tracking is **advisory**: it re-anchors at section boundaries and degrades
  gracefully to the time schedule.
- One ear only. The speaker still needs to hear the room.
