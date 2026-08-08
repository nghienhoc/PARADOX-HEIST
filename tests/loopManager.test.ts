import { beforeEach, describe, expect, it } from 'vitest';
import { LoopManager } from '@/systems/LoopManager';
import { AnimationState, EchoAction, type EchoSampleState } from '@/types/echo';
import type { TimelineConfig } from '@/types/level';

const DURATION = 20_000;
const MAX_ECHOES = 3;
const FRAME = 1000 / 60;
const FULL_FRAMES = 1201; // 20s at 60Hz, both endpoints sampled.

const config = (overrides: Partial<TimelineConfig> = {}): TimelineConfig => ({
  loopDurationMs: DURATION,
  maxEchoes: MAX_ECHOES,
  ...overrides,
});

function state(overrides: Partial<EchoSampleState> = {}): EchoSampleState {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    animationState: AnimationState.Idle,
    actionMask: EchoAction.None,
    ...overrides,
  };
}

/** Run one complete loop and return whether it reported expiry. */
function runFullLoop(loop: LoopManager, sample: EchoSampleState = state()): boolean {
  let expired = false;
  const maxTicks = Math.ceil(loop.loopDurationMs / FRAME) + 10;
  for (let i = 0; i < maxTicks && !expired; i++) {
    expired = loop.tick(FRAME, sample);
  }
  return expired;
}

describe('LoopManager', () => {
  let loop: LoopManager;

  beforeEach(() => {
    loop = new LoopManager(config());
  });

  it('starts with no Echoes on loop 1', () => {
    expect(loop.loopNumber).toBe(1);
    expect(loop.echoCount).toBe(0);
    expect(loop.timelines).toHaveLength(0);
    expect(loop.isAtEchoCap).toBe(false);
  });

  it('reports expiry after exactly one loop duration', () => {
    expect(runFullLoop(loop)).toBe(true);
    expect(loop.clock.elapsedMs).toBe(DURATION);
    expect(loop.recorder.frameCount).toBe(FULL_FRAMES);
  });

  it('closing a timeline archives exactly one new Echo and starts the next loop', () => {
    runFullLoop(loop);
    const archived = loop.closeTimeline();

    expect(archived).not.toBeNull();
    expect(archived!.frames.length).toBe(FULL_FRAMES);
    expect(archived!.loopNumber).toBe(1);

    expect(loop.loopNumber).toBe(2);
    expect(loop.echoCount).toBe(1);
    expect(loop.clock.elapsedMs).toBe(0);
    expect(loop.recorder.frameCount).toBe(0);
    expect(loop.evictedOnLastClose).toBe(0);
  });

  it('adds exactly one Echo per reset', () => {
    for (let expected = 1; expected <= MAX_ECHOES; expected++) {
      runFullLoop(loop);
      loop.closeTimeline();
      expect(loop.echoCount).toBe(expected);
    }
  });

  it('supports a manual reset part-way through a loop', () => {
    for (let i = 0; i < 60; i++) loop.tick(FRAME, state());
    const archived = loop.closeTimeline();

    expect(archived).not.toBeNull();
    // A short timeline is still a useful Echo — it just replays and then stops.
    expect(archived!.frames.length).toBeLessThan(FULL_FRAMES);
    expect(archived!.durationMs).toBeLessThan(DURATION);
    expect(loop.echoCount).toBe(1);
  });

  it('archives nothing when no frame was recorded', () => {
    expect(loop.closeTimeline()).toBeNull();
    expect(loop.echoCount).toBe(0);
    // The loop still advances, so the player is never stuck.
    expect(loop.loopNumber).toBe(2);
  });

  it('every archived timeline starts at time 0, so Echoes replay in lockstep', () => {
    for (let i = 0; i < MAX_ECHOES; i++) {
      loop.tick(FRAME, state());
      loop.closeTimeline();
    }
    for (const timeline of loop.timelines) {
      expect(timeline.frames[0]!.time).toBe(0);
    }
  });

  it('keeps archived timelines ordered oldest-first', () => {
    for (let i = 0; i < MAX_ECHOES; i++) {
      loop.tick(FRAME, state());
      loop.closeTimeline();
    }
    const ids = loop.timelines.map((t) => t.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('exposes how many frames each tick committed', () => {
    // A tick shorter than the sample interval commits nothing.
    loop.tick(FRAME, state()); // frame 0 at t=0
    loop.samplesWritten = -1;
    loop.tick(1, state());
    expect(loop.samplesWritten).toBe(0);

    // A long tick commits several frames at once.
    loop.tick(100, state());
    expect(loop.samplesWritten).toBeGreaterThan(1);
  });

  it('clear() wipes all timeline data so nothing leaks between levels', () => {
    for (let i = 0; i < 3; i++) {
      loop.tick(FRAME, state());
      loop.closeTimeline();
    }
    expect(loop.echoCount).toBe(3);

    loop.clear();

    expect(loop.echoCount).toBe(0);
    expect(loop.timelines).toHaveLength(0);
    expect(loop.loopNumber).toBe(1);
    expect(loop.recorder.frameCount).toBe(0);
    expect(loop.totalArchivedFrames).toBe(0);

    // Ids restart from 1 for the new level.
    loop.tick(FRAME, state());
    expect(loop.closeTimeline()!.id).toBe(1);
  });

  it('stays stable across many consecutive resets', () => {
    for (let i = 0; i < 40; i++) {
      runFullLoop(loop);
      loop.closeTimeline();
    }

    expect(loop.loopNumber).toBe(41);
    expect(loop.echoCount).toBe(MAX_ECHOES);
    // Memory is bounded by maxEchoes, not by the number of loops played.
    expect(loop.totalArchivedFrames).toBe(MAX_ECHOES * FULL_FRAMES);
  });

  it('records the action mask handed in by the player', () => {
    loop.tick(FRAME, state({ actionMask: EchoAction.Shoot, x: 42 }));
    const archived = loop.closeTimeline()!;
    expect(archived.frames[0]!.actionMask & EchoAction.Shoot).toBeTruthy();
    expect(archived.frames[0]!.x).toBe(42);
  });
});

describe('LoopManager honours per-level timeline config', () => {
  it('uses the level loopDuration for the clock and the recorder', () => {
    const short = new LoopManager(config({ loopDurationMs: 15_000 }));
    expect(short.loopDurationMs).toBe(15_000);
    expect(short.clock.durationMs).toBe(15_000);
    expect(short.recorder.capacity).toBe(901); // 15s at 60Hz + endpoint

    expect(runFullLoop(short)).toBe(true);
    expect(short.recorder.frameCount).toBe(901);
  });

  it('supports a longer loop on the same engine constants', () => {
    const long = new LoopManager(config({ loopDurationMs: 30_000 }));
    expect(long.recorder.capacity).toBe(1801);
    expect(runFullLoop(long)).toBe(true);
    expect(long.closeTimeline()!.durationMs).toBeCloseTo(30_000, 6);
  });

  it('uses the level maxEchoes as the cap', () => {
    const tight = new LoopManager(config({ maxEchoes: 2 }));
    for (let i = 0; i < 5; i++) {
      tight.tick(FRAME, state());
      tight.closeTimeline();
    }
    expect(tight.maxEchoes).toBe(2);
    expect(tight.echoCount).toBe(2);
    expect(tight.isAtEchoCap).toBe(true);
  });

  it('evicts the oldest timeline at the cap and reports the eviction', () => {
    const tight = new LoopManager(config({ maxEchoes: 2 }));

    for (let i = 0; i < 2; i++) {
      tight.tick(FRAME, state());
      tight.closeTimeline();
      expect(tight.evictedOnLastClose).toBe(0);
    }

    // Third timeline pushes the first one out.
    tight.tick(FRAME, state());
    const newest = tight.closeTimeline()!;

    expect(tight.evictedOnLastClose).toBe(1);
    expect(tight.echoCount).toBe(2);
    expect(tight.timelines.map((t) => t.id)).toEqual([2, 3]);
    // The timeline the player just recorded is always the one kept.
    expect(tight.timelines.at(-1)!.id).toBe(newest.id);
  });

  it('a single-Echo level keeps only the most recent timeline', () => {
    const solo = new LoopManager(config({ maxEchoes: 1 }));
    for (let i = 0; i < 4; i++) {
      solo.tick(FRAME, state());
      solo.closeTimeline();
    }
    expect(solo.echoCount).toBe(1);
    expect(solo.timelines[0]!.id).toBe(4);
  });
});
