// Generator checks: structure, timing fit, cue sanity.
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { generateCuePlan } from "../src/providers/local.js";

const notes = await readFile(new URL("../examples/sample-notes.md", import.meta.url), "utf8");
const plan = generateCuePlan({ notesText: notes, paceWpm: 130 });

assert.equal(plan.sections.length, 5, "expected 5 sections from sample notes");
const total = plan.sections.reduce((n, s) => n + s.durationSecond, 0);
assert.ok(Math.abs(total - plan.targetSeconds) <= plan.sections.length, `sections should sum to target (got ${total} vs ${plan.targetSeconds})`);
assert.equal(plan.targetSeconds, 720, "sample notes specify a 12-minute target");

let prevEnd = 0;
for (const s of plan.sections) {
  assert.equal(s.startSecond, prevEnd, "sections must be contiguous");
  prevEnd += s.durationSecond;
  assert.ok(s.cues.length >= 1, `section ${s.id} needs at least one cue`);
  assert.ok(s.anchors.length >= 1, `section ${s.id} needs at least one anchor`);
  for (const c of s.cues) {
    assert.ok(c.text.split(/\s+/).length <= 8, `cue too long: "${c.text}"`);
    assert.ok(c.atSecond >= s.startSecond && c.atSecond < s.startSecond + s.durationSecond, `cue outside its section: ${c.text}`);
  }
}
const allCues = plan.sections.flatMap((s) => s.cues.map((c) => c.atSecond));
assert.deepEqual(allCues, [...allCues].sort((a, b) => a - b), "cues must be globally time-ordered");
const timed = plan.sections.flatMap((s) => s.cues);
assert.ok(timed.some((c) => c.type === "time" && c.atSecond === plan.targetSeconds - 120), "two-minute warning should exist at target - 120s");
assert.ok(timed.some((c) => c.type === "close" && c.atSecond === plan.targetSeconds - 30), "thirty-second closing cue should exist at target - 30s");

console.log("test-generate: OK —", plan.sections.length, "sections,", allCues.length, "cues, total", total, "s");
