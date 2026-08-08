import { GAME_HEIGHT, GAME_WIDTH } from '@/config/resolution';
import type { LevelDef } from '@/types/level';

const T = 24; // Border wall thickness.

/**
 * Level 01 — the vertical-slice room.
 *
 * Currently a single open vault chamber used to validate movement, aiming,
 * shooting, dashing and the loop reset. The pressure switch, locked door and
 * Time Core pickup logic land in the next milestone.
 */
export const LEVEL_01: LevelDef = {
  id: 'level01',
  name: '01 — FIRST ECHO',
  objective: 'Reach the Time Core.',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,

  // Level 01 teaches the mechanic, so it is generous: a full 20-second loop, and
  // only three Echo slots — enough to feel the cooperation without crowding the room.
  timeline: {
    loopDurationMs: 20_000,
    maxEchoes: 3,
  },

  playerSpawn: { x: 170, y: GAME_HEIGHT - 150 },
  core: { x: GAME_WIDTH - 220, y: 210 },
  // No extraction point yet, so touching the Core is the win condition for now.
  completeOnCoreCollected: true,
  walls: [
    // Chamber border.
    { x: 0, y: 0, w: GAME_WIDTH, h: T },
    { x: 0, y: GAME_HEIGHT - T, w: GAME_WIDTH, h: T },
    { x: 0, y: 0, w: T, h: GAME_HEIGHT },
    { x: GAME_WIDTH - T, y: 0, w: T, h: GAME_HEIGHT },

    // Interior cover — gives the dash somewhere to go and breaks sightlines.
    { x: 330, y: 150, w: 32, h: 210 },
    { x: 330, y: 150, w: 190, h: 32 },
    { x: 760, y: 380, w: 32, h: 200 },
    { x: 620, y: 548, w: 172, h: 32 },
    { x: 980, y: 330, w: 210, h: 30 },
    { x: 470, y: 300, w: 96, h: 96 },
  ],
};
