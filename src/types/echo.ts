/**
 * Echo timeline data model.
 *
 * This module is intentionally Phaser-free: the recording/playback core is pure
 * data + math so it can be unit tested in plain Node (see `tests/`).
 */

/**
 * Discrete one-shot actions a timeline can carry, packed into a bitmask so a
 * single frame can hold several simultaneous events without allocating.
 */
export enum EchoAction {
  None = 0,
  Shoot = 1 << 0,
  Interact = 1 << 1,
  Dash = 1 << 2,
  EMP = 1 << 3,
  Pickup = 1 << 4,
  Drop = 1 << 5,
}

/** High-level visual state, recorded so Echoes can reuse player animations. */
export enum AnimationState {
  Idle = 0,
  Move = 1,
  Dash = 2,
}

/** One authoritative sample of the player's state at a fixed point in the loop. */
export interface EchoFrame {
  /** Milliseconds since the start of the loop this frame belongs to. */
  time: number;
  x: number;
  y: number;
  /** Aim direction in radians. */
  rotation: number;
  animationState: number;
  /** Bitmask of `EchoAction` values triggered exactly at this frame. */
  actionMask: number;
}

/** A complete, finished recording of one timeline. */
export interface EchoTimeline {
  /** Monotonic id, unique for the lifetime of the level. */
  id: number;
  /** Which loop produced this timeline (1-based). */
  loopNumber: number;
  /** Sampled frames, ordered by ascending `time`. */
  frames: EchoFrame[];
  /** Time of the last recorded frame, in milliseconds. */
  durationMs: number;
}

/** Live player state handed to the recorder each tick. */
export interface EchoSampleState {
  x: number;
  y: number;
  rotation: number;
  animationState: number;
  /** Actions triggered since the previous tick. */
  actionMask: number;
}

/** Interpolated Echo pose produced during playback. Reused, never allocated per frame. */
export interface EchoPose {
  x: number;
  y: number;
  rotation: number;
  animationState: number;
}
