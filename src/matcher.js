// Anchor-phrase matcher (stretch goal prototype).
//
// The runner feeds recognized speech text in via observe(); the matcher
// checks the rolling transcript against each section's anchor phrases.
// An anchor matches when most of its words appear, in order, within the
// recent transcript window — tolerant of speech-recognition errors and
// ad-libs. Position is monotonic: once a later section's anchor lands,
// the matcher never moves the speaker backwards.
//
// locate() -> { sectionIndex, sectionId, confidence, matchedAnchor }
// sectionIndex is -1 and confidence 0 until the first anchor lands.

const BUFFER_WORDS = 60;
const MATCH_THRESHOLD = 0.7;

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Match score for an anchor against the transcript window: try every
// occurrence of the anchor's first word as a start, then walk the rest
// of the anchor in order, allowing each word a small lookahead. A word
// lost to recognition noise is skipped rather than fatal, which is what
// makes the matcher tolerant of STT errors and ad-libs.
const LOOKAHEAD = 4;

function orderedMatchRatio(anchorWords, windowWords) {
  if (anchorWords.length === 0) return 0;
  let best = 0;
  for (let start = 0; start < windowWords.length; start += 1) {
    if (windowWords[start] !== anchorWords[0]) continue;
    let wi = start + 1;
    let matched = 1;
    for (let ai = 1; ai < anchorWords.length; ai += 1) {
      const limit = Math.min(wi + LOOKAHEAD, windowWords.length);
      for (let k = wi; k < limit; k += 1) {
        if (windowWords[k] === anchorWords[ai]) {
          matched += 1;
          wi = k + 1;
          break;
        }
      }
    }
    best = Math.max(best, matched / anchorWords.length);
    if (best === 1) break;
  }
  return best;
}

export function createMatcher(plan) {
  const anchors = [];
  plan.sections.forEach((s, sectionIndex) => {
    for (const a of s.anchors || []) {
      anchors.push({ sectionIndex, sectionId: s.id, phrase: a, words: normalize(a) });
    }
  });

  let buffer = [];
  let position = -1;
  let lastMatch = null;

  return {
    observe(text) {
      buffer = buffer.concat(normalize(text)).slice(-BUFFER_WORDS);
      for (const a of anchors) {
        if (a.sectionIndex < position) continue; // never move backwards
        const ratio = orderedMatchRatio(a.words, buffer);
        if (ratio >= MATCH_THRESHOLD) {
          if (a.sectionIndex > position || !lastMatch) {
            position = a.sectionIndex;
            lastMatch = { ...a, ratio };
          }
        }
      }
      return this.locate();
    },
    locate() {
      if (position < 0 || !lastMatch) {
        return { sectionIndex: -1, sectionId: null, confidence: 0, matchedAnchor: null };
      }
      return {
        sectionIndex: position,
        sectionId: lastMatch.sectionId,
        confidence: lastMatch.ratio,
        matchedAnchor: lastMatch.phrase,
      };
    },
    reset() {
      buffer = [];
      position = -1;
      lastMatch = null;
    },
  };
}
