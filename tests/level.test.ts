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

  it('reports an extraction pad outside the room', () => {
    expect(validateLevel(broken({ extraction: { x: -20, y: 10 } })).join()).toMatch(/Extraction/);
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

describe('validateLevel — switches and doors', () => {
  it('rejects a door referencing an unknown switch', () => {
    const errors = validateLevel(
      broken({
        switches: [{ id: 'a', x: 100, y: 100 }],
        doors: [{ id: 'd', x: 0, y: 0, w: 40, h: 100, switchIds: ['does-not-exist'] }],
      }),
    );
    expect(errors.join()).toMatch(/unknown switch "does-not-exist"/);
  });

  it('rejects a door with no switches, since it could never open', () => {
    const errors = validateLevel(
      broken({ doors: [{ id: 'd', x: 0, y: 0, w: 40, h: 100, switchIds: [] }] }),
    );
    expect(errors.join()).toMatch(/references no switches/);
  });

  it('accepts a door driven by several switches', () => {
    expect(
      validateLevel(
        broken({
          switches: [
            { id: 'a', x: 100, y: 100 },
            { id: 'b', x: 200, y: 100 },
          ],
          doors: [{ id: 'd', x: 300, y: 300, w: 40, h: 100, switchIds: ['a', 'b'] }],
        }),
      ),
    ).toEqual([]);
  });

  it('rejects duplicate switch ids', () => {
    const errors = validateLevel(
      broken({
        switches: [
          { id: 'same', x: 100, y: 100 },
          { id: 'same', x: 200, y: 100 },
        ],
        doors: [{ id: 'd', x: 300, y: 300, w: 40, h: 100, switchIds: ['same'] }],
      }),
    );
    expect(errors.join()).toMatch(/Duplicate switch id/);
  });

  it('rejects duplicate door ids', () => {
    const errors = validateLevel(
      broken({
        switches: [{ id: 'a', x: 100, y: 100 }],
        doors: [
          { id: 'same', x: 300, y: 300, w: 40, h: 100, switchIds: ['a'] },
          { id: 'same', x: 400, y: 300, w: 40, h: 100, switchIds: ['a'] },
        ],
      }),
    );
    expect(errors.join()).toMatch(/Duplicate door id/);
  });

  it('rejects a switch outside the room', () => {
    const errors = validateLevel(
      broken({
        switches: [{ id: 'a', x: -5, y: 100 }],
        doors: [{ id: 'd', x: 300, y: 300, w: 40, h: 100, switchIds: ['a'] }],
      }),
    );
    expect(errors.join()).toMatch(/Switch "a"/);
  });

  it('rejects a degenerate door', () => {
    const errors = validateLevel(
      broken({
        switches: [{ id: 'a', x: 100, y: 100 }],
        doors: [{ id: 'd', x: 300, y: 300, w: 0, h: 100, switchIds: ['a'] }],
      }),
    );
    expect(errors.join()).toMatch(/Door "d" has a non-positive size/);
  });
});

describe('validateLevel — scoring', () => {
  it('rejects a non-positive par time', () => {
    expect(
      validateLevel(broken({ scoring: { parTimelines: 2, parTimeMs: 0 } })).join(),
    ).toMatch(/parTimeMs/);
  });

  it('rejects par timelines below 1', () => {
    expect(
      validateLevel(broken({ scoring: { parTimelines: 0, parTimeMs: 1_000 } })).join(),
    ).toMatch(/parTimelines/);
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
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
    Math.hypot(b.x - a.x, b.y - a.y);
  /** Milliseconds to walk a distance at the player's top speed. */
  const travelMs = (px: number): number => (px / 260) * 1000;

  it('declares its own timeline rules rather than relying on globals', () => {
    expect(LEVEL_01.timeline.loopDurationMs).toBeGreaterThan(0);
    expect(LEVEL_01.timeline.maxEchoes).toBeGreaterThanOrEqual(1);
    expect(LEVEL_01.timeline.maxEchoes).toBeLessThanOrEqual(LOOP.echoHardCap);
  });

  it('spawns the player and the core apart from each other', () => {
    // The heist has to be a trip, not a step.
    expect(dist(LEVEL_01.playerSpawn, LEVEL_01.core)).toBeGreaterThan(400);
  });

  it('has exactly one switch driving exactly one door', () => {
    expect(LEVEL_01.switches).toHaveLength(1);
    expect(LEVEL_01.doors).toHaveLength(1);
    expect(LEVEL_01.doors[0]!.switchIds).toEqual([LEVEL_01.switches[0]!.id]);
  });

  it('wins at extraction, not at Core pickup', () => {
    // So a reset before getting out restores the Core, which is the lesson of the level.
    expect(LEVEL_01.completeOnCoreCollected).toBe(false);
  });

  it('puts the switch far enough from the door that holding it is not enough', () => {
    const sw = LEVEL_01.switches[0]!;
    const door = LEVEL_01.doors[0]!;
    const doorCentre = { x: door.x + door.w / 2, y: door.y + door.h / 2 };
    // The door shuts the instant the plate is released, so any separation makes the room
    // unsolvable alone. A generous gap is for readability, not for the puzzle logic.
    expect(dist(sw, doorCentre)).toBeGreaterThan(300);
  });

  it('the Core and extraction are both behind the door', () => {
    const door = LEVEL_01.doors[0]!;
    expect(LEVEL_01.core.x).toBeGreaterThan(door.x + door.w);
    expect(LEVEL_01.extraction.x).toBeGreaterThan(door.x + door.w);
    // ...and the switch is on the near side.
    expect(LEVEL_01.switches[0]!.x).toBeLessThan(door.x);
  });

  it('the full heist route fits inside one loop', () => {
    // spawn -> door -> core -> extraction, at top speed, must leave slack for play.
    const door = LEVEL_01.doors[0]!;
    const doorCentre = { x: door.x + door.w / 2, y: door.y + door.h / 2 };
    const route =
      dist(LEVEL_01.playerSpawn, doorCentre) +
      dist(doorCentre, LEVEL_01.core) +
      dist(LEVEL_01.core, LEVEL_01.extraction);

    expect(travelMs(route)).toBeLessThan(LEVEL_01.timeline.loopDurationMs * 0.6);
  });

  it('the switch is reachable within one loop from spawn', () => {
    expect(travelMs(dist(LEVEL_01.playerSpawn, LEVEL_01.switches[0]!))).toBeLessThan(
      LEVEL_01.timeline.loopDurationMs * 0.3,
    );
  });

  it('the door gap is wide enough for the player to pass', () => {
    const door = LEVEL_01.doors[0]!;
    // Player body diameter is 26px; anything near that would feel like snagging.
    expect(Math.max(door.w, door.h)).toBeGreaterThan(60);
  });

  it('is fully enclosed by border walls', () => {
    const { width, height, walls } = LEVEL_01;
    const hasTop = walls.some((w) => w.y === 0 && w.w >= width);
    const hasBottom = walls.some((w) => w.y + w.h >= height && w.w >= width);
    const hasLeft = walls.some((w) => w.x === 0 && w.h >= height);
    const hasRight = walls.some((w) => w.x + w.w >= width && w.h >= height);
    expect([hasTop, hasBottom, hasLeft, hasRight]).toEqual([true, true, true, true]);
  });

  it('the dividing wall leaves the doorway as the only gap', () => {
    const door = LEVEL_01.doors[0]!;
    const divider = LEVEL_01.walls.filter((w) => w.x === door.x && w.w === door.w);
    expect(divider).toHaveLength(2);

    // The two segments plus the doorway must span the full height of the room.
    const above = divider.find((w) => w.y < door.y)!;
    const below = divider.find((w) => w.y > door.y)!;
    expect(above.y + above.h).toBe(door.y);
    expect(below.y).toBe(door.y + door.h);
  });
});
