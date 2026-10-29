// Meta Model API provider — stub with the same interface as local.js.
//
// Fill in once the API key is set up (secure entry; the key lives in the
// META_MODEL_API_KEY environment variable and is never committed).
//
// What the live implementation should do:
//   1. POST the notes to the Meta Model API (see dev.meta.ai) with a
//      prompt that asks for the cue-plan JSON defined in
//      schema/cue-plan.schema.json: clean section splits from messy
//      notes, cues of at most ~6 words each, 2-3 distinctive anchor
//      phrases per section, and a flag on any section whose content is
//      too dense for its time slot.
//   2. Parse and validate the JSON against the schema before returning.
//   3. Fall back to the local provider on any API failure, so plan
//      generation never hard-fails the night before a talk.

export async function generateCuePlan({ notesText, paceWpm = 130 }) {
  const apiKey = process.env.META_MODEL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "META_MODEL_API_KEY is not set. Set up the Meta Model API key first, " +
        "or use the default local provider."
    );
  }
  // TODO(meta-api): build the request, call the API, validate, return plan.
  void notesText;
  void paceWpm;
  throw new Error("Meta Model API provider is not implemented yet (stub).");
}
