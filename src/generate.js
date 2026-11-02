#!/usr/bin/env node
// Generate a cue plan from markdown notes.
//
// Usage:
//   node src/generate.js [--provider local|meta-model] [--pace 130]
//                        [--minutes 12] <notes-file> <out.json>
// The notes file can be ANY text: markdown, free-form prose, a bullet
// or numbered outline, whatever the speaker has. Use "-" as the notes
// file to paste text directly (end with Ctrl-D).
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { loadEnv } from "./load-env.js";

loadEnv();

const args = process.argv.slice(2);
let provider = "local";
let pace = 130;
let minutes;
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--provider") provider = args[(i += 1)];
  else if (args[i] === "--pace") pace = parseInt(args[(i += 1)], 10);
  else if (args[i] === "--minutes") minutes = parseFloat(args[(i += 1)]);
  else positional.push(args[i]);
}
const [input, output] = positional;
if (!input || !output) {
  console.error("Usage: node src/generate.js [--provider local|meta-model] [--pace 130] [--minutes 12] <notes-file|-> <out.json>");
  process.exit(1);
}

let plan;
try {
  const notesText = input === "-" ? readFileSync(0, "utf8") : await readFile(input, "utf8");
  const mod =
    provider === "meta-model"
      ? await import("./providers/meta-model.js")
      : await import("./providers/local.js");
  plan = await mod.generateCuePlan({ notesText, paceWpm: pace, targetMinutes: minutes });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

await writeFile(output, JSON.stringify(plan, null, 2) + "\n");
const cueCount = plan.sections.reduce((n, s) => n + s.cues.length, 0);
console.log(
  `"${plan.title}" — ${plan.sections.length} sections, ${cueCount} cues, ` +
    `target ${Math.round(plan.targetSeconds / 60)} min at ${plan.paceWpm} wpm ` +
    `(provider: ${plan.generatedBy}). Wrote ${output}`
);
if (plan.targetSource === "default") {
  console.log("Note: no talk length found in the notes — assumed 10 minutes. Pass --minutes N or state the length in the notes to change it.");
} else if (plan.targetSource === "estimated") {
  console.log("Note: talk length estimated from the notes' word count — pass --minutes N if you know it.");
}
