import Phaser from 'phaser';
import { ECHO_VISUALS, WEAPON } from '@/config/balance';
import { COLORS, DEPTH } from '@/config/theme';
import { EchoTrail } from '@/entities/EchoTrail';
import { EchoPlaybackCursor } from '@/systems/EchoPlaybackCursor';
import { AnimationState, EchoAction, type EchoPose, type EchoTimeline } from '@/types/echo';
import type { Interactor } from '@/types/interaction';
import { lerp } from '@/utils/math';
import { TEX } from '@/utils/textures';

/**
 * A replayed past timeline.
 *
 * Intentionally a plain Sprite with **no physics body**: Echo motion is kinematic and
 * authoritative, so neither the player, nor enemies, nor another Echo can push it off
 * its recorded path (MASTER_GAME_SPEC.md §6). Echoes may freely overlap each other.
 *
 * Implements `Interactor`, so to a pressure plate or terminal an Echo is
 * indistinguishable from the live player — that is what makes the Level 1 puzzle work
 * with no special-casing.
 */
export class Echo extends Phaser.GameObjects.Sprite implements Interactor {
  readonly isLivePlayer = false;

  private cursor: EchoPlaybackCursor | null = null;
  private readonly trail: EchoTrail;

  /** Reused pose buffer; playback allocates nothing per frame. */
  private readonly pose: EchoPose = { x: 0, y: 0, rotation: 0, animationState: 0 };

  /** Base opacity for this Echo, derived from its age. */
  private baseAlpha: number = ECHO_VISUALS.alphaNewest;
  /** Cached each tick: false once this timeline's recording has run out. */
  private replaying = false;

  constructor(
    scene: Phaser.Scene,
    private readonly marker: Phaser.GameObjects.Image,
  ) {
    super(scene, 0, 0, TEX.echo);
    scene.add.existing(this);
    this.setDepth(DEPTH.echo);
    this.trail = new EchoTrail(scene);
    this.deactivate();
  }

  /** Timeline id, also used as this interactor's stable id. */
  get interactorId(): number {
    return this.cursor?.timeline.id ?? -1;
  }

  get timelineId(): number {
    return this.interactorId;
  }

  /**
   * True for as long as this slot has a timeline bound to it.
   *
   * An Echo whose recording has run out **holds its final pose and keeps interacting**.
   * This is a deliberate design decision, and it reverses the earlier rule that a finished
   * Echo stopped counting:
   *
   * - It turns the manual reset into a *positioning tool* — "walk onto the plate, press R,
   *   and my past self is standing there" — instead of a waiting game where the player has
   *   to idle on a switch for most of a loop before resetting is worth anything.
   * - It matches the game's fantasy: a timeline that ended standing on a switch left
   *   somebody standing on that switch.
   * - It satisfies the spec's rule that a failed timeline must still feel useful
   *   (MASTER_GAME_SPEC.md §4) rather than evaporating and wasting the loop.
   *
   * `isPresent` stays on the interface because it is still the hook for an unbound slot,
   * and for the boss phase that temporarily hides an Echo (spec §8).
   */
  get isPresent(): boolean {
    return this.active;
  }

  /** True once playback has passed the recording's end and the Echo is holding still. */
  get isHoldingFinalPose(): boolean {
    return this.active && !this.replaying;
  }

  /**
   * Bind a recorded timeline to this Echo slot and play it from the top.
   *
   * @param ageIndex 0 = oldest active Echo.
   * @param total Number of active Echoes, used to fade older timelines back.
   */
  assign(timeline: EchoTimeline, ageIndex: number, total: number): void {
    this.cursor = new EchoPlaybackCursor(timeline);

    // Newest Echo is the most prominent; older ones recede but stay readable.
    const freshness = total <= 1 ? 1 : ageIndex / (total - 1);
    this.baseAlpha = lerp(ECHO_VISUALS.alphaOldest, ECHO_VISUALS.alphaNewest, freshness);

    this.setActive(true).setVisible(true);
    this.marker.setActive(true).setVisible(true).setTint(COLORS.echo);
    this.restart();
  }

  /** Rewind to the start of the loop without unbinding the timeline. */
  restart(): void {
    if (!this.cursor) return;
    this.cursor.reset();
    this.trail.clear();
    this.replaying = true;

    // Brief materialisation so a new timeline announces itself.
    this.setScale(1.6);
    this.setAlpha(0);

    // Snap to the recorded starting mark so the Echo does not visibly slide in from
    // wherever the previous loop left it. `readPoseAt` fires no actions.
    this.cursor.readPoseAt(0, this.pose);
    this.setPosition(this.pose.x, this.pose.y);
    this.setRotation(this.pose.rotation);
  }

  deactivate(): void {
    this.cursor = null;
    this.replaying = false;
    this.trail.clear();
    this.setActive(false).setVisible(false);
    this.marker.setActive(false).setVisible(false);
  }

  /**
   * Advance playback.
   * @returns Bitmask of actions that fired this frame, for the scene to apply.
   */
  tick(loopTimeMs: number, deltaMs: number): number {
    if (!this.cursor) return EchoAction.None;

    const fired = this.cursor.update(loopTimeMs, this.pose);
    const finished = this.cursor.isFinished(loopTimeMs);
    this.replaying = !finished;

    this.setPosition(this.pose.x, this.pose.y);
    this.setRotation(this.pose.rotation);

    // Ease out of the spawn materialisation.
    const k = Math.min(1, deltaMs / 90);
    const dashing = this.pose.animationState === AnimationState.Dash;
    const targetScaleX = dashing ? 1.18 : 1;
    const targetScaleY = dashing ? 0.86 : 1;
    this.setScale(
      this.scaleX + (targetScaleX - this.scaleX) * k,
      this.scaleY + (targetScaleY - this.scaleY) * k,
    );

    // Settle back slightly once the recording ends. Only slightly: the Echo is still
    // standing there and still holding switches, so it must not read as gone.
    const targetAlpha = finished ? this.baseAlpha * 0.8 : this.baseAlpha;
    this.setAlpha(this.alpha + (targetAlpha - this.alpha) * k);

    this.marker.setPosition(this.pose.x, this.pose.y - 26).setAlpha(this.alpha * 0.9);

    // No trail once it has stopped moving — a stationary Echo stamping afterimages on top
    // of itself just looks like a rendering bug.
    if (finished) {
      this.trail.clear();
    } else {
      this.trail.update(this.pose.x, this.pose.y, this.pose.rotation, this.alpha, deltaMs);
    }

    return fired;
  }

  /** World-space muzzle position for a shot fired this frame. */
  get muzzleX(): number {
    return this.pose.x + Math.cos(this.pose.rotation) * WEAPON.muzzleOffset;
  }

  get muzzleY(): number {
    return this.pose.y + Math.sin(this.pose.rotation) * WEAPON.muzzleOffset;
  }

  get aimRotation(): number {
    return this.pose.rotation;
  }

  override destroy(fromScene?: boolean): void {
    this.trail.destroy();
    this.marker.destroy(fromScene);
    super.destroy(fromScene);
  }
}
