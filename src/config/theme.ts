/**
 * Visual identity: a limited, intentional cyberpunk time-vault palette.
 * Phaser-free so it can be imported anywhere, including tests.
 */

export const COLORS = {
  /** Near-black navy backdrop. */
  voidDark: 0x05070f,
  floor: 0x0b1024,
  floorLine: 0x16224c,
  wall: 0x1b2750,
  wallEdge: 0x3d5ba9,

  /** Player + friendly UI. */
  cyan: 0x5ff0ff,
  cyanDeep: 0x1f7d99,
  white: 0xf2fbff,

  /** Echoes (spectral violet). */
  echo: 0xa07bff,
  echoDeep: 0x5a3fb0,

  /** Enemies and hazards. */
  red: 0xff4d5e,
  orange: 0xffa040,

  /** Objectives / Time Core. */
  gold: 0xffd257,
  goldDeep: 0xb37f18,

  /** HUD chrome. */
  hudDim: 0x2a3560,
  hudText: 0xbfd6e6,
  danger: 0xff3355,
} as const;

/**
 * Render layer order (MASTER_GAME_SPEC.md §10 "layer separation").
 * Always use these constants instead of raw numbers.
 */
export const DEPTH = {
  background: 0,
  environment: 10,
  interactable: 20,
  echo: 30,
  player: 40,
  projectile: 50,
  effects: 60,
  hud: 100,
  transition: 200,
} as const;

/** CSS colour string for a palette entry, e.g. for DOM styling. */
export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
