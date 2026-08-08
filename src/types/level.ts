import { LOOP } from '@/config/balance';
import type { ScoringConfig } from '@/systems/LevelRun';

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

/** A pressure plate. Position is its centre. */
export interface SwitchDef {
  id: string;
  x: number;
  y: number;
  /** Activation radius; falls back to `OBJECTIVE.switchRadius`. */
  radius?: number;
}

/** A security door. Position is its top-left corner, like a wall. */
export interface DoorDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Switches that must **all** be held for this door to open. Multiple ids give the
   * simultaneous-switch puzzles later levels need, with no code change.
   */
  switchIds: string[];
}

/** The extraction pad. Position is its centre. */
export interface ExtractionDef {
  x: number;
  y: number;
  /** Activation radius; falls back to `OBJECTIVE.extractionRadius`. */
  radius?: number;
}

/**
 * Per-level timeline rules.
 *
 * These are deliberately **not** global constants. A tight 15-second loop with four
 * Echoes and a roomy 30-second loop with two are different puzzles, and the level is the
 * only thing that knows which it wants. Every consumer (loop clock, recorder, Echo pool,
 * HUD) reads these values from the active level.
 */
export interface TimelineConfig {
  /** Length of one timeline, in milliseconds. */
  loopDurationMs: number;
  /**
   * Maximum simultaneously replaying Echoes.
   *
   * When the player exceeds this, the **oldest timeline is discarded** (FIFO) and the new
   * one takes its place. This keeps the behaviour predictable — the player never loses the
   * timeline they just recorded — and keeps memory and draw cost bounded. The HUD
   * announces the eviction so it is never silent.
   */
  maxEchoes: number;
}

export interface LevelDef {
  id: string;
  /** Short display title, e.g. "FIRST ECHO". */
  name: string;
  /** Room size in pixels; also the camera bounds. */
  width: number;
  height: number;
  timeline: TimelineConfig;
  scoring: ScoringConfig;
  playerSpawn: Vec2Def;
  /** Time Core position — the thing to steal. */
  core: Vec2Def;
  extraction: ExtractionDef;
  /**
   * When true, collecting the Time Core immediately completes the level. Levels with an
   * extraction pad set this false, so the pickup is per-loop and every reset restores the
   * Core until the player actually gets out.
   */
  completeOnCoreCollected: boolean;
  walls: WallDef[];
  switches: SwitchDef[];
  doors: DoorDef[];
}

/** Problems found while validating level data. Empty array means the level is valid. */
export type LevelValidationErrors = string[];

/**
 * Validate level data before it reaches the scene.
 * Returns a list of human-readable problems rather than throwing, so callers can decide
 * between a loud development error and a safe fallback.
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

  // --- Scoring ---
  if (!Number.isInteger(level.scoring.parTimelines) || level.scoring.parTimelines < 1) {
    errors.push(`Level "${level.id}" has parTimelines=${level.scoring.parTimelines}; must be >= 1.`);
  }
  if (!(level.scoring.parTimeMs > 0)) {
    errors.push(`Level "${level.id}" has parTimeMs=${level.scoring.parTimeMs}; must be > 0.`);
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
  if (!inBounds(level.extraction)) {
    errors.push(`Extraction (${level.extraction.x}, ${level.extraction.y}) is out of bounds.`);
  }

  level.walls.forEach((wall, index) => {
    if (wall.w <= 0 || wall.h <= 0) {
      errors.push(`Wall #${index} has a non-positive size (${wall.w}x${wall.h}).`);
    }
  });

  // --- Switches ---
  const switchIds = new Set<string>();
  level.switches.forEach((sw, index) => {
    if (!sw.id) errors.push(`Switch #${index} has an empty id.`);
    if (switchIds.has(sw.id)) errors.push(`Duplicate switch id "${sw.id}".`);
    switchIds.add(sw.id);
    if (!inBounds(sw)) errors.push(`Switch "${sw.id}" (${sw.x}, ${sw.y}) is out of bounds.`);
    if (sw.radius !== undefined && sw.radius <= 0) {
      errors.push(`Switch "${sw.id}" has a non-positive radius (${sw.radius}).`);
    }
  });

  // --- Doors ---
  const doorIds = new Set<string>();
  level.doors.forEach((door, index) => {
    if (!door.id) errors.push(`Door #${index} has an empty id.`);
    if (doorIds.has(door.id)) errors.push(`Duplicate door id "${door.id}".`);
    doorIds.add(door.id);

    if (door.w <= 0 || door.h <= 0) {
      errors.push(`Door "${door.id}" has a non-positive size (${door.w}x${door.h}).`);
    }
    if (door.switchIds.length === 0) {
      // A door with no switch can never open, which is almost always a data mistake.
      errors.push(`Door "${door.id}" references no switches, so it can never open.`);
    }
    for (const switchId of door.switchIds) {
      if (!switchIds.has(switchId)) {
        errors.push(`Door "${door.id}" references unknown switch "${switchId}".`);
      }
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
