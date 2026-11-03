// Local stand-in provider: deterministic, no API key required.
//
// INPUT CONTRACT (product rule, set 2026-11-02): the input is the
// speaker's notes HOWEVER THEY HAVE THEM. Structured markdown is one
// accepted shape, never a requirement. This parser accepts:
//   - markdown with #, ## headings (the original sample format)
//   - free-form prose: sections are split at blank lines, and a single
//     long block is chunked by word count
//   - outlines: bullet lists (-, *, •) and numbered lists (1. / 1))
//     with few or no verbatim lines — each list block is a section
//   - pasted text with no title and no stated length at all
// Talk length is taken, in order, from: an explicit targetMinutes
// argument (CLI --minutes / the web form), a duration stated anywhere
// in the text ("Target length: 12 minutes", "a 15-minute talk",
// "about 8 minutes", "half an hour"), an estimate from the notes' word
// count at the speaking pace, or — for sparse outlines where that
// estimate is meaningless — a 10-minute default the plan flags with
// targetSource: "default" so the UI can say it assumed a length.
// Headings for heading-less sections are derived from their first
// words. Parenthetical asides are stage directions (not spoken), so
// they are excluded from word counts.
//
// Interface shared with every provider:
//   generateCuePlan({ notesText, paceWpm, targetMinutes }) -> CuePlan

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for",
  "with", "is", "it", "we", "our", "you", "your", "this", "that", "was",
  "are", "be", "as", "at", "by", "from", "so", "if", "when", "what",
  "between",
]);

const DEFAULT_TARGET_SECONDS = 600; // 10 min, for sparse outlines
const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s+/;

// Speaker meta-discourse (staging notes to self, not talk content): a
// lead-in line promising topics ("I need to cover:") and instruction-only
// blocks ("Don't spend…", "Take time…", "Make sure…"). Lead-ins flag the
// next block as a topic list; instructions are pacing notes and never
// become sections, headings, cues, or anchors.
const LEAD_IN_LINE_RE = /^\s*(i (need|want) to (cover|discuss|talk about|go over)|let'?s (cover|go over))\s*:?\s*$/i;
const DIRECTIVE_BLOCK_RE = /don'?t spend|take time on|make sure to|keep it brief|spend (too much|more|less) time/i;
const META_ANCHOR_RE = /(^|\b)(to cover|i need|we need|convincers|deepeners|make sure|don'?t spend|take time|keep it brief)\b/i;

function stripMetaPrefix(text) {
  return text
    .replace(/^\s*(i|we)\s+(need|want)\s+to\s+(have|cover|discuss|talk\s+about|go\s+over)\b\s*:?\s*/i, "")
    .replace(/^\s*let'?s\s+(cover|go\s+over)\b\s*:?\s*/i, "")
    .trim();
}

function stripMetaLines(body) {
  const kept = body.split(/\r?\n/).filter((l) => !LEAD_IN_LINE_RE.test(l));
  return kept.join("\n").trim();
}

// A topic line offering an alternative ("X, maybe Y") is two demos to
// run: one definite, one tentative. Tentative sections get Maybe-prefixed
// cues and an optional opening cue so the speaker hears the optionality.
function splitAlternatives(line) {
  const m = line.match(/^(.*?)(?:,|;)\s*maybe\s+(.*)$/i);
  if (m && spokenWords(m[1]).length >= 3 && spokenWords(m[2]).length >= 3) {
    return [
      { body: m[1].trim(), maybe: false },
      { body: m[2].replace(/^(of|about|on)\s+/i, "").trim(), maybe: true },
    ];
  }
  return [{ body: line, maybe: false }];
}

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
  const window = words.slice(start, start + 5);
  while (window.length > 2 && STOPWORDS.has(window[0])) window.shift();
  while (window.length > 2 && STOPWORDS.has(window[window.length - 1])) window.pop();
  return window.join(" ");
}

// Anchors for a section body: from its first sentences when possible.
// Sparse outline lines are often too short for anchorFrom, so fall back
// to a plain word window over the whole body — every section with a
// handful of words still gets at least one anchor for the matcher.
function anchorsFor(body) {
  const cleanedBody = stripMetaLines(body);
  const found = sentences(cleanedBody).slice(0, 2).map((s) => anchorFrom(stripMetaPrefix(s) || s)).filter(Boolean).filter((a) => !META_ANCHOR_RE.test(a));
  if (found.length > 0) return found;
  const words = cleanedBody
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= 3 ? [words.slice(0, 5).join(" ")] : [];
}

function shortCue(heading) {
  heading = stripMetaPrefix(heading) || heading;
  const question = heading.trim().match(/^.{1,80}\?\s*$/);
  if (question && heading.trim().split(/\s+/).length <= 8) {
    return heading.trim().replace(/^([a-z])/, (c) => c.toUpperCase());
  }
  const cleaned = heading.replace(/^[^—–-]*[—–-]\s*/, "").trim() || heading;
  const words = cleaned.split(/\s+/).filter((w) => !STOPWORDS.has(w.toLowerCase()));
  return words.slice(0, 4).join(" ") || cleaned;
}

// A talk length stated anywhere in the notes, in human phrasings.
function statedTargetSeconds(text) {
  const patterns = [
    /target[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i,
    /(\d+(?:\.\d+)?)\s*[-–]\s*(?:minutes?|mins?)\b/i, // "a 15-minute talk"
    /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i,
    /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i,
  ];
  for (const [i, re] of patterns.entries()) {
    const m = text.match(re);
    if (m) return Math.round(parseFloat(m[1]) * (i === 3 ? 3600 : 60));
  }
  if (/\bhalf (?:an )?hour\b/i.test(text)) return 1800;
  if (/\bquarter (?:of an )?hour\b/i.test(text)) return 900;
  return null;
}

// Heading for a section that has none: its first few words.
function derivedHeading(body) {
  const firstRaw = sentences(body)[0] || body.replace(/\s+/g, " ").trim();
  const first = stripMetaPrefix(firstRaw) || firstRaw;
  const words = first.replace(/[.,;:]+$/, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 6).join(" ") || "Section";
}

function splitIntoSections(text) {
  const lines = text.split(/\r?\n/);

  // Shape 1: markdown headings (#, ##, ...) — the title line, if it was
  // a # heading, has already been removed by the caller.
  if (lines.some((l) => /^#{1,6}\s+/.test(l))) {
    const sections = [];
    let current = null;
    for (const line of lines) {
      const h = line.match(/^#{1,6}\s+(.+)$/);
      if (h) {
        current = { heading: h[1].trim(), body: "" };
        sections.push(current);
      } else if (current) {
        current.body += line + "\n";
      }
    }
    return sections.filter((s) => spokenWords(s.body).length > 0 || s.heading);
  }

  // Shape 2: blocks separated by blank lines — prose paragraphs and
  // list blocks (outlines) alike.
  const rawBlocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  // Drop speaker meta-discourse blocks: a lead-in-only block flags the
  // next block as a topic list; instruction-only blocks are pacing notes.
  let topicListNext = false;
  const blocks = [];
  const topicListBlocks = new Set();
  for (const b of rawBlocks) {
    const blines = b.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const kept = blines.filter((l) => !LEAD_IN_LINE_RE.test(l));
    if (kept.length < blines.length) topicListNext = true;
    const rest = kept.join("\n").trim();
    if (!rest) continue;
    const isDirective = DIRECTIVE_BLOCK_RE.test(rest) && spokenWords(rest).length <= 40 && !rest.includes("?");
    if (topicListNext && !isDirective) topicListBlocks.add(blocks.length);
    topicListNext = false;
    if (isDirective) continue;
    blocks.push(rest);
  }
  let sections = blocks.map((block, bi) => {
    const blockLines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const listLines = blockLines.filter((l) => LIST_LINE.test(l));
    if (listLines.length >= Math.max(1, blockLines.length - 1)) {
      // Outline block: items become the body, first item the heading.
      const items = listLines.map((l) => l.replace(LIST_LINE, "").trim()).filter(Boolean);
      return { heading: derivedHeading(items[0] || ""), body: items.join(". ") + ".", kind: "list" };
    }
    const body = blockLines.join(" ");
    if (topicListBlocks.has(bi) && blockLines.length >= 2) {
      return { heading: "", body, kind: "topics", lines: blockLines };
    }
    return { heading: derivedHeading(body), body, kind: "prose" };
  });

  // One long pasted block: chunk it by sentences into ~90-word sections.
  if (sections.length === 1 && sections[0].kind !== "topics" && spokenWords(sections[0].body).length > 140) {
    const chunks = [];
    let chunk = [];
    let chunkWords = 0;
    for (const s of sentences(sections[0].body)) {
      chunk.push(s);
      chunkWords += spokenWords(s).length;
      if (chunkWords >= 90) {
        chunks.push(chunk.join(" "));
        chunk = [];
        chunkWords = 0;
      }
    }
    if (chunk.length) chunks.push(chunk.join(" "));
    sections = chunks.map((body) => ({ heading: derivedHeading(body), body }));
  }

  // Tiny stray fragments (e.g. a lone "A 15-minute lightning talk"
  // line before the first bullet group) merge into what follows them.
  // A real outline group is never merged away: once a section holds a
  // list block, the next block starts a new section.
  // A topic-list block (after a "cover:"-style lead-in) becomes one
  // section per line — each line is a topic, not a paragraph.
  sections = sections.flatMap((s) => {
    if (s.kind !== "topics") return [s];
    return s.lines
      .map((l) => l.trim())
      .filter(Boolean)
      .flatMap((line) => splitAlternatives(line))
      .map(({ body, maybe }) => ({ heading: derivedHeading(body), body: /[.!?]$/.test(body) ? body : body + ".", kind: "topic", maybe }));
  });
  const merged = [];
  for (const s of sections) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind !== "list" && prev.kind !== "topic" && s.kind !== "topic" && spokenWords(prev.body).length < 20) {
      prev.body += " " + s.body;
      prev.kind = s.kind;
    } else {
      merged.push({ ...s });
    }
  }
  return merged.filter((s) => spokenWords(s.body).length > 0);
}

export function generateCuePlan({ notesText, paceWpm = 130, targetMinutes } = {}) {
  if (!notesText || !notesText.trim()) {
    throw new Error("No notes text given — paste or write the talk notes first.");
  }

  // Title: a "# ..." line, else a short first line that doesn't read
  // as body text (an outline's title line), else a placeholder.
  let title = "Untitled talk";
  let text = notesText;
  const hashTitle = notesText.match(/^#\s+(?:Talk:\s*)?(.+)$/m);
  if (hashTitle) {
    title = hashTitle[1].trim();
    text = notesText.replace(hashTitle[0], "");
  } else {
    const allLines = notesText.split(/\r?\n/);
    const firstIdx = allLines.findIndex((l) => l.trim());
    const firstLine = firstIdx >= 0 ? allLines[firstIdx] : null;
    const moreAfter = firstLine && allLines.slice(firstIdx + 1).some((l) => l.trim());
    if (firstLine && moreAfter) {
      const t = firstLine.trim().replace(/^Talk:\s*/i, "");
      // A title line is short and heading-like: not a list item, not a
      // sentence, and at most 8 words — a wrapped first line of prose
      // (typically 10+ words) must NOT be eaten as a title.
      if (
        t.length <= 90 &&
        !/[.!?]$/.test(t) &&
        !LIST_LINE.test(firstLine.trim()) &&
        t.split(/\s+/).length <= 8
      ) {
        title = t;
        text = notesText.replace(firstLine, "");
      }
    }
  }

  // Target length: explicit argument > stated in text > estimated >
  // flagged default for sparse outlines.
  let targetSeconds = null;
  let targetSource = null;
  if (targetMinutes > 0) {
    targetSeconds = Math.round(targetMinutes * 60);
    targetSource = "override";
  } else {
    const stated = statedTargetSeconds(notesText);
    if (stated) {
      targetSeconds = stated;
      targetSource = "notes";
    }
  }

  const rawSections = splitIntoSections(text);
  if (rawSections.length === 0) {
    throw new Error("Couldn't find any talk content in that text — it looks empty once formatting is removed.");
  }

  const raw = rawSections.map((s) => {
    const words = spokenWords(s.body).length;
    return { ...s, wordCount: words, rawSeconds: (words / paceWpm) * 60 };
  });
  const rawTotal = raw.reduce((n, s) => n + s.rawSeconds, 0);
  if (!targetSeconds) {
    if (rawTotal >= 120) {
      targetSeconds = Math.round(rawTotal);
      targetSource = "estimated";
    } else {
      targetSeconds = DEFAULT_TARGET_SECONDS;
      targetSource = "default";
    }
  }
  const scale = rawTotal > 0 ? targetSeconds / rawTotal : 1;

  let cursor = 0;
  const sections = raw.map((s, i) => {
    const durationSecond = Math.max(5, Math.round(s.rawSeconds * scale));
    const startSecond = cursor;
    cursor += durationSecond;
    const cueWords = shortCue(s.heading);
    const cues = [
      {
        atSecond: startSecond,
        type: i === 0 ? "open" : "content",
        text: /\?$/.test(cueWords) ? cueWords : (s.maybe ? `Maybe: ${cueWords}` : (i === 0 ? `Begin: ${cueWords}` : `Next: ${cueWords}`)),
        optional: s.maybe === true,
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
    return {
      id: `s${i + 1}`,
      heading: s.heading,
      startSecond,
      durationSecond,
      wordCount: s.wordCount,
      anchors: anchorsFor(s.body),
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

  return { title, targetSeconds, targetSource, paceWpm, generatedBy: "local", sections };
}
