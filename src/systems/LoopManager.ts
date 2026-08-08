import { LOOP } from '@/config/balance';
import type { EchoSampleState, EchoTimeline } from '@/types/echo';
import type { TimelineConfig } from '@/types/level';
import { EchoRecorder } from '@/systems/EchoRecorder';
import { LoopClock } from '@/systems/LoopClock';

/**
 * Owns the timeline lifecycle: the loop clock, the live recording, and the archive of
 * finished timelines that become Echoes.
 *
 * Phaser-free on purpose — the scene drives it and reads state back out, which keeps
 * the whole loop mechanic unit testable.
 *
 * Loop duration and Echo count come from the **level**, not from global constants.
 */
export class LoopManager {
  readonly clock: LoopClock;
  readonly recorder: EchoRecorder;
  readonly maxEchoes: number;
  readonly loopDurationMs: number;

  /**
   * Frames committed by the most recent `tick`. Zero when the tick fell between two
   * sample slots — callers use this to know when it is safe to clear the player's
   * buffered actions.
   */
  samplesWritten = 0;

  /**
   * How many old timelines the most recent `closeTimeline()` discarded to stay within
   * `maxEchoes`. The HUD surfaces this so hitting the cap is never silent.
   */
  evictedOnLastClose = 0;

  private readonly archive: EchoTimeline[] = [];
  private nextTimelineId = 1;

  constructor(timeline: TimelineConfig, sampleRateHz: number = LOOP.sampleRateHz) {
    this.loopDurationMs = timeline.loopDurationMs;
    this.maxEchoes = timeline.maxEchoes;
    this.clock = new LoopClock(timeline.loopDurationMs);
    this.recorder = new EchoRecorder(timeline.loopDurationMs, sampleRateHz);
  }

  /** Finished timelines, oldest first. */
  get timelines(): readonly EchoTimeline[] {
    return this.archive;
  }

  get loopNumber(): number {
    return this.clock.loopNumber;
  }

  get echoCount(): number {
    return this.archive.length;
  }

  get isAtEchoCap(): boolean {
    return this.archive.length >= this.maxEchoes;
  }

  /**
   * Timelines archived over the whole run, including ones later evicted by the Echo cap.
   * This is the "Echoes created" run statistic, distinct from the live `echoCount`.
   */
  get totalTimelinesCreated(): number {
    return this.nextTimelineId - 1;
  }

  /**
   * Record frame 0 with the loop's true starting state.
   *
   * Must be called once at the start of every loop, before the first `tick`. Without
   * it, frame 0 gets written by the first tick — which has *already* advanced the
   * clock — so the Echo's starting mark would be the player's position one frame after
   * spawn rather than at spawn. Small in pixels, but it is exactly the value
   * "all Echoes start synchronised at time 0" depends on.
   *
   * Safe to call twice: it does nothing once the recording has started.
   */
  primeRecording(state: EchoSampleState): void {
    if (this.recorder.frameCount > 0) return;
    this.samplesWritten = this.recorder.sample(0, state);
  }

  /**
   * Advance the clock by `deltaMs` and record one sample of the live player.
   *
   * @returns `true` on the tick where the loop runs out of time.
   */
  tick(deltaMs: number, state: EchoSampleState): boolean {
    const expired = this.clock.advance(deltaMs);
    this.samplesWritten = this.recorder.sample(this.clock.elapsedMs, state);
    return expired;
  }

  /**
   * Close the current timeline, archive it as an Echo, and start the next loop.
   *
   * When the archive is already at `maxEchoes` the **oldest** timeline is discarded so
   * the timeline just recorded is always kept — losing the loop you just played would
   * be the more confusing behaviour.
   *
   * @returns The archived timeline, or `null` if nothing was recorded.
   */
  closeTimeline(): EchoTimeline | null {
    let archived: EchoTimeline | null = null;
    this.evictedOnLastClose = 0;

    if (this.recorder.frameCount > 0) {
      archived = this.recorder.takeSnapshot(this.nextTimelineId, this.clock.loopNumber);
      this.nextTimelineId += 1;
      this.archive.push(archived);

      while (this.archive.length > this.maxEchoes) {
        this.archive.shift();
        this.evictedOnLastClose += 1;
      }
    }

    this.recorder.reset();
    this.clock.restart();
    return archived;
  }

  /** Wipe all timeline data. Used when entering or restarting a level. */
  clear(): void {
    this.archive.length = 0;
    this.nextTimelineId = 1;
    this.samplesWritten = 0;
    this.evictedOnLastClose = 0;
    this.recorder.reset();
    this.clock.resetToFirstLoop();
  }

  /** Total recorded frames across all Echoes — used by the debug overlay. */
  get totalArchivedFrames(): number {
    let total = 0;
    for (let i = 0; i < this.archive.length; i++) {
      total += this.archive[i]!.frames.length;
    }
    return total;
  }
}
