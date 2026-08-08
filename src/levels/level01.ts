import { GAME_HEIGHT, GAME_WIDTH } from '@/config/resolution';
import type { LevelDef } from '@/types/level';

const T = 24; // Border wall thickness.

/** The dividing wall between the two chambers, and the door gap in it. */
const DIVIDER_X = 560;
const DIVIDER_W = 40;
const GAP_TOP = 380;
const GAP_H = 120;

/**
 * Level 01 — FIRST ECHO.
 *
 * Layout, west to east:
 *
 *     ┌──────────── WEST CHAMBER ────────────┬───┬──── EAST CHAMBER ────────┐
 *     │  [switch]                            │   │        (core)            │
 *     │                                      │ D │                          │
 *     │  (spawn)                             │   │              [extract]   │
 *     └──────────────────────────────────────┴───┴──────────────────────────┘
 *
 * The teaching design: the pressure switch is in the west chamber, the door is the only
 * way east, and the Core and extraction are both east. Standing on the switch opens the
 * door — but the moment you step off to walk through it, the door shuts again.
 *
 * This makes the room **structurally** unsolvable by one timeline, no matter how fast the
 * player is. It is not a distance or timing gate that a skilled player could beat solo,
 * which is exactly what makes the first Echo feel necessary rather than convenient.
 */
export const LEVEL_01: LevelDef = {
  id: 'level01',
  name: 'FIRST ECHO',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,

  // Level 01 teaches the mechanic, so it is generous: a full 20-second loop, and only
  // three Echo slots — enough to feel the cooperation without crowding the room.
  timeline: {
    loopDurationMs: 20_000,
    maxEchoes: 3,
  },

  // The intended solution is two timelines: one to hold the switch, one to run the heist.
  scoring: {
    parTimelines: 2,
    parTimeMs: 50_000,
  },

  playerSpawn: { x: 150, y: GAME_HEIGHT - 150 },
  core: { x: 900, y: 180 },
  extraction: { x: 1130, y: 590, radius: 46 },

  // Extraction is the win condition, so collecting the Core is per-loop: reset before you
  // get out and the Core goes back on its pedestal.
  completeOnCoreCollected: false,

  switches: [{ id: 'switch-west', x: 170, y: 180, radius: 36 }],

  doors: [
    {
      id: 'door-divider',
      x: DIVIDER_X,
      y: GAP_TOP,
      w: DIVIDER_W,
      h: GAP_H,
      switchIds: ['switch-west'],
    },
  ],

  walls: [
    // Chamber border.
    { x: 0, y: 0, w: GAME_WIDTH, h: T },
    { x: 0, y: GAME_HEIGHT - T, w: GAME_WIDTH, h: T },
    { x: 0, y: 0, w: T, h: GAME_HEIGHT },
    { x: GAME_WIDTH - T, y: 0, w: T, h: GAME_HEIGHT },

    // Dividing wall, split around the door gap.
    { x: DIVIDER_X, y: T, w: DIVIDER_W, h: GAP_TOP - T },
    {
      x: DIVIDER_X,
      y: GAP_TOP + GAP_H,
      w: DIVIDER_W,
      h: GAME_HEIGHT - T - (GAP_TOP + GAP_H),
    },

    // West chamber cover — keeps the walk to the switch from being a bare corridor.
    { x: 300, y: 130, w: 32, h: 170 },
    { x: 300, y: 470, w: 190, h: 32 },

    // East chamber furniture, framing the Core and the route to extraction.
    { x: 880, y: 380, w: 230, h: 30 },
    { x: 760, y: 560, w: 32, h: 136 },
  ],
};
