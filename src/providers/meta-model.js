// Meta Model API provider — the app's core generator.
//
// This is the "inner workings" provider: it sends the speaker's notes
// to Meta's Muse Spark model and gets back a validated cue plan (the
// JSON in schema/cue-plan.schema.json). Voice generation is a separate
// layer (src/tts/) — Grok there never generates or analyzes plans.
//
// API shape (Meta Model API docs, dev.meta.ai):
//   POST https://api.meta.ai/v1/chat/completions   (OpenAI-compatible)
//   Authorization: Bearer <key>
//   Model: muse-spark-1.3 by default (override with META_MODEL_ID)
//   Structured output: response_format type "json_schema"
//
// Key name: Meta's own convention is MODEL_API_KEY. This provider reads
// MODEL_API_KEY first and also accepts META_MODEL_API_KEY (the name an
// earlier scaffold version used) as an alias, from the shell or from
// the gitignored root .env loaded by the CLIs (src/load-env.js).
//
// Failure policy: if the API call fails, returns unparseable output,
// or produces a plan that fails validation, the provider falls back to
// the local stand-in generator and says so on stderr — plan generation
// never hard-fails the night before a talk. A missing key is the one
// hard error, because then the user asked for Meta and Meta is not
// configured at all.
import { readFile } from "node:fs/promises";

export const PROVIDER_ID = "meta-model";
export const API_KEY_ENV = "MODEL_API_KEY";
export const API_KEY_ALIASES = ["META_MODEL_API_KEY"];
export const DEFAULT_BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_MODEL = "muse-spark-1.3";

const CUE_TYPES = new Set(["open", "content", "wrap", "time", "close"]);

export function resolveApiKey(env = process.env) {
  return env[API_KEY_ENV] || env[API_KEY_ALIASES[0]] || "";
}

// Structural validation for a model-produced plan. Deliberately checks
// the contract the runner and matcher depend on (not prose quality):
// sections with times and anchors, cues with known types and text.
export function validateCuePlan(plan) {
  const fail = (why) => {
    throw new Error(`Invalid cue plan from Meta Model API: ${why}`);
  };
  if (!plan || typeof plan !== "object") fail("top level is not an object");
  if (typeof plan.title !== "string" || !plan.title) fail("title missing");
  if (!(plan.targetSeconds > 0)) fail("targetSeconds must be positive");
  if (!Array.isArray(plan.sections) || plan.sections.length === 0) fail("sections missing");
  for (const s of plan.sections) {
    if (typeof s.id !== "string" || !s.id) fail("a section is missing its id");
    if (typeof s.heading !== "string" || !s.heading) fail(`section ${s.id} is missing its heading`);
    if (!(s.startSecond >= 0) || !(s.durationSecond > 0)) fail(`section ${s.id} has bad timing`);
    if (!Array.isArray(s.anchors) || s.anchors.length === 0) {
      fail(`section ${s.id} has no anchor phrases (the matcher needs at least one)`);
    }
    if (!Array.isArray(s.cues) || s.cues.length === 0) fail(`section ${s.id} has no cues`);
    for (const c of s.cues) {
      if (!(c.atSecond >= 0)) fail(`a cue in section ${s.id} has a bad atSecond`);
      if (!CUE_TYPES.has(c.type)) fail(`a cue in section ${s.id} has unknown type "${c.type}"`);
      if (typeof c.text !== "string" || !c.text) fail(`a cue in section ${s.id} has no text`);
    }
  }
  return plan;
}

function normalizePlan(plan, paceWpm, targetMinutes) {
  const sections = [...plan.sections]
    .sort((a, b) => a.startSecond - b.startSecond)
    .map((s) => ({
      ...s,
      wordCount: typeof s.wordCount === "number" ? s.wordCount : 0,
      cues: [...s.cues]
        .sort((a, b) => a.atSecond - b.atSecond)
        .map((c) => ({ optional: false, ...c })),
    }));
  return {
    ...plan,
    paceWpm,
    targetSource: plan.targetSource || (targetMinutes > 0 ? "override" : "notes"),
    generatedBy: PROVIDER_ID,
    sections,
  };
}

function extractContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || "").join("");
  }
  throw new Error("Meta Model API response had no message content.");
}

function parsePlanJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

async function loadSchema() {
  const raw = await readFile(new URL("../../schema/cue-plan.schema.json", import.meta.url), "utf8");
  return JSON.parse(raw);
}

export function buildRequestBody({ notesText, paceWpm, targetMinutes, model, schema }) {
  return {
    model,
    messages: [
      {
        role: "system",
        content:
          "You turn a speaker's notes into a timed cue plan for an in-ear prompting app. " +
          "Return only JSON matching the supplied cue-plan schema. Rules: treat speaker meta-discourse (a 'cover:'-style lead-in; 'don't spend', 'take time', 'make sure' instructions) as staging guidance, never as section headings, anchor phrases, or cue text; an 'X, maybe Y' line is two sections (definite X, tentative Y); when topics are listed line by line after such a lead-in, make each topic its own section headed by the topic itself; split the notes into clean " +
          "sections in order; estimate section durations at the given speaking pace so they sum to the " +
          "talk's target length; write cues of at most 6 words each (they are spoken in one ear while the " +
          "speaker is talking); give each section 2-3 distinctive anchor phrases — exact phrases the speaker " +
          "is likely to say near the start of that section; include a 'Two minutes left' time cue two minutes " +
          "before the end and a closing cue thirty seconds before the end; parenthetical asides in the notes " +
          "are stage directions, not spoken content.",
      },
      {
        role: "user",
        content:
          `Speaking pace: ${paceWpm} words per minute.` +
          (targetMinutes > 0
            ? ` Target talk length: ${targetMinutes} minutes (use this even if the notes say otherwise).`
            : " If the notes state a talk length, use it; otherwise estimate from the content.") +
          `\n\nSpeaker's notes (any format — prose, outline, bullets — is expected; ` +
          `do not require markdown):\n\n${notesText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "cue_plan", strict: false, schema },
    },
    temperature: 0.2,
    max_completion_tokens: 8000,
  };
}

export async function generateCuePlan({
  notesText,
  paceWpm = 130,
  targetMinutes,
  apiKey = resolveApiKey(),
  model = process.env.META_MODEL_ID || DEFAULT_MODEL,
  baseUrl = process.env.META_MODEL_API_BASE || DEFAULT_BASE_URL,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    throw new Error(
      "MODEL_API_KEY is not set. Put your Meta Model API key in the project-root .env as " +
        "MODEL_API_KEY=... (META_MODEL_API_KEY also works), or use the default local provider."
    );
  }

  try {
    const schema = await loadSchema();
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildRequestBody({ notesText, paceWpm, targetMinutes, model, schema })),
    });
    if (!res.ok) {
      const detail = typeof res.text === "function" ? await res.text().catch(() => "") : "";
      throw new Error(`Meta Model API request failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    const data = await res.json();
    const plan = validateCuePlan(parsePlanJson(extractContent(data)));
    return normalizePlan(plan, paceWpm, targetMinutes);
  } catch (err) {
    console.warn(`[meta-model] Falling back to the local provider: ${err.message}`);
    const local = await import("./local.js");
    return local.generateCuePlan({ notesText, paceWpm, targetMinutes });
  }
}
