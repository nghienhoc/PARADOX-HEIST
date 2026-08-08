/**
 * All gameplay tuning values live here. Nothing else in the codebase should
 * hardcode a speed, cooldown or duration.
 */

/**
 * Engine-level timeline constants.
 *
 * IMPORTANT: loop duration and Echo count are **per level**, not global — they live
 * in `LevelDef.timeline` (see `src/types/level.ts`). Only values that are genuinely
 * the same for every level belong here. Never reintroduce a global `durationMs` or
 * `maxEchoes`; every consumer must read them from the active level.
 */
export const LOOP = {
  /** Timeline sampling rate. 60 Hz over 20 s => 1201 frames. */
  sampleRateHz: 60,
  /** Delta clamp; ~3 frames at 60 FPS. */
  maxDeltaMs: 50,
  /** Remaining time at which the HUD switches to its warning state. */
  warningMs: 5_000,
  /** Hard ceiling on Echoes any level may request, so pools stay bounded. */
  echoHardCap: 8,
} as const;

/**
 * The signature timeline-collapse transition.
 *
 * Total budget is deliberately at the low end of the spec's 0.5–0.8s window: looping is
 * the core verb of the game, and a reset the player performs dozens of times per level
 * must never feel like waiting. The world reset happens at `freezeMs + rewindMs`; the
 * materialise phase after it is purely cosmetic and does not block play.
 */
export const RESET = {
  /** Time hangs before the collapse — the "hit stop" that sells the rewind. */
  freezeMs: 110,
  /** Stylised rewind: shockwave plus backward afterimages along the recorded path. */
  rewindMs: 330,
  /** New timeline materialises. Gameplay is already live during this. */
  materialiseMs: 140,
  /** Afterimages sampled backwards along the timeline just recorded. */
  ghostCount: 5,
  /** Spacing between afterimage samples, in recorded milliseconds. */
  ghostSpacingMs: 90,
} as const;

/** Total time from reset trigger to the new loop starting. */
export const RESET_TOTAL_MS = RESET.freezeMs + RESET.rewindMs;

export const OBJECTIVE = {
  /** How close the player must get to collect the Time Core, px. */
  coreCollectRadius: 34,
  /** Default pressure-plate radius; a level may override per switch. */
  switchRadius: 34,
  /** Default extraction-pad radius; a level may override. */
  extractionRadius: 44,
} as const;

/**
 * Accessibility toggles (MASTER_GAME_SPEC.md §19).
 *
 * Module-level for now so effect code can already branch on them. A settings menu will
 * drive these later; until then `reducedMotion` is the switch that strips the reset
 * transition down to a plain fade with no shake, zoom or afterimages.
 */
export const ACCESSIBILITY = {
  reducedMotion: false,
  /** Multiplier applied to every camera shake. 0 disables shake entirely. */
  shakeScale: 1,
} as const;

export const ECHO_VISUALS = {
  /** Afterimages per Echo. Small on purpose — cost scales with maxEchoes. */
  trailGhosts: 3,
  /** Milliseconds between afterimage stamps. */
  trailIntervalMs: 70,
  /** Opacity of a freshly stamped afterimage, relative to its Echo's alpha. */
  trailAlpha: 0.42,
  /** Opacity of the oldest Echo. Newer Echoes interpolate up to `alphaNewest`. */
  alphaOldest: 0.42,
  alphaNewest: 0.8,
} as const;

export const PLAYER = {
  speed: 260,
  /** Time to reach full speed, ms. Low = responsive, not slippery. */
  accelMs: 70,
  /** Time to stop from full speed, ms. */
  decelMs: 60,
  radius: 13,
  maxHealth: 3,
} as const;

export const DASH = {
  speed: 780,
  durationMs: 130,
  cooldownMs: 700,
  /** Window after pressing dash during which the input stays buffered. */
  bufferMs: 120,
} as const;

export const WEAPON = {
  cooldownMs: 140,
  projectileSpeed: 820,
  projectileLifeMs: 1_200,
  /** Hard cap on live projectiles; the pool never grows past this. */
  maxProjectiles: 96,
  /** Muzzle offset from the player centre, px. */
  muzzleOffset: 18,
  /** Backwards kick applied to the shooter, px/s. */
  recoil: 60,
} as const;

export const EFFECTS = {
  /** Pooled particle sprites. Spec budget: ~150 normal-gameplay particles. */
  maxParticles: 150,
  shakeDefault: 0.004,
} as const;
