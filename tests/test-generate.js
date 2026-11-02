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

// --- Input contract: no markdown required (product rule, 2026-11-02) ---

// Free-form prose: no headings, length stated in a natural phrase.
const prose = `We opened the playtest and the world felt completely empty within
the first ninety seconds of logging in together. Nobody was around, the
plaza echoed, and testers quietly logged out without saying anything at
all to anyone in the group that evening.

The lobby fixes that first impression because it gives people a place
to gather before anything starts. It teaches the controls gently, it
proves that other players exist, and it gives friends a warm place to
meet up before the real activity begins for the whole group tonight.

So this is an 8 minute talk about building the doorway first and making
the first room of the experience feel alive for everyone who arrives.`;
const prosePlan = generateCuePlan({ notesText: prose, paceWpm: 130 });
assert.equal(prosePlan.sections.length, 3, "prose paragraphs should become sections");
assert.equal(prosePlan.targetSeconds, 480, "'8 minute talk' stated in prose should set the target");
assert.equal(prosePlan.targetSource, "notes");
for (const s of prosePlan.sections) assert.ok(s.anchors.length >= 1, "prose section needs an anchor");

// Bullet outline: title line, sparse bullets, "15-minute" phrasing —
// few verbatim lines, no prose paragraphs at all.
const outline = `Campfire Stories From Our Playtests
A 15-minute lightning talk

- players spawned alone in the first build
- churn went up sharply after day one
- nobody waited around for anyone else

- added a shared campfire space to gather around
- average session length doubled almost immediately
- strangers started talking without any prompting

- never spawn a player alone anywhere
- every space needs one shared object
- keep the path to the activity short`;
const outlinePlan = generateCuePlan({ notesText: outline, paceWpm: 130 });
assert.equal(outlinePlan.title, "Campfire Stories From Our Playtests");
assert.equal(outlinePlan.targetSeconds, 900, "'15-minute' phrasing should set the target");
assert.ok(outlinePlan.sections.length >= 2, "bullet groups should become sections");
for (const s of outlinePlan.sections) {
  assert.ok(s.anchors.length >= 1, `outline section ${s.id} needs an anchor`);
  assert.ok(s.cues.length >= 1, `outline section ${s.id} needs cues`);
}
const outlineTotal = outlinePlan.sections.reduce((n, s) => n + s.durationSecond, 0);
assert.ok(Math.abs(outlineTotal - 900) <= outlinePlan.sections.length * 6, "outline sections should fill the target");

// Numbered outline with no title and no stated length: sparse text
// falls back to the flagged 10-minute default, and --minutes wins.
const numbered = `1. welcome everyone and set the scene quickly
2. tell the empty lobby story from last spring
3. share the campfire numbers and the screenshots
4. close with the three design rules we follow`;
const numPlan = generateCuePlan({ notesText: numbered, paceWpm: 130 });
assert.equal(numPlan.targetSeconds, 600);
assert.equal(numPlan.targetSource, "default");
const numOverride = generateCuePlan({ notesText: numbered, paceWpm: 130, targetMinutes: 5 });
assert.equal(numOverride.targetSeconds, 300);
assert.equal(numOverride.targetSource, "override");

// One long pasted block (no blank lines at all) still chunks into sections.
const blob = Array.from({ length: 8 }, (_, i) =>
  `Point number ${i + 1} explains why the lobby matters for retention and how the campfire changed behaviour in our tests over several weeks of observation and careful measurement during play sessions`
).join(". ") + ".";
const blobPlan = generateCuePlan({ notesText: blob, paceWpm: 130 });
assert.ok(blobPlan.sections.length >= 2, "a single long block should chunk into sections");

// Empty input is a clear, human error — not a formatting complaint.
assert.throws(() => generateCuePlan({ notesText: "   " }), /No notes text given/);

console.log("test-generate: OK —", plan.sections.length, "sections,", allCues.length, "cues, total", total, "s; free-form prose, bullet + numbered outlines, paste-blob all accepted");
