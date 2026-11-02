// Meta Model provider checks: request shape, key names, parsing,
// validation, and local fallback — all with mock fetch (no key, no
// network). The live API is only exercised with Joshua's real key.
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import {
  generateCuePlan,
  resolveApiKey,
  validateCuePlan,
  DEFAULT_MODEL,
} from "../src/providers/meta-model.js";

const notes = await readFile(new URL("../examples/sample-notes.md", import.meta.url), "utf8");

// Key resolution: Meta's name wins; the scaffold's old name is an alias.
assert.equal(resolveApiKey({ MODEL_API_KEY: "primary" }), "primary");
assert.equal(resolveApiKey({ META_MODEL_API_KEY: "alias" }), "alias");
assert.equal(resolveApiKey({ MODEL_API_KEY: "primary", META_MODEL_API_KEY: "alias" }), "primary");
assert.equal(resolveApiKey({}), "");

const validPlan = {
  title: "Why Virtual Worlds Need Real Lobbies",
  targetSeconds: 720,
  paceWpm: 130,
  sections: [
    {
      id: "s1",
      heading: "Opening — the empty world problem",
      startSecond: 0,
      durationSecond: 720,
      wordCount: 100,
      anchors: ["our first playtest and finding"],
      cues: [
        { atSecond: 0, type: "open", text: "Begin: empty world problem", optional: false },
        { atSecond: 600, type: "time", text: "Two minutes left", optional: false },
        { atSecond: 690, type: "close", text: "Thirty seconds — land it", optional: false },
      ],
    },
  ],
};
assert.equal(validateCuePlan(validPlan), validPlan);
assert.throws(() => validateCuePlan({ ...validPlan, sections: [] }), /sections missing/);
assert.throws(
  () => validateCuePlan({ ...validPlan, sections: [{ ...validPlan.sections[0], anchors: [] }] }),
  /no anchor phrases/
);

// Mock Meta endpoint: capture the request, reply with a plan.
let seen = null;
const mockFetch = async (url, opts) => {
  seen = { url, opts, body: JSON.parse(opts.body) };
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(validPlan) } }],
    }),
  };
};

const plan = await generateCuePlan({
  notesText: notes,
  paceWpm: 130,
  apiKey: "test-key-not-real",
  fetchImpl: mockFetch,
});
assert.equal(seen.url, "https://api.meta.ai/v1/chat/completions");
assert.equal(seen.opts.headers.Authorization, "Bearer test-key-not-real");
assert.equal(seen.body.model, DEFAULT_MODEL);
assert.equal(seen.body.response_format.type, "json_schema");
assert.equal(seen.body.response_format.json_schema.schema.title, "CuePlan");
assert.ok(seen.body.messages[1].content.includes("Why Virtual Worlds Need Real Lobbies"));
assert.equal(plan.generatedBy, "meta-model");
assert.equal(plan.title, validPlan.title);

// Fenced JSON in the reply still parses.
const fencedFetch = async () => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: "```json\n" + JSON.stringify(validPlan) + "\n```" } }],
  }),
});
const fenced = await generateCuePlan({ notesText: notes, apiKey: "k", fetchImpl: fencedFetch });
assert.equal(fenced.generatedBy, "meta-model");

// API failure and garbage output both fall back to the local provider
// (5 sections from the sample notes) instead of failing the run.
const failingFetch = async () => ({ ok: false, status: 500, text: async () => "boom", headers: { get: () => null } });
const fallback = await generateCuePlan({ notesText: notes, apiKey: "k", fetchImpl: failingFetch });
assert.equal(fallback.generatedBy, "local");
assert.equal(fallback.sections.length, 5);

const garbageFetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: "not json at all" } }] }),
});
const garbage = await generateCuePlan({ notesText: notes, apiKey: "k", fetchImpl: garbageFetch });
assert.equal(garbage.generatedBy, "local");

// Missing key is a hard, clearly named error (env cleared for this call).
await assert.rejects(
  () => generateCuePlan({ notesText: notes, apiKey: "", fetchImpl: mockFetch }),
  /MODEL_API_KEY is not set/
);

console.log("test-meta-model: OK — request shape, MODEL_API_KEY + alias, parsing, validation, local fallback");
