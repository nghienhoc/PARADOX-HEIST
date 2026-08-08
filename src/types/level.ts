import { LOOP } from '@/config/balance';

/** Level data model. Levels are declared as data, never hardcoded in scene code. */

export interface Vec2Def {
  x: number;
  y: number;
}

/** An axis-aligned solid block, positioned by its top-left corner. */
export interface WallDef {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Per-level timeline rules.
 *
 * These are deliberately **not** global constants. A tight 15-second loop with four
 * Echoes and a roomy 30-second loop with two are different puzzles, and the level is
 * the only thing that knows which it wants. Every consumer (loop clock, recorder,
 * Echo pool, HUD) reads these values from the active level.
 */
export interface TimelineConfig {
  /** Length of one timeline, in milliseconds. */
  loopDurationMs: number;
  /**
   * Maximum simultaneously replaying Echoes.
   *
   * When the player exceeds this, the **oldest timeline is discarded** (FIFO) and the
   * new one takes its place. This keeps the behaviour predictable — the player never
   * loses the timeline they just recorded — and keeps memory and draw cost bounded.
   * The HUD announces the eviction so it is never silent.
   */
  maxEchoes: number;
}

export interface LevelDef {
  id: string;
  /** Short display title, e.g. "01 — FIRST ECHO". */
  name: string;
  /** One-line contextual objective shown in the HUD. */
  objective: string;
  /** Room size in pixels; also the camera bounds. */
  width: number;
  height: number;
  timeline: TimelineConfig;
  playerSpawn: Vec2Def;
  /** Time Core position — the level's goal. */
  core: Vec2Def;
  /**
   * When true, collecting the Time Core permanently completes the level. When false
   * the pickup is per-loop and every reset restores the Core — the mode used once a
   * level requires carrying the Core to an extraction point.
   */
  completeOnCoreCollected: boolean;
  walls: WallDef[];
}

/** Problems found while validating level data. Empty array means the level is valid. */
export type LevelValidationErrors = string[];

/**
 * Validate level data before it reaches the scene.
 * Returns a list of human-readable problems rather than throwing, so callers can
 * decide between a loud development error and a safe fallback.
 */
export function validateLevel(level: LevelDef): LevelValidationErrors {
  const errors: LevelValidationErrors = [];

  if (!level.id) errors.push('Level id is empty.');
  if (level.width <= 0 || level.height <= 0) {
    errors.push(`Level "${level.id}" has a non-positive size (${level.width}x${level.height}).`);
  }

  // --- Timeline config ---
  const { loopDurationMs, maxEchoes } = level.timeline;
  const sampleIntervalMs = 1000 / LOOP.sampleRateHz;

  if (!Number.isFinite(loopDurationMs) || loopDurationMs < sampleIntervalMs) {
    errors.push(
      `Level "${level.id}" has loopDurationMs=${loopDurationMs}; it must be at least one sample interval (${sampleIntervalMs.toFixed(2)}ms).`,
    );
  }
  if (!Number.isInteger(maxEchoes) || maxEchoes < 1) {
    errors.push(`Level "${level.id}" has maxEchoes=${maxEchoes}; it must be an integer >= 1.`);
  } else if (maxEchoes > LOOP.echoHardCap) {
    errors.push(
      `Level "${level.id}" requests maxEchoes=${maxEchoes}, above the engine hard cap of ${LOOP.echoHardCap}.`,
    );
  }

  // --- Geometry ---
  const inBounds = (p: Vec2Def): boolean =>
    p.x >= 0 && p.y >= 0 && p.x <= level.width && p.y <= level.height;

  if (!inBounds(level.playerSpawn)) {
    errors.push(`Player spawn (${level.playerSpawn.x}, ${level.playerSpawn.y}) is out of bounds.`);
  }
  if (!inBounds(level.core)) {
    errors.push(`Time Core (${level.core.x}, ${level.core.y}) is out of bounds.`);
  }

  level.walls.forEach((wall, index) => {
    if (wall.w <= 0 || wall.h <= 0) {
      errors.push(`Wall #${index} has a non-positive size (${wall.w}x${wall.h}).`);
    }
  });

  return errors;
}

/**
 * Frames a full timeline of this level will record.
 *
 * Integer-first, matching `EchoRecorder.capacity` exactly — the naive
 * `durationMs / (1000 / rate)` form rounds badly and disagrees by one frame.
 */
export function expectedFrameCount(timeline: TimelineConfig): number {
  return Math.floor((timeline.loopDurationMs * LOOP.sampleRateHz) / 1000) + 1;
}
