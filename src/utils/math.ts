/** Small allocation-free math helpers. Phaser-free so tests can use them directly. */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wrap an angle (radians) into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

/** Interpolate between two angles along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/**
 * Clamp a frame delta so a long stall (tab switch, GC pause, breakpoint) can never
 * fast-forward the simulation. See MASTER_GAME_SPEC.md §17 "Simulation".
 */
export function clampDelta(deltaMs: number, maxDeltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return 0;
  return deltaMs > maxDeltaMs ? maxDeltaMs : deltaMs;
}

/** Format milliseconds as `S.mm` (e.g. 7.42) for the loop timer readout. */
export function formatSeconds(ms: number): string {
  const clamped = ms < 0 ? 0 : ms;
  return (clamped / 1000).toFixed(2);
}
