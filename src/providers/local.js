// Local stand-in provider: deterministic, no API key required.
//
// Splits markdown notes by "## " headings, estimates each section's
// duration from word count at the given pace, scales sections to fit the
// target talk length, and emits template cues plus keyword anchors.
// Parenthetical asides are treated as stage directions (not spoken), so
// they are excluded from word counts.
//
// Interface shared with every provider:
//   generateCuePlan({ notesText, paceWpm }) -> CuePlan (see schema/)

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for",
  "with", "is", "it", "we", "our", "you", "your", "this", "that", "was",
  "are", "be", "as", "at", "by", "from", "so", "if", "when", "what",
]);

function spokenWords(text) {
  const noAsides = text.replace(/\([^)]*\)/g, " ");
  return noAsides.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function sentences(text) {
  const noAsides = text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return noAsides.split(/(?<=[.!?])\s+/).filter(Boolean);
}

// Pick a short distinctive window around the longest content word of a
// sentence — a phrase the speaker is likely to actually say.
function anchorFrom(sentence) {
  const words = sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 4) return null;
  let best = -1;
  let bestLen = 0;
  words.forEach((w, i) => {
    if (!STOPWORDS.has(w) && w.length > bestLen) {
      best = i;
      bestLen = w.length;
    }
  });
  if (best < 0) return null;
  const start = Math.max(0, Math.min(best - 2, words.length - 5));
  return words.slice(start, start + 5).join(" ");
}

function shortCue(heading) {
  const cleaned = heading.replace(/^[^—–-]*[—–-]\s*/, "").trim() || heading;
  const words = cleaned.split(/\s+/).filter((w) => !STOPWORDS.has(w.toLowerCase()));
  return words.slice(0, 4).join(" ") || cleaned;
}

export function generateCuePlan({ notesText, paceWpm = 130 }) {
  const lines = notesText.split(/\r?\n/);
  let title = "Untitled talk";
  let targetSeconds = null;

  const titleMatch = notesText.match(/^#\s+(?:Talk:\s*)?(.+)$/m);
  if (titleMatch) title = titleMatch[1].trim();
  const targetMatch = notesText.match(/Target length:\s*(\d+)\s*minutes?/i);
  if (targetMatch) targetSeconds = parseInt(targetMatch[1], 10) * 60;

  const rawSections = [];
  let current = null;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      current = { heading: h[1].trim(), body: "" };
      rawSections.push(current);
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (rawSections.length === 0) {
    throw new Error("No sections found — expected at least one '## ' heading.");
  }

  const raw = rawSections.map((s) => {
    const words = spokenWords(s.body).length;
    return { ...s, wordCount: words, rawSeconds: (words / paceWpm) * 60 };
  });
  const rawTotal = raw.reduce((n, s) => n + s.rawSeconds, 0);
  if (!targetSeconds) targetSeconds = Math.round(rawTotal);
  const scale = rawTotal > 0 ? targetSeconds / rawTotal : 1;

  let cursor = 0;
  const sections = raw.map((s, i) => {
    const durationSecond = Math.round(s.rawSeconds * scale);
    const startSecond = cursor;
    cursor += durationSecond;
    const cueWords = shortCue(s.heading);
    const cues = [
      {
        atSecond: startSecond,
        type: i === 0 ? "open" : "content",
        text: i === 0 ? `Begin: ${cueWords}` : `Next: ${cueWords}`,
        optional: false,
      },
    ];
    if (durationSecond >= 45) {
      cues.push({
        atSecond: startSecond + Math.round(durationSecond * 0.8),
        type: "wrap",
        text: `Wrap up: ${cueWords}`,
        optional: true,
      });
    }
    const anchors = sentences(s.body).slice(0, 2).map(anchorFrom).filter(Boolean);
    return {
      id: `s${i + 1}`,
      heading: s.heading,
      startSecond,
      durationSecond,
      wordCount: s.wordCount,
      anchors,
      cues,
    };
  });

  // Global time warnings, attached to whichever section contains them.
  const warnings = [
    { at: targetSeconds - 120, text: "Two minutes left", type: "time" },
    { at: targetSeconds - 30, text: "Thirty seconds — land it", type: "close" },
  ];
  for (const w of warnings) {
    if (w.at <= 0) continue;
    const host =
      sections.find((s) => w.at >= s.startSecond && w.at < s.startSecond + s.durationSecond) ||
      sections[sections.length - 1];
    host.cues.push({ atSecond: w.at, type: w.type, text: w.text, optional: false });
  }
  for (const s of sections) s.cues.sort((a, b) => a.atSecond - b.atSecond);

  return { title, targetSeconds, paceWpm, generatedBy: "local", sections };
}
