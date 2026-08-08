import { beforeEach, describe, expect, it } from 'vitest';
import { LoopClock } from '@/systems/LoopClock';

const DURATION = 20_000;

describe('LoopClock', () => {
  let clock: LoopClock;

  beforeEach(() => {
    clock = new LoopClock(DURATION);
  });

  it('starts at loop 1 with a full timer', () => {
    expect(clock.loopNumber).toBe(1);
    expect(clock.elapsedMs).toBe(0);
    expect(clock.remainingMs).toBe(DURATION);
    expect(clock.progress).toBe(0);
  });

  it('signals expiry exactly once', () => {
    let expiries = 0;
    for (let i = 0; i < 1500; i++) {
      if (clock.advance(16.667)) expiries++;
    }
    expect(expiries).toBe(1);
  });

  it('clamps elapsed time to the loop duration', () => {
    clock.advance(999_999);
    expect(clock.elapsedMs).toBe(DURATION);
    expect(clock.remainingMs).toBe(0);
    expect(clock.progress).toBe(1);
  });

  it('does not advance while paused', () => {
    clock.paused = true;
    expect(clock.advance(1000)).toBe(false);
    expect(clock.elapsedMs).toBe(0);
  });

  it('restart begins the next loop from zero', () => {
    clock.advance(12_000);
    clock.restart();
    expect(clock.loopNumber).toBe(2);
    expect(clock.elapsedMs).toBe(0);
    expect(clock.isExpired).toBe(false);
  });

  it('resetToFirstLoop wipes loop history', () => {
    clock.restart();
    clock.restart();
    clock.advance(500);
    clock.resetToFirstLoop();
    expect(clock.loopNumber).toBe(1);
    expect(clock.elapsedMs).toBe(0);
  });
});
