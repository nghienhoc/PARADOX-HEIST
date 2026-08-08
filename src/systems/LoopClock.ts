import { clamp } from '@/utils/math';

/**
 * The authoritative clock for a single timeline.
 *
 * Everything that must stay synchronised with the loop (recording, Echo playback,
 * HUD, world resets) reads its time from here rather than from Phaser's clock, so
 * pausing and restarting is a single well-defined operation.
 */
export class LoopClock {
  /** Milliseconds elapsed in the current loop, clamped to `durationMs`. */
  elapsedMs = 0;
  /** 1-based index of the current loop. */
  loopNumber = 1;
  paused = false;

  private expired = false;

  constructor(readonly durationMs: number) {}

  /**
   * Advance the clock.
   * @returns `true` on the single tick where the loop reaches its end.
   */
  advance(deltaMs: number): boolean {
    if (this.paused || this.expired) return false;

    this.elapsedMs += deltaMs;
    if (this.elapsedMs >= this.durationMs) {
      this.elapsedMs = this.durationMs;
      this.expired = true;
      return true;
    }
    return false;
  }

  /** Begin the next loop. Increments `loopNumber`. */
  restart(): void {
    this.elapsedMs = 0;
    this.expired = false;
    this.loopNumber += 1;
  }

  /** Return to loop 1 from a clean slate (level start / level change). */
  resetToFirstLoop(): void {
    this.elapsedMs = 0;
    this.expired = false;
    this.loopNumber = 1;
  }

  get remainingMs(): number {
    return this.durationMs - this.elapsedMs;
  }

  /** 0 at the start of the loop, 1 at the end. */
  get progress(): number {
    return clamp(this.elapsedMs / this.durationMs, 0, 1);
  }

  get isExpired(): boolean {
    return this.expired;
  }
}
