#!/usr/bin/env node
// Generate a cue plan from markdown notes.
//
// Usage:
//   node src/generate.js [--provider local|meta-model] [--pace 130] <notes.md> <out.json>
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
let provider = "local";
let pace = 130;
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--provider") provider = args[(i += 1)];
  else if (args[i] === "--pace") pace = parseInt(args[(i += 1)], 10);
  else positional.push(args[i]);
}
const [input, output] = positional;
if (!input || !output) {
  console.error("Usage: node src/generate.js [--provider local|meta-model] [--pace 130] <notes.md> <out.json>");
  process.exit(1);
}

const notesText = await readFile(input, "utf8");
const mod =
  provider === "meta-model"
    ? await import("./providers/meta-model.js")
    : await import("./providers/local.js");
const plan = await mod.generateCuePlan({ notesText, paceWpm: pace });

await writeFile(output, JSON.stringify(plan, null, 2) + "\n");
const cueCount = plan.sections.reduce((n, s) => n + s.cues.length, 0);
console.log(
  `"${plan.title}" — ${plan.sections.length} sections, ${cueCount} cues, ` +
    `target ${Math.round(plan.targetSeconds / 60)} min at ${plan.paceWpm} wpm ` +
    `(provider: ${plan.generatedBy}). Wrote ${output}`
);
