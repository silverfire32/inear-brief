// Grok (xAI) text-to-speech provider — Fix 2, first provider.
//
// Pre-generates cue audio: POST text to the xAI TTS endpoint and get an
// MP3 back. Used the night before a talk (or at plan time), never live
// mid-talk — the runner plays the finished files on schedule and falls
// back to system speech synthesis only if a file is missing.
//
// The API key is read from the XAI_API_KEY environment variable; the
// CLIs also load it from a gitignored .env file in the project root
// (see src/load-env.js). Never commit a key or put one in chat. Until the key exists,
// synthesize() throws a clear setup error and the rest of the pipeline
// (tests, manifest shape, runner) works against mocks.
//
// Interface shared with every TTS provider (see src/tts/index.js):
//   synthesize({ text, voiceId, speed, language, apiKey, fetchImpl })
//     -> { audio: Buffer, contentType: string }
//   VOICES: [{ id, description }] — the provider's built-in voices.
//
// Endpoint and parameters per xAI's Voice docs (docs.x.ai):
//   POST https://api.x.ai/v1/tts
//   { text, voice_id, language, speed, output_format: { type: "mp3" } }
// TTS pricing at time of writing: $15 per 1M characters — a full
// 12-cue plan (~300 chars) costs well under a cent.

export const PROVIDER_ID = "grok";
export const DEFAULT_VOICE = "eve";
export const API_KEY_ENV = "XAI_API_KEY";

export const VOICES = [
  { id: "eve", description: "Female voice (xAI default)" },
  { id: "ara", description: "Female voice" },
  { id: "rex", description: "Male voice" },
  { id: "sal", description: "Male voice" },
  { id: "leo", description: "Male voice" },
];

const ENDPOINT = "https://api.x.ai/v1/tts";
// xAI documents speed in the 0.7–1.5 range (1.0 = normal).
export const SPEED_MIN = 0.7;
export const SPEED_MAX = 1.5;

export async function synthesize({
  text,
  voiceId = DEFAULT_VOICE,
  speed = 0.92,
  language = "en",
  apiKey = process.env.XAI_API_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!text || typeof text !== "string") {
    throw new Error("synthesize: text is required.");
  }
  if (!VOICES.some((v) => v.id === voiceId)) {
    throw new Error(
      `synthesize: unknown Grok voice "${voiceId}". Built-in voices: ${VOICES.map((v) => v.id).join(", ")} ` +
        "(custom/cloned voice ids can be added to VOICES once created in the xAI console)."
    );
  }
  if (typeof speed !== "number" || speed < SPEED_MIN || speed > SPEED_MAX) {
    throw new Error(`synthesize: speed must be between ${SPEED_MIN} and ${SPEED_MAX} (got ${speed}).`);
  }
  if (!apiKey) {
    throw new Error(
      "XAI_API_KEY is not set. Set up the xAI API key first (secure entry; never in chat or git), " +
        "or keep using the system-TTS fallback in the runner."
    );
  }

  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language,
      speed,
      output_format: { type: "mp3" },
    }),
  });
  if (!res.ok) {
    const detail = typeof res.text === "function" ? await res.text().catch(() => "") : "";
    throw new Error(`Grok TTS request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) {
    throw new Error("Grok TTS returned empty audio.");
  }
  return { audio, contentType: res.headers?.get?.("content-type") || "audio/mpeg" };
}
