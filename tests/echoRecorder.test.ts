import { beforeEach, describe, expect, it } from 'vitest';
import { EchoRecorder } from '@/systems/EchoRecorder';
import { AnimationState, EchoAction, type EchoSampleState } from '@/types/echo';

const DURATION = 20_000;
const RATE = 60;

/** Mutable state object, mirroring how the Player hands its state to the recorder. */
function makeState(overrides: Partial<EchoSampleState> = {}): EchoSampleState {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    animationState: AnimationState.Idle,
    actionMask: EchoAction.None,
    ...overrides,
  };
}

describe('EchoRecorder', () => {
  let recorder: EchoRecorder;

  beforeEach(() => {
    recorder = new EchoRecorder(DURATION, RATE);
  });

  it('has capacity for a full 20s timeline at 60Hz (1200 intervals + both endpoints)', () => {
    expect(recorder.capacity).toBe(1201);
    expect(recorder.intervalMs).toBeCloseTo(1000 / 60);
  });

  it('records the same frame count regardless of render framerate', () => {
    const run = (frameMs: number): number => {
      const r = new EchoRecorder(DURATION, RATE);
      const state = makeState();
      let t = 0;
      while (t < DURATION) {
        t = Math.min(DURATION, t + frameMs);
        r.sample(t, state);
      }
      return r.frameCount;
    };

    // 144 Hz, 60 Hz and 30 Hz must all produce an identical recording length.
    expect(run(1000 / 144)).toBe(1201);
    expect(run(1000 / 60)).toBe(1201);
    expect(run(1000 / 30)).toBe(1201);
  });

  it('writes frame 0 at t = 0 and never exceeds capacity', () => {
    const state = makeState({ x: 5, y: 7 });
    expect(recorder.sample(0, state)).toBe(1);

    // Jump straight past the end of the loop.
    recorder.sample(DURATION * 2, state);
    expect(recorder.frameCount).toBe(recorder.capacity);
    expect(recorder.isFull).toBe(true);

    // Further samples are ignored rather than growing the buffer.
    expect(recorder.sample(DURATION * 3, state)).toBe(0);
  });

  it('stamps frames with scheduled times, not accumulated deltas', () => {
    const state = makeState();
    for (let i = 0; i < 10; i++) {
      recorder.sample(i * 17.3, state);
    }
    const snapshot = recorder.takeSnapshot(1, 1);
    snapshot.frames.forEach((frame, index) => {
      expect(frame.time).toBeCloseTo(index * (1000 / 60), 6);
    });
  });

  it('fires an action exactly once even when several sample slots elapse at once', () => {
    const state = makeState({ actionMask: EchoAction.Shoot });

    // One long frame covering ~5 sample slots.
    const written = recorder.sample(80, state);
    expect(written).toBeGreaterThan(1);

    const snapshot = recorder.takeSnapshot(1, 1);
    const shots = snapshot.frames.filter((f) => (f.actionMask & EchoAction.Shoot) !== 0);
    expect(shots).toHaveLength(1);
  });

  it('records combined action bits in one frame', () => {
    recorder.sample(0, makeState({ actionMask: EchoAction.Shoot | EchoAction.Dash }));
    const frame = recorder.takeSnapshot(1, 1).frames[0]!;
    expect(frame.actionMask & EchoAction.Shoot).toBeTruthy();
    expect(frame.actionMask & EchoAction.Dash).toBeTruthy();
    expect(frame.actionMask & EchoAction.EMP).toBeFalsy();
  });

  it('reset clears the recording without reallocating', () => {
    recorder.sample(500, makeState());
    expect(recorder.frameCount).toBeGreaterThan(0);
    recorder.reset();
    expect(recorder.frameCount).toBe(0);
  });

  it('snapshots are deep copies, so reusing the buffer cannot corrupt an Echo', () => {
    recorder.sample(0, makeState({ x: 100, y: 200 }));
    const first = recorder.takeSnapshot(1, 1);

    recorder.reset();
    recorder.sample(0, makeState({ x: -999, y: -999 }));

    expect(first.frames[0]!.x).toBe(100);
    expect(first.frames[0]!.y).toBe(200);
  });

  it('snapshot metadata reports the recorded duration', () => {
    const state = makeState();
    for (let t = 0; t <= 1000; t += 16) recorder.sample(t, state);

    const snapshot = recorder.takeSnapshot(7, 3);
    expect(snapshot.id).toBe(7);
    expect(snapshot.loopNumber).toBe(3);
    expect(snapshot.durationMs).toBeCloseTo(snapshot.frames.at(-1)!.time);
    expect(snapshot.durationMs).toBeLessThanOrEqual(1000);
  });

  it('an empty recording snapshots to a zero-length timeline', () => {
    const snapshot = recorder.takeSnapshot(1, 1);
    expect(snapshot.frames).toHaveLength(0);
    expect(snapshot.durationMs).toBe(0);
  });
});
