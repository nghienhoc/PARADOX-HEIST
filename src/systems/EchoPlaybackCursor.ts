import { EchoAction, type EchoFrame, type EchoPose, type EchoTimeline } from '@/types/echo';
import { clamp, lerp, lerpAngle } from '@/utils/math';

/**
 * Replays one recorded timeline against the current loop clock.
 *
 * Guarantees (MASTER_GAME_SPEC.md §6):
 * - Playback is kinematic and authoritative: the pose is read from the recording,
 *   never simulated, so nothing in the world can push an Echo off its path.
 * - Every recorded action fires exactly once. Action frames are consumed by a
 *   monotonic cursor, so neither interpolation nor a long frame can duplicate or skip
 *   an event.
 * - Positions are interpolated between samples, so Echoes stay smooth even when the
 *   display refresh rate does not match the 60 Hz sample rate.
 */
export class EchoPlaybackCursor {
  /** Index of the next frame whose actions have not fired yet. */
  private actionIndex = 0;
  /** Index of the frame at or before the current time, for pose interpolation. */
  private poseIndex = 0;

  constructor(readonly timeline: EchoTimeline) {}

  /** Rewind to the start of the loop. Must be called on every world reset. */
  reset(): void {
    this.actionIndex = 0;
    this.poseIndex = 0;
  }

  /** True once the clock has passed the end of the recording. */
  isFinished(loopTimeMs: number): boolean {
    return loopTimeMs >= this.timeline.durationMs;
  }

  /**
   * Advance playback to `loopTimeMs`.
   *
   * @param outPose Reused output object; written in place to avoid allocation.
   * @returns Bitmask of `EchoAction`s that became due since the previous call.
   */
  update(loopTimeMs: number, outPose: EchoPose): number {
    const frames = this.timeline.frames;
    if (frames.length === 0) return EchoAction.None;

    // --- Fire due actions, each exactly once. ---
    let firedMask = EchoAction.None;
    while (this.actionIndex < frames.length && frames[this.actionIndex]!.time <= loopTimeMs) {
      firedMask |= frames[this.actionIndex]!.actionMask;
      this.actionIndex += 1;
    }

    // --- Interpolate the pose. The index only ever moves forward. ---
    while (this.poseIndex + 1 < frames.length && frames[this.poseIndex + 1]!.time <= loopTimeMs) {
      this.poseIndex += 1;
    }
    writePose(frames, this.poseIndex, loopTimeMs, outPose);

    return firedMask;
  }

  /**
   * Read the pose at an arbitrary time **without** advancing any cursor or firing any
   * action.
   *
   * Used to place an Echo on its recorded starting mark at spawn. Deliberately
   * separate from `update`, so setup code can never consume action frames — doing that
   * by accident is exactly how duplicate-shot bugs get reintroduced.
   *
   * Linear scan: intended for setup, not for per-frame use.
   */
  readPoseAt(loopTimeMs: number, outPose: EchoPose): void {
    const frames = this.timeline.frames;
    if (frames.length === 0) return;

    let index = 0;
    while (index + 1 < frames.length && frames[index + 1]!.time <= loopTimeMs) {
      index += 1;
    }
    writePose(frames, index, loopTimeMs, outPose);
  }
}

/** Interpolate between `frames[index]` and its successor into `outPose`. */
function writePose(
  frames: readonly EchoFrame[],
  index: number,
  loopTimeMs: number,
  outPose: EchoPose,
): void {
  const current = frames[index]!;
  const next = frames[index + 1];

  if (next === undefined) {
    outPose.x = current.x;
    outPose.y = current.y;
    outPose.rotation = current.rotation;
    outPose.animationState = current.animationState;
    return;
  }

  const span = next.time - current.time;
  const t = span > 0 ? clamp((loopTimeMs - current.time) / span, 0, 1) : 0;

  outPose.x = lerp(current.x, next.x, t);
  outPose.y = lerp(current.y, next.y, t);
  outPose.rotation = lerpAngle(current.rotation, next.rotation, t);
  // Animation state is discrete — do not blend it.
  outPose.animationState = current.animationState;
}
