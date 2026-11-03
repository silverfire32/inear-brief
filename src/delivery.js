// Pause-aware cue delivery (product rule, Joshua 2026-11-03).
//
// A cue that fires while the speaker is mid-sentence competes with
// their own voice — worst case for a listener with hearing impairment.
// So due cues do NOT play on schedule blindly: they pass through this
// gate, which prefers to release each cue into a genuine pause in the
// speaker's speech.
//
// Rules:
//   - If the speaker is silent and has been for at least minPauseSec,
//     the cue plays immediately (this includes "hasn't started yet").
//   - If the speaker is talking (or the pause is still young), the cue
//     is held. It releases the moment a pause matures to minPauseSec.
//   - Holding is bounded: a required cue that finds no pause within
//     maxHoldSec plays anyway, over speech — a late-but-heard cue beats
//     a silently missed one. Time-critical cues (types in urgentTypes,
//     i.e. the two-minute warning and the close) get the shorter
//     urgentMaxHoldSec bound.
//   - An OPTIONAL cue that finds no pause within its bound is dropped
//     instead of forced: by definition the talk can live without it,
//     and talking over the speaker for an optional nudge is the exact
//     harm this gate exists to prevent.
//
// The gate is deliberately dumb about where speech activity comes
// from: the runner feeds it segments (noteSpeech / noteSpeechStart /
// noteSpeechEnd) from whatever it has — microphone VAD or recognition
// results in the real product, the simulated-tracking panel in this
// prototype. All times are seconds on the talk clock (the same clock
// as cue atSecond values). No timers live here: the runner calls
// poll(nowSec) on its tick and plays what comes back.

const DEFAULTS = {
  minPauseSec: 0.7, // silence this long counts as a real pause
  maxHoldSec: 4, // required cues force-play after this long
  urgentMaxHoldSec: 1.5, // time/close cues force-play sooner
  urgentTypes: ["time", "close"],
};

export function createCueGate(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const urgent = new Set(cfg.urgentTypes);

  let speechUntil = -Infinity; // speaker is talking while now < speechUntil
  let speechOpen = false; // between noteSpeechStart and noteSpeechEnd
  let queue = []; // { cue, dueAt, deadline }

  function noteSpeech({ atSec, durationSec }) {
    if (durationSec > 0) speechUntil = Math.max(speechUntil, atSec + durationSec);
  }

  function noteSpeechStart(atSec) {
    speechOpen = true;
    speechUntil = Math.max(speechUntil, atSec);
  }

  function noteSpeechEnd(atSec) {
    speechOpen = false;
    speechUntil = atSec;
  }

  function isSpeaking(nowSec) {
    return speechOpen || nowSec < speechUntil;
  }

  // How long the current silence has lasted (Infinity if the speaker
  // has never spoken, or 0 while they are talking).
  function pauseLength(nowSec) {
    if (isSpeaking(nowSec)) return 0;
    return nowSec - speechUntil;
  }

  function offer(cue, nowSec) {
    const hold = urgent.has(cue.type) ? cfg.urgentMaxHoldSec : cfg.maxHoldSec;
    queue.push({ cue, dueAt: Math.min(nowSec, cue.atSecond ?? nowSec), deadline: nowSec + hold });
    queue.sort((a, b) => a.dueAt - b.dueAt);
  }

  // Returns { play: [{ cue, heldSec, forced }], dropped: [{ cue, heldSec }] }.
  function poll(nowSec) {
    const play = [];
    const dropped = [];
    const stillWaiting = [];
    const inPause = pauseLength(nowSec) >= cfg.minPauseSec;
    for (const item of queue) {
      if (inPause) {
        play.push({ cue: item.cue, heldSec: nowSec - item.dueAt, forced: false });
      } else if (nowSec >= item.deadline) {
        if (item.cue.optional) {
          dropped.push({ cue: item.cue, heldSec: nowSec - item.dueAt });
        } else {
          play.push({ cue: item.cue, heldSec: nowSec - item.dueAt, forced: true });
        }
      } else {
        stillWaiting.push(item);
      }
    }
    queue = stillWaiting;
    return { play, dropped };
  }

  return {
    noteSpeech,
    noteSpeechStart,
    noteSpeechEnd,
    isSpeaking,
    pauseLength,
    offer,
    poll,
    pending: () => queue.length,
    reset() {
      speechUntil = -Infinity;
      speechOpen = false;
      queue = [];
    },
  };
}
