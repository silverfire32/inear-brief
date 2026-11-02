// TTS provider checks: request shape, validation, registry — all with a
// mock fetch, so no API key and no network are needed.
import assert from "node:assert";
import { synthesize, VOICES, DEFAULT_VOICE } from "../src/tts/grok.js";
import { getTtsProvider, PROVIDER_IDS } from "../src/tts/index.js";

// Registry resolves the default provider and rejects unknown ones.
assert.deepEqual(PROVIDER_IDS, ["grok"]);
assert.equal(getTtsProvider().PROVIDER_ID, "grok");
assert.equal(getTtsProvider("grok").DEFAULT_VOICE, DEFAULT_VOICE);
assert.throws(() => getTtsProvider("nope"), /Unknown TTS provider/);
assert.ok(VOICES.some((v) => v.id === "eve") && VOICES.some((v) => v.id === "ara"), "expected Eve and Ara in the Grok voice list");

// A mock xAI endpoint: capture the request, return fake MP3 bytes.
let seen = null;
const fakeMp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03]).buffer; // "ID3" header bytes
const mockFetch = async (url, opts) => {
  seen = { url, opts, body: JSON.parse(opts.body) };
  return {
    ok: true,
    headers: { get: () => "audio/mpeg" },
    arrayBuffer: async () => fakeMp3,
  };
};

const out = await synthesize({
  text: "Two minutes left",
  voiceId: "ara",
  speed: 0.92,
  apiKey: "test-key-not-real",
  fetchImpl: mockFetch,
});
assert.equal(seen.url, "https://api.x.ai/v1/tts");
assert.equal(seen.opts.method, "POST");
assert.equal(seen.opts.headers.Authorization, "Bearer test-key-not-real");
assert.deepEqual(seen.body, {
  text: "Two minutes left",
  voice_id: "ara",
  language: "en",
  speed: 0.92,
  output_format: { type: "mp3" },
});
assert.ok(Buffer.isBuffer(out.audio) && out.audio.length === 4);
assert.equal(out.contentType, "audio/mpeg");

// Defaults: eve at 0.92.
await synthesize({ text: "Begin", apiKey: "k", fetchImpl: mockFetch });
assert.equal(seen.body.voice_id, "eve");
assert.equal(seen.body.speed, 0.92);

// Validation happens before any request.
await assert.rejects(() => synthesize({ text: "x", voiceId: "bogus", apiKey: "k", fetchImpl: mockFetch }), /unknown Grok voice/);
await assert.rejects(() => synthesize({ text: "x", speed: 2, apiKey: "k", fetchImpl: mockFetch }), /speed must be between/);
await assert.rejects(() => synthesize({ text: "x", apiKey: "", fetchImpl: mockFetch }), /XAI_API_KEY is not set/);

// HTTP failures surface with their status.
const failingFetch = async () => ({ ok: false, status: 401, text: async () => "unauthorized", headers: { get: () => null } });
await assert.rejects(() => synthesize({ text: "x", apiKey: "k", fetchImpl: failingFetch }), /401/);

console.log("test-tts: OK — Grok provider request shape, defaults, validation, registry");
