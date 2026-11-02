// Voice-provider registry — the "bring your own voice" layer.
//
// Product direction (Joshua, 2026-10-29): the final product either
// ships a selection of decent built-in voices, or lets users connect
// their chosen voice model/provider with their own key. This registry
// is what makes that a config choice instead of a rewrite: every
// provider implements the same interface as src/tts/grok.js —
//
//   synthesize({ text, voiceId, speed, language, apiKey, fetchImpl })
//     -> { audio: Buffer, contentType }
//   VOICES, DEFAULT_VOICE, PROVIDER_ID
//
// — and the pre-generation CLI (src/generate-audio.js) only ever talks
// to a provider through getTtsProvider(). Adding ElevenLabs, OpenAI,
// Azure, Polly, etc. later = one new file in this folder + one line
// below. A user's own cloned voice (e.g. a Grok custom voice id) is
// just another voiceId on whichever provider hosts it.

import * as grok from "./grok.js";

const PROVIDERS = {
  grok,
  // elevenlabs: (planned) highest-naturalness library voices + cloning
  // openai:     (planned) steerable delivery via instructions
  // azure:      (planned) SSML control, broad language coverage
  // polly:      (planned) cheap, reliable neural voices
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function getTtsProvider(id = "grok") {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(
      `Unknown TTS provider "${id}". Available: ${PROVIDER_IDS.join(", ")}. ` +
        "New providers implement the interface in src/tts/grok.js and register in src/tts/index.js."
    );
  }
  return provider;
}
