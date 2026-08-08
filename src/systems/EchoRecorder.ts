import { EchoAction, type EchoFrame, type EchoSampleState, type EchoTimeline } from '@/types/echo';

/**
 * Slack when comparing the loop clock against an exact scheduled sample time.
 *
 * The clock accumulates deltas (`elapsed += 16.666...`), so after 48 frames it can sit
 * at 799.9999999999999 while slot 48 is scheduled at exactly 800. Without this
 * tolerance that slot slips to the next frame and records a position one frame stale —
 * a small but real desync between an Echo's recorded time and its recorded pose.
 *
 * A nanosecond is far below any meaningful game timing and far above float dust.
 */
const SCHEDULE_EPSILON_MS = 1e-6;

/**
 * Records the player's authoritative state at a fixed sample rate.
 *
 * Design notes (MASTER_GAME_SPEC.md §6):
 * - We record *positions*, not raw inputs. Replaying inputs through physics
 *   accumulates error and desynchronises Echoes.
 * - Sample times are derived from the loop clock (`index * intervalMs`), never
 *   from accumulated frame deltas, so the frame count is identical whether the
 *   game ran at 30, 60 or 144 FPS.
 * - The frame buffer is allocated once and reused across loops, so a normal tick
 *   performs zero allocations.
 * - If several sample slots elapse within one rendered frame, only the first
 *   carries the action mask. Copying it into every slot would make one trigger
 *   pull replay as several shots.
 */
export class EchoRecorder {
  /** Milliseconds between samples. */
  readonly intervalMs: number;
  /** Maximum number of frames this recorder can hold. */
  readonly capacity: number;

  private readonly sampleRateHz: number;
  private readonly buffer: EchoFrame[];
  private nextIndex = 0;

  constructor(durationMs: number, sampleRateHz: number) {
    this.sampleRateHz = sampleRateHz;
    this.intervalMs = 1000 / sampleRateHz;

    // Integer-first form. `durationMs / (1000 / rate)` looks equivalent but rounds
    // badly: 15000 / (1000/60) evaluates just below 900, silently costing a frame.
    // +1 because both endpoints are sampled: t = 0 and t = durationMs.
    this.capacity = Math.floor((durationMs * sampleRateHz) / 1000) + 1;

    this.buffer = new Array<EchoFrame>(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = { time: 0, x: 0, y: 0, rotation: 0, animationState: 0, actionMask: 0 };
    }
  }

  /**
   * Exact scheduled time of sample slot `index`.
   *
   * Rational form on purpose: `index * (1000 / sampleRateHz)` accumulates the rounding
   * error in `1000 / 60`, which can push the final slot a hair past the loop duration
   * so it is never written. `(index * 1000) / rate` is exact for every case we use.
   */
  private scheduledTimeFor(index: number): number {
    return (index * 1000) / this.sampleRateHz;
  }

  /** Number of frames recorded in the current timeline. */
  get frameCount(): number {
    return this.nextIndex;
  }

  get isFull(): boolean {
    return this.nextIndex >= this.capacity;
  }

  /** Discard the current recording and start a new timeline from t = 0. */
  reset(): void {
    this.nextIndex = 0;
  }

  /**
   * Read a recorded frame without copying it.
   *
   * The returned object is the recorder's own buffer entry and will be overwritten on a
   * later loop — read its fields immediately, never retain it. Used by the timeline-reset
   * effect to place its afterimages on the player's genuine recorded path.
   *
   * @param index Frame index, or a negative value counting back from the newest frame
   *   (-1 is the most recent).
   */
  frameAt(index: number): EchoFrame | undefined {
    const resolved = index < 0 ? this.nextIndex + index : index;
    if (resolved < 0 || resolved >= this.nextIndex) return undefined;
    return this.buffer[resolved];
  }

  /**
   * Write every sample slot whose scheduled time has been reached.
   *
   * @param loopTimeMs Current loop time from `LoopClock`.
   * @param state Live player state. Consumed, never retained.
   * @returns How many frames were written this call (0 when between samples).
   */
  sample(loopTimeMs: number, state: EchoSampleState): number {
    let written = 0;

    while (this.nextIndex < this.capacity) {
      const scheduled = this.scheduledTimeFor(this.nextIndex);
      if (scheduled > loopTimeMs + SCHEDULE_EPSILON_MS) break;

      const frame = this.buffer[this.nextIndex]!;
      frame.time = scheduled;
      frame.x = state.x;
      frame.y = state.y;
      frame.rotation = state.rotation;
      frame.animationState = state.animationState;
      // Only the first slot of a catch-up batch fires the actions.
      frame.actionMask = written === 0 ? state.actionMask : EchoAction.None;

      this.nextIndex += 1;
      written += 1;
    }

    return written;
  }

  /**
   * Copy the current recording into a standalone timeline.
   *
   * The returned frames are fresh objects, so the recorder is free to keep
   * reusing its internal buffer for the next loop.
   */
  takeSnapshot(id: number, loopNumber: number): EchoTimeline {
    const frames = new Array<EchoFrame>(this.nextIndex);
    for (let i = 0; i < this.nextIndex; i++) {
      const src = this.buffer[i]!;
      frames[i] = {
        time: src.time,
        x: src.x,
        y: src.y,
        rotation: src.rotation,
        animationState: src.animationState,
        actionMask: src.actionMask,
      };
    }

    return {
      id,
      loopNumber,
      frames,
      durationMs: this.nextIndex > 0 ? frames[this.nextIndex - 1]!.time : 0,
    };
  }
}
