/**
 * A tiny read-only window onto live game state, for automated browser tests and
 * hands-on debugging.
 *
 * Why this exists: the unit tests cover the timeline and interaction logic in
 * isolation, but they cannot prove the *wiring* — that a reset really produces one
 * Echo in a real browser, or that walking into the Time Core really collects it. The
 * browser smoke test reads this snapshot to assert those end-to-end, and to steer the
 * player accurately instead of guessing at key-hold durations.
 *
 * Deliberately:
 * - **Read-only.** Nothing here can change game state, so it is not a cheat surface.
 * - **Allocation-free.** One module-level object, updated in place each frame.
 * - **Namespaced.** Lives at `window.paradoxHeist.state`.
 *
 * It ships in production builds on purpose, so the smoke test exercises the same
 * bundle players get. It is a handful of numbers; keep it that way.
 */
export interface TelemetryState {
  loopNumber: number;
  echoCount: number;
  maxEchoes: number;
  loopRemainingMs: number;
  loopDurationMs: number;
  playerX: number;
  playerY: number;
  coreX: number;
  coreY: number;
  coreCollected: boolean;
  levelComplete: boolean;
}

const state: TelemetryState = {
  loopNumber: 0,
  echoCount: 0,
  maxEchoes: 0,
  loopRemainingMs: 0,
  loopDurationMs: 0,
  playerX: 0,
  playerY: 0,
  coreX: 0,
  coreY: 0,
  coreCollected: false,
  levelComplete: false,
};

/** The live snapshot. Mutated in place — read fields, never retain the object. */
export function telemetry(): TelemetryState {
  return state;
}

/** Expose the snapshot on `window`. Call once at scene start. */
export function installTelemetry(): void {
  (globalThis as unknown as Record<string, unknown>).paradoxHeist = { state };
}
