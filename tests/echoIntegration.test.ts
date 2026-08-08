/**
 * End-to-end test of the Echo mechanic through the real pipeline:
 *
 *   player state -> LoopManager.tick -> EchoRecorder -> closeTimeline
 *                -> EchoPlaybackCursor -> replayed pose + actions
 *
 * This is the automated form of the manual test scenario:
 *   Loop 1: walk left, pause, walk right, shoot exactly once, press R.
 *   Loop 2: the Echo must reproduce that, and shoot exactly once.
 */
import { describe, expect, it } from 'vitest';
import { EchoPlaybackCursor } from '@/systems/EchoPlaybackCursor';
import { LoopManager } from '@/systems/LoopManager';
import {
  AnimationState,
  EchoAction,
  type EchoPose,
  type EchoSampleState,
  type EchoTimeline,
} from '@/types/echo';
import type { TimelineConfig } from '@/types/level';

const TIMELINE: TimelineConfig = { loopDurationMs: 2_000, maxEchoes: 3 };
const RECORD_FRAME = 1000 / 60;
const SHOOT_AT_MS = 1_400;
const START_X = 500;
const START_Y = 300;

/**
 * The scripted route: walk left 100px, hold still, walk right 100px, hold.
 * A pure function of time, so recording and expectation cannot drift apart.
 */
function scriptedX(t: number): number {
  if (t <= 500) return START_X - (t / 500) * 100; // walk left
  if (t <= 800) return START_X - 100; // pause
  if (t <= 1_300) return START_X - 100 + ((t - 800) / 500) * 100; // walk right
  return START_X; // hold
}

function scriptedAnimState(t: number): AnimationState {
  const moving = t <= 500 || (t > 800 && t <= 1_300);
  return moving ? AnimationState.Move : AnimationState.Idle;
}

/** Play the scripted loop into a LoopManager and archive it, as GameScene would. */
function recordScriptedLoop(loop: LoopManager, frameMs: number): EchoTimeline {
  const state: EchoSampleState = {
    x: START_X,
    y: START_Y,
    rotation: 0,
    animationState: AnimationState.Idle,
    actionMask: EchoAction.None,
  };

  // Mirror GameScene: frame 0 is the spawn pose, recorded before any time passes.
  state.x = scriptedX(0);
  loop.primeRecording(state);

  let t = 0;
  let shotQueued = false;
  let shotRecorded = false;

  while (t < TIMELINE.loopDurationMs) {
    const next = Math.min(TIMELINE.loopDurationMs, t + frameMs);

    state.x = scriptedX(next);
    state.y = START_Y;
    state.animationState = scriptedAnimState(next);

    // Fire exactly once, on the first tick at or past SHOOT_AT_MS.
    if (!shotQueued && next >= SHOOT_AT_MS) {
      state.actionMask = EchoAction.Shoot;
      shotQueued = true;
    } else {
      state.actionMask = EchoAction.None;
    }

    loop.tick(frameMs, state);

    // Mirror GameScene: only clear the buffered action once a frame was committed.
    if (loop.samplesWritten > 0 && state.actionMask !== EchoAction.None) {
      shotRecorded = true;
    }
    t = next;
  }

  expect(shotRecorded).toBe(true);
  return loop.closeTimeline()!;
}

const emptyPose = (): EchoPose => ({ x: 0, y: 0, rotation: 0, animationState: 0 });

/** Replay a timeline at `frameMs` and report what happened. */
function replay(
  timeline: EchoTimeline,
  frameMs: number,
): { shots: number; shotTimes: number[]; samples: Array<{ t: number; x: number }> } {
  const cursor = new EchoPlaybackCursor(timeline);
  const pose = emptyPose();
  const shotTimes: number[] = [];
  const samples: Array<{ t: number; x: number }> = [];

  for (let t = 0; t <= TIMELINE.loopDurationMs; t += frameMs) {
    const fired = cursor.update(t, pose);
    if ((fired & EchoAction.Shoot) !== 0) shotTimes.push(t);
    samples.push({ t, x: pose.x });
  }

  return { shots: shotTimes.length, shotTimes, samples };
}

describe('manual test scenario, automated', () => {
  it('an Echo reproduces the recorded route', () => {
    const loop = new LoopManager(TIMELINE);
    const timeline = recordScriptedLoop(loop, RECORD_FRAME);

    // Replayed at a deliberately different framerate from the recording.
    const { samples } = replay(timeline, 1000 / 37);

    for (const { t, x } of samples) {
      // Tolerance covers linear interpolation across the direction-change kinks.
      expect(Math.abs(x - scriptedX(t))).toBeLessThan(3);
    }
  });

  it('the Echo walks left, pauses, then walks right', () => {
    const loop = new LoopManager(TIMELINE);
    const timeline = recordScriptedLoop(loop, RECORD_FRAME);
    const cursor = new EchoPlaybackCursor(timeline);
    const pose = emptyPose();

    const at = (t: number): number => {
      cursor.readPoseAt(t, pose); // Read-only: no cursor reset needed.
      return pose.x;
    };

    const start = at(0);
    const afterWalkLeft = at(500);
    const afterPause = at(800);
    const afterWalkRight = at(1_300);

    expect(afterWalkLeft).toBeLessThan(start - 90);
    expect(afterPause).toBeCloseTo(afterWalkLeft, 0);
    expect(afterWalkRight).toBeGreaterThan(afterPause + 90);
    expect(afterWalkRight).toBeCloseTo(start, 0);
  });

  it('one recorded shot produces exactly one Echo shot', () => {
    const loop = new LoopManager(TIMELINE);
    const timeline = recordScriptedLoop(loop, RECORD_FRAME);

    const { shots, shotTimes } = replay(timeline, RECORD_FRAME);

    expect(shots).toBe(1);
    // Fired within one sample interval of the original moment.
    expect(shotTimes[0]!).toBeGreaterThanOrEqual(SHOOT_AT_MS - RECORD_FRAME);
    expect(shotTimes[0]!).toBeLessThanOrEqual(SHOOT_AT_MS + RECORD_FRAME * 2);
  });

  it('still fires exactly one shot at any playback framerate', () => {
    const loop = new LoopManager(TIMELINE);
    const timeline = recordScriptedLoop(loop, RECORD_FRAME);

    for (const fps of [144, 60, 30, 12]) {
      expect(replay(timeline, 1000 / fps).shots).toBe(1);
    }
  });

  it('still fires exactly one shot when recorded at a low framerate', () => {
    // A 30 FPS recording writes two sample slots per rendered frame; only the first
    // may carry the action, or the Echo would double-shoot.
    const loop = new LoopManager(TIMELINE);
    const timeline = recordScriptedLoop(loop, 1000 / 30);

    expect(replay(timeline, RECORD_FRAME).shots).toBe(1);
  });

  it('replays identically on every subsequent loop', () => {
    const loop = new LoopManager(TIMELINE);
    const timeline = recordScriptedLoop(loop, RECORD_FRAME);
    const cursor = new EchoPlaybackCursor(timeline);
    const pose = emptyPose();

    const runOnce = (): { shots: number; path: number[] } => {
      cursor.reset();
      let shots = 0;
      const path: number[] = [];
      for (let t = 0; t <= TIMELINE.loopDurationMs; t += RECORD_FRAME) {
        if ((cursor.update(t, pose) & EchoAction.Shoot) !== 0) shots += 1;
        path.push(pose.x);
      }
      return { shots, path };
    };

    const first = runOnce();
    for (let loopIndex = 0; loopIndex < 5; loopIndex++) {
      const again = runOnce();
      expect(again.shots).toBe(1);
      expect(again.path).toEqual(first.path);
    }
  });
});

describe('multiple Echoes on one clock', () => {
  it('all timelines start together at time 0', () => {
    const loop = new LoopManager(TIMELINE);
    const timelines: EchoTimeline[] = [];
    for (let i = 0; i < 3; i++) {
      timelines.push(recordScriptedLoop(loop, RECORD_FRAME));
    }

    const cursors = timelines.map((t) => new EchoPlaybackCursor(t));
    const poses = timelines.map(() => emptyPose());

    // Every Echo is placed on the same recorded starting mark at t = 0.
    cursors.forEach((c, i) => c.readPoseAt(0, poses[i]!));
    for (const pose of poses) {
      expect(pose.x).toBeCloseTo(START_X, 6);
    }

    // ...and they stay in lockstep for the whole loop.
    for (let t = 0; t <= TIMELINE.loopDurationMs; t += 25) {
      cursors.forEach((c, i) => c.update(t, poses[i]!));
      for (const pose of poses) {
        expect(pose.x).toBeCloseTo(poses[0]!.x, 6);
      }
    }
  });

  it('each Echo fires its own single shot, so N Echoes fire N shots', () => {
    const loop = new LoopManager(TIMELINE);
    const timelines = [0, 1, 2].map(() => recordScriptedLoop(loop, RECORD_FRAME));

    const cursors = timelines.map((t) => new EchoPlaybackCursor(t));
    const pose = emptyPose();
    let totalShots = 0;

    for (let t = 0; t <= TIMELINE.loopDurationMs; t += RECORD_FRAME) {
      for (const cursor of cursors) {
        if ((cursor.update(t, pose) & EchoAction.Shoot) !== 0) totalShots += 1;
      }
    }

    expect(totalShots).toBe(3);
  });

  it('resetting playback returns every cursor to the beginning', () => {
    const loop = new LoopManager(TIMELINE);
    const timelines = [0, 1].map(() => recordScriptedLoop(loop, RECORD_FRAME));
    const cursors = timelines.map((t) => new EchoPlaybackCursor(t));
    const pose = emptyPose();

    // Run them to the end.
    for (const cursor of cursors) {
      cursor.update(TIMELINE.loopDurationMs, pose);
      expect(cursor.isFinished(TIMELINE.loopDurationMs)).toBe(true);
    }

    // Reset, then confirm each one replays its shot again from scratch.
    for (const cursor of cursors) {
      cursor.reset();
      let shots = 0;
      for (let t = 0; t <= TIMELINE.loopDurationMs; t += RECORD_FRAME) {
        if ((cursor.update(t, pose) & EchoAction.Shoot) !== 0) shots += 1;
      }
      expect(shots).toBe(1);
    }
  });
});
