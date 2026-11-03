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
// Fuzzy word equivalence: live speech rarely reproduces an anchor
// letter-for-letter ("demo" vs "demonstrate", plurals, STT typos), so
// words match when one extends the other or they look alike. Short words
// (a, to, of) must still match exactly — they're too easy to collide.
function jaro(a, b) {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (!la || !lb) return 0;
  const window = Math.floor(Math.max(la, lb) / 2) - 1;
  const aMatch = new Array(la).fill(false);
  const bMatch = new Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - window);
    const hi = Math.min(lb - 1, i + window);
    for (let j = lo; j <= hi; j++) {
      if (!bMatch[j] && a[i] === b[j]) {
        aMatch[i] = true;
        bMatch[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / la + matches / lb + (matches - t) / matches) / 3;
}

function jaroWinkler(a, b) {
  const j = jaro(a, b);
  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

function wordEq(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  return jaroWinkler(a, b) >= 0.85;
}

const LOOKAHEAD = 4;

function orderedMatchRatio(anchorWords, windowWords) {
  if (anchorWords.length === 0) return 0;
  let best = 0;
  for (let start = 0; start < windowWords.length; start += 1) {
    if (!wordEq(windowWords[start], anchorWords[0])) continue;
    let wi = start + 1;
    let matched = 1;
    for (let ai = 1; ai < anchorWords.length; ai += 1) {
      const limit = Math.min(wi + LOOKAHEAD, windowWords.length);
      for (let k = wi; k < limit; k += 1) {
        if (wordEq(windowWords[k], anchorWords[ai])) {
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
