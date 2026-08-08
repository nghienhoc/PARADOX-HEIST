import { describe, expect, it } from 'vitest';
import { LOOP } from '@/config/balance';
import { LEVEL_01 } from '@/levels/level01';
import { expectedFrameCount, validateLevel, type LevelDef } from '@/types/level';

const broken = (overrides: Partial<LevelDef>): LevelDef => ({ ...LEVEL_01, ...overrides });

describe('validateLevel — geometry', () => {
  it('accepts the shipped level 01', () => {
    expect(validateLevel(LEVEL_01)).toEqual([]);
  });

  it('reports a spawn point outside the room', () => {
    expect(validateLevel(broken({ playerSpawn: { x: -50, y: 10 } })).join()).toMatch(/Player spawn/);
  });

  it('reports a core outside the room', () => {
    expect(validateLevel(broken({ core: { x: 99_999, y: 10 } })).join()).toMatch(/Time Core/);
  });

  it('reports degenerate walls', () => {
    expect(validateLevel(broken({ walls: [{ x: 0, y: 0, w: 0, h: 10 }] })).join()).toMatch(/Wall #0/);
  });

  it('collects every problem rather than stopping at the first', () => {
    const errors = validateLevel(
      broken({ id: '', playerSpawn: { x: -1, y: -1 }, core: { x: -1, y: -1 } }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateLevel — per-level timeline config', () => {
  it('accepts a range of plausible level configurations', () => {
    const configs = [
      { loopDurationMs: 15_000, maxEchoes: 4 },
      { loopDurationMs: 20_000, maxEchoes: 3 },
      { loopDurationMs: 30_000, maxEchoes: 5 },
      { loopDurationMs: 10_000, maxEchoes: 1 },
    ];
    for (const timeline of configs) {
      expect(validateLevel(broken({ timeline }))).toEqual([]);
    }
  });

  it('rejects a loop shorter than one sample interval', () => {
    expect(
      validateLevel(broken({ timeline: { loopDurationMs: 5, maxEchoes: 3 } })).join(),
    ).toMatch(/loopDurationMs/);
  });

  it('rejects a zero or negative loop duration', () => {
    expect(validateLevel(broken({ timeline: { loopDurationMs: 0, maxEchoes: 3 } })).length)
      .toBeGreaterThan(0);
    expect(validateLevel(broken({ timeline: { loopDurationMs: -1, maxEchoes: 3 } })).length)
      .toBeGreaterThan(0);
  });

  it('rejects maxEchoes below 1', () => {
    expect(validateLevel(broken({ timeline: { loopDurationMs: 20_000, maxEchoes: 0 } })).join())
      .toMatch(/maxEchoes/);
  });

  it('rejects a non-integer maxEchoes', () => {
    expect(validateLevel(broken({ timeline: { loopDurationMs: 20_000, maxEchoes: 2.5 } })).join())
      .toMatch(/maxEchoes/);
  });

  it('rejects maxEchoes above the engine hard cap', () => {
    expect(
      validateLevel(
        broken({ timeline: { loopDurationMs: 20_000, maxEchoes: LOOP.echoHardCap + 1 } }),
      ).join(),
    ).toMatch(/hard cap/);
  });
});

describe('expectedFrameCount', () => {
  it('matches the 60Hz sampling contract', () => {
    expect(expectedFrameCount({ loopDurationMs: 20_000, maxEchoes: 1 })).toBe(1201);
    expect(expectedFrameCount({ loopDurationMs: 15_000, maxEchoes: 1 })).toBe(901);
    expect(expectedFrameCount({ loopDurationMs: 30_000, maxEchoes: 1 })).toBe(1801);
  });
});

describe('LEVEL_01 layout', () => {
  it('declares its own timeline rules rather than relying on globals', () => {
    expect(LEVEL_01.timeline.loopDurationMs).toBeGreaterThan(0);
    expect(LEVEL_01.timeline.maxEchoes).toBeGreaterThanOrEqual(1);
    expect(LEVEL_01.timeline.maxEchoes).toBeLessThanOrEqual(LOOP.echoHardCap);
  });

  it('spawns the player and the core apart from each other', () => {
    const dx = LEVEL_01.core.x - LEVEL_01.playerSpawn.x;
    const dy = LEVEL_01.core.y - LEVEL_01.playerSpawn.y;
    // The heist has to be a trip, not a step.
    expect(Math.hypot(dx, dy)).toBeGreaterThan(400);
  });

  it('is reachable within one loop, so the tutorial level is not a dead end', () => {
    const dx = LEVEL_01.core.x - LEVEL_01.playerSpawn.x;
    const dy = LEVEL_01.core.y - LEVEL_01.playerSpawn.y;
    // Straight-line distance at 260 px/s must fit comfortably inside the loop.
    const travelMs = (Math.hypot(dx, dy) / 260) * 1000;
    expect(travelMs).toBeLessThan(LEVEL_01.timeline.loopDurationMs * 0.5);
  });

  it('is fully enclosed by border walls', () => {
    const { width, height, walls } = LEVEL_01;
    const hasTop = walls.some((w) => w.y === 0 && w.w >= width);
    const hasBottom = walls.some((w) => w.y + w.h >= height && w.w >= width);
    const hasLeft = walls.some((w) => w.x === 0 && w.h >= height);
    const hasRight = walls.some((w) => w.x + w.w >= width && w.h >= height);
    expect([hasTop, hasBottom, hasLeft, hasRight]).toEqual([true, true, true, true]);
  });
});
