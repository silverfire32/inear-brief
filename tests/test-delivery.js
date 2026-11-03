// Pause-aware delivery checks: cues prefer pauses, holding is
// bounded, optional cues drop instead of talking over the speaker.
// All times are fake talk-clock seconds — no timers involved.
import assert from "node:assert";
import { createCueGate } from "../src/delivery.js";

const cue = (atSecond, type = "content", optional = false) => ({ atSecond, type, text: "cue", optional });

// 1. No speech at all: a due cue plays immediately, unheld.
{
  const g = createCueGate();
  g.offer(cue(10), 10);
  const { play, dropped } = g.poll(10);
  assert.equal(play.length, 1);
  assert.equal(play[0].heldSec, 0);
  assert.equal(play[0].forced, false);
  assert.equal(dropped.length, 0);
}

// 2. Speaker talking when the cue comes due: held, then released into
// the pause once the pause is at least minPauseSec (0.7s) long.
{
  const g = createCueGate();
  g.noteSpeech({ atSec: 9, durationSec: 4 }); // talking 9 -> 13
  g.offer(cue(10), 10);
  assert.equal(g.poll(10.5).play.length, 0, "must not play over speech");
  assert.equal(g.poll(13.5).play.length, 0, "0.5s of silence is not a pause yet");
  const { play } = g.poll(13.8);
  assert.equal(play.length, 1, "releases once the pause matures");
  assert.ok(Math.abs(play[0].heldSec - 3.8) < 0.01);
  assert.equal(play[0].forced, false);
}

// 3. No pause within maxHoldSec (4s): a required cue force-plays.
{
  const g = createCueGate();
  g.noteSpeech({ atSec: 9, durationSec: 30 }); // talking 9 -> 39
  g.offer(cue(10), 10);
  assert.equal(g.poll(13.9).play.length, 0);
  const { play } = g.poll(14.05);
  assert.equal(play.length, 1);
  assert.equal(play[0].forced, true, "bounded hold: better late than never");
}

// 4. Time-critical cues get the shorter urgent bound (1.5s).
{
  const g = createCueGate();
  g.noteSpeech({ atSec: 9, durationSec: 30 });
  g.offer(cue(10, "time"), 10);
  assert.equal(g.poll(11.4).play.length, 0);
  const { play } = g.poll(11.6);
  assert.equal(play.length, 1);
  assert.equal(play[0].forced, true);
}

// 5. An optional cue with no pause in its window is dropped, never forced.
{
  const g = createCueGate();
  g.noteSpeech({ atSec: 9, durationSec: 30 });
  g.offer(cue(10, "wrap", true), 10);
  const early = g.poll(13.9);
  assert.equal(early.play.length + early.dropped.length, 0);
  const { play, dropped } = g.poll(14.05);
  assert.equal(play.length, 0, "optional cues never talk over the speaker");
  assert.equal(dropped.length, 1);
  assert.equal(g.poll(20).dropped.length, 0, "a dropped cue stays dropped");
}

// 6. Queued cues release in due order when a pause arrives.
{
  const g = createCueGate();
  g.noteSpeechStart(9);
  g.offer(cue(10), 10);
  g.offer(cue(11), 11);
  g.noteSpeechEnd(12);
  assert.equal(g.poll(12.5).play.length, 0);
  const { play } = g.poll(12.8);
  assert.deepEqual(play.map((p) => p.cue.atSecond), [10, 11]);
}

// 7. Speech resuming mid-hold keeps the cue waiting until the deadline.
{
  const g = createCueGate();
  g.noteSpeech({ atSec: 9, durationSec: 2 }); // 9 -> 11
  g.offer(cue(10), 10);
  g.noteSpeech({ atSec: 11.3, durationSec: 10 }); // resumes before pause matures
  assert.equal(g.poll(11.6).play.length, 0, "pause never matured, still holding");
  const { play } = g.poll(14.05);
  assert.equal(play.length, 1);
  assert.equal(play[0].forced, true);
}

console.log("test-delivery: OK — pause-preferred, bounded hold, urgent bound, optional drop, ordered release");
