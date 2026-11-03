// Matcher checks: locate the speaker from anchor phrases in a
// simulated transcript; position must advance monotonically and survive
// recognition noise (dropped/substituted words).
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { generateCuePlan } from "../src/providers/local.js";
import { createMatcher } from "../src/matcher.js";

const notes = await readFile(new URL("../examples/sample-notes.md", import.meta.url), "utf8");
const plan = generateCuePlan({ notesText: notes, paceWpm: 130 });
const matcher = createMatcher(plan);

// Nothing heard yet.
assert.equal(matcher.locate().sectionIndex, -1);

// Speaker reaches section 1: feed its anchor with filler around it.
const a1 = plan.sections[0].anchors[0];
let loc = matcher.observe(`so welcome everyone, ${a1}, and thanks for being here`);
assert.equal(loc.sectionIndex, 0, `expected section 0, got ${loc.sectionIndex}`);
assert.ok(loc.confidence >= 0.7);

// Speaker moves to section 3 but recognition garbles one anchor word.
const a3 = plan.sections[2].anchors[0].split(" ");
a3.splice(1, 1, "uh"); // one word lost to noise
loc = matcher.observe(`moving on now — ${a3.join(" ")} — as we saw`);
assert.equal(loc.sectionIndex, 2, `expected section 2, got ${loc.sectionIndex}`);

// Stray repeat of an early anchor must not move position backwards.
loc = matcher.observe(a1);
assert.equal(loc.sectionIndex, 2, "position must never move backwards");

// Fuzzy matching: paraphrase and morphology must match, not just exact
// words — the speaker never memorizes the anchors.
const fuzzyPlan = {
  sections: [
    { id: "s1", anchors: ["what is hypnosis"] },
    { id: "s2", anchors: ["demo glove anesthesia"] },
    { id: "s3", anchors: ["nose itch nocebo"] },
  ],
};
const fuzzy = createMatcher(fuzzyPlan);
loc = fuzzy.observe("now i'm going to demonstrate a glove anesthesia technique");
assert.equal(loc.sectionIndex, 1, `paraphrase should locate section 1, got ${loc.sectionIndex}`);
assert.ok(loc.confidence >= 0.7);
loc = fuzzy.observe("your nose itches from the nocebo effect");
assert.equal(loc.sectionIndex, 2, `plural form should locate section 2, got ${loc.sectionIndex}`);

// Unrelated speech must not move position.
loc = fuzzy.observe("let's talk about parking regulations downtown");
assert.equal(loc.sectionIndex, 2, "unrelated speech must not move position");

console.log("test-matcher: OK — anchors located sections 0 and 2, monotonic, noise-tolerant, fuzzy");
