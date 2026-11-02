#!/usr/bin/env node
// Pre-generate cue audio for a cue plan (Fix 2).
//
// Reads a cue plan, synthesizes every cue to an MP3 with the chosen
// voice provider, and writes a manifest.json the runner consumes:
// cues play as recordings on schedule; any cue missing from the
// manifest falls back to system speech synthesis in the runner.
//
// Usage:
//   node src/generate-audio.js [--provider grok] [--voice eve]
//     [--speed 0.92] [--lang en] <cue-plan.json> <out-dir>
//
// The provider's API key comes from the environment (for Grok:
// XAI_API_KEY — set via secure entry, never committed). Generation is
// a night-before step; nothing here runs during a talk.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getTtsProvider } from "./tts/index.js";
import { loadEnv } from "./load-env.js";

loadEnv();

const args = process.argv.slice(2);
let providerId = "grok";
let voiceId;
let speed = 0.92;
let language = "en";
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--provider") providerId = args[(i += 1)];
  else if (args[i] === "--voice") voiceId = args[(i += 1)];
  else if (args[i] === "--speed") speed = parseFloat(args[(i += 1)]);
  else if (args[i] === "--lang") language = args[(i += 1)];
  else positional.push(args[i]);
}
const [input, outDir] = positional;
if (!input || !outDir) {
  console.error(
    "Usage: node src/generate-audio.js [--provider grok] [--voice eve] [--speed 0.92] [--lang en] <cue-plan.json> <out-dir>"
  );
  process.exit(1);
}

const provider = getTtsProvider(providerId);
if (provider.API_KEY_ENV && !process.env[provider.API_KEY_ENV]) {
  console.error(
    `${provider.API_KEY_ENV} is not set. Set up the ${providerId} API key first ` +
      "(secure entry; never in chat or git), then re-run."
  );
  process.exit(1);
}
const plan = JSON.parse(await readFile(input, "utf8"));
const cues = plan.sections
  .flatMap((s) => s.cues.map((c) => ({ ...c, sectionId: s.id })))
  .sort((a, b) => a.atSecond - b.atSecond);

await mkdir(outDir, { recursive: true });

const manifestCues = [];
for (let i = 0; i < cues.length; i += 1) {
  const cue = cues[i];
  const file = `cue-${String(i + 1).padStart(2, "0")}.mp3`;
  const { audio } = await provider.synthesize({
    text: cue.text,
    voiceId: voiceId ?? provider.DEFAULT_VOICE,
    speed,
    language,
  });
  await writeFile(join(outDir, file), audio);
  manifestCues.push({
    index: i + 1,
    sectionId: cue.sectionId,
    atSecond: cue.atSecond,
    type: cue.type,
    text: cue.text,
    file,
  });
  console.log(`[${i + 1}/${cues.length}] @${cue.atSecond}s "${cue.text}" -> ${file}`);
}

const manifest = {
  title: plan.title,
  provider: provider.PROVIDER_ID,
  voiceId: voiceId ?? provider.DEFAULT_VOICE,
  speed,
  language,
  cueCount: manifestCues.length,
  totalCharacters: manifestCues.reduce((n, c) => n + c.text.length, 0),
  cues: manifestCues,
};
await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Wrote ${manifestCues.length} cue files + manifest.json to ${outDir} ` +
    `(provider: ${manifest.provider}, voice: ${manifest.voiceId}, speed: ${speed}, ${manifest.totalCharacters} chars).`
);
