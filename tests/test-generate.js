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
// Freeform notes with speaker meta-discourse (hypnosis talk): a
// "I need to cover:" preamble and trailing stage directions must not
// become headings, cues, or anchors.
const metaTalk = `6 minute talk on hypnosis and pain

I need to cover:

what is hypnosis?
What (and where) is pain? Is it in the head? In the body?
Difference between chronic and acute pain
How does pain get regulated? Brain processes: amygdala, PTA cycle, gate theory
How do people deal with pain normally? Distraction, meds (with side effects), pleasure-seeking (extreme distraction/self-medication)
How hypnosis helps
I need to have a demo of glove anesthesia, maybe of making nose itches as a nocebo version (think Overdurf Training Trances book)
Hypnosis manages attention, soothes parasympathetic nervous system, lowers cortisol
Hypnotic paralysis brain study shows brain starts to send signal to lift arm, but then other part of brain interrupts and "steals" the signal. Pain control works similarly
Close with Q&A

Don't spend too much time on what is hypnosis: keep it brief
Take time on the demo and make sure to include convincers and deepeners`;
const metaPlan = generateCuePlan({ notesText: metaTalk, paceWpm: 130 });
const metaHeadings = metaPlan.sections.map((s) => s.heading);
assert.ok(metaHeadings.length >= 4, `topic lines should become their own sections (got ${metaHeadings.length})`);
assert.ok(
  metaHeadings[0].toLowerCase().includes("hypnosis"),
  `first section should be the hypnosis topic (got "${metaHeadings[0]}")`
);
for (const h of metaHeadings) {
  assert.ok(
    !/^(i need to cover|don't spend|take time)/i.test(h),
    `speaker meta-discourse must not be a heading (got "${h}")`
  );
}
const metaOpen = metaPlan.sections[0].cues.find((c) => c.type === "open");
assert.ok(
  metaOpen && /hypnosis/i.test(metaOpen.text) && !/need|cover/i.test(metaOpen.text),
  `opening cue should name the topic, not the preamble (got "${metaOpen?.text}")`
);
for (const s of metaPlan.sections) {
  for (const a of s.anchors) {
    assert.ok(
      !/to cover|convincers|deepeners|make sure|don't spend|take time/i.test(a),
      `anchor must be something the speaker actually says (got "${a}")`
    );
  }
}

// A "definite, maybe alternative" topic line is two demos: the "maybe"
// trailing off the glove-anesthesia line becomes its own tentative section.
const demoSections = metaPlan.sections.filter((s) => /demo|anesthesia|nose|itch|nocebo/i.test(`${s.heading} ${s.body}`));
assert.equal(demoSections.length, 2, `comma-maybe should split into definite + tentative demos (got ${demoSections.length}: ${demoSections.map((s) => s.heading).join(" | ")})`);
assert.ok(!/maybe/i.test(demoSections[0].heading), `definite demo heading must not trail off (got "${demoSections[0].heading}")`);
const maybeCue = demoSections[1].cues.find((c) => c.type === "content" || c.type === "open");
assert.ok(maybeCue && /^Maybe:/.test(maybeCue.text), `tentative demo cue should say Maybe first (got "${maybeCue?.text}")`);

assert.throws(() => generateCuePlan({ notesText: "   " }), /No notes text given/);

console.log("test-generate: OK —", plan.sections.length, "sections,", allCues.length, "cues, total", total, "s; free-form prose, bullet + numbered outlines, paste-blob all accepted");
