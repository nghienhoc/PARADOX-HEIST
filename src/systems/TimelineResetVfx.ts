import Phaser from 'phaser';
import { ACCESSIBILITY, RESET } from '@/config/balance';
import { COLORS, DEPTH } from '@/config/theme';
import type { EffectsSystem } from '@/systems/EffectsSystem';
import type { EchoRecorder } from '@/systems/EchoRecorder';
import { TEX } from '@/utils/textures';

/**
 * The signature timeline-collapse effect (MASTER_GAME_SPEC.md §13, "Timeline reset").
 *
 * Version 1. Deliberately built from cheap parts so it can be polished later without
 * being rewritten:
 *
 * - **No physics rewind.** The afterimages are read straight out of `EchoRecorder`, so
 *   they follow the player's genuine recorded path backwards. Real data, no simulation.
 * - **No full-screen passes.** A camera flash and shake, one shockwave ring, a handful of
 *   pooled shards, and `RESET.ghostCount` sprites. That is the whole effect.
 * - **Preallocated.** The ghost sprites exist for the lifetime of the level; playing the
 *   effect allocates nothing.
 *
 * Everything is driven by an internal clock in `update()` rather than tweens, so the whole
 * effect can be cut short, disabled, or retimed from `RESET` config in one place.
 */
export class TimelineResetVfx {
  private readonly ghosts: Phaser.GameObjects.Image[] = [];
  private elapsedMs = 0;
  private playing = false;
  private activeGhosts = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fx: EffectsSystem,
  ) {
    for (let i = 0; i < RESET.ghostCount; i++) {
      this.ghosts.push(
        scene.add
          .image(0, 0, TEX.player)
          .setDepth(DEPTH.effects - 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(COLORS.cyan)
          .setActive(false)
          .setVisible(false),
      );
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Start the collapse.
   *
   * @param recorder The timeline being collapsed — read backwards for the afterimages.
   * @param x Player position at the moment of collapse.
   * @param manual True for a player-triggered reset, false for a timer expiry (which gets
   *   a slightly heavier impulse, since it is a failure state).
   */
  play(recorder: EchoRecorder, x: number, y: number, rotation: number, manual: boolean): void {
    this.elapsedMs = 0;
    this.playing = true;

    const camera = this.scene.cameras.main;
    const shake = ACCESSIBILITY.shakeScale;

    if (ACCESSIBILITY.reducedMotion) {
      // Reduced motion: keep the readable colour cue, drop shake, zoom and afterimages.
      camera.flash(200, 120, 200, 255, false);
      this.activeGhosts = 0;
      return;
    }

    camera.flash(RESET.freezeMs + 90, 150, 220, 255, false);
    camera.shake(RESET.freezeMs + 140, (manual ? 0.004 : 0.008) * shake);

    // A small inward zoom during the freeze, released as the new loop starts. Cheap, and
    // it does most of the work of making time feel like it snapped.
    this.scene.tweens.add({
      targets: camera,
      zoom: 1.035,
      duration: RESET.freezeMs,
      yoyo: true,
      hold: RESET.rewindMs * 0.4,
      ease: 'Quad.Out',
      onComplete: () => camera.setZoom(1),
    });

    // Shockwave plus a short burst of time shards at the collapse point.
    this.fx.pulse(x, y, COLORS.cyan, 0.35, 4.6, RESET.freezeMs + RESET.rewindMs);
    this.fx.burst(x, y, manual ? 12 : 18, COLORS.cyan, 380, 420, 1.05);

    this.placeGhosts(recorder, x, y, rotation);
  }

  /**
   * Lay the afterimages backwards along the recorded path.
   *
   * Sampling the recording rather than a live trail means the ghosts trace where the
   * player *actually was*, which is what makes the effect read as "this timeline is being
   * rewound" instead of a generic particle puff.
   */
  private placeGhosts(recorder: EchoRecorder, x: number, y: number, rotation: number): void {
    const stride = Math.max(1, Math.round(RESET.ghostSpacingMs / recorder.intervalMs));
    this.activeGhosts = 0;

    for (let i = 0; i < this.ghosts.length; i++) {
      const frame = recorder.frameAt(-1 - (i + 1) * stride);
      const ghost = this.ghosts[i]!;

      // Fall back to the collapse point for a timeline too short to sample.
      const gx = frame?.x ?? x;
      const gy = frame?.y ?? y;
      const gr = frame?.rotation ?? rotation;

      const fade = 1 - i / this.ghosts.length;
      ghost
        .setPosition(gx, gy)
        .setRotation(gr)
        // Stretch along the direction of travel — the "silhouette pulled backward" beat.
        .setScale(1 + i * 0.09, Math.max(0.35, 1 - i * 0.12))
        .setAlpha(0.5 * fade)
        .setActive(true)
        .setVisible(true);

      this.activeGhosts += 1;
    }
  }

  /**
   * Advance the effect. Safe to call every frame whether or not it is playing.
   *
   * Ghosts fade out over the rewind window; nothing here can outlive the transition.
   */
  update(deltaMs: number): void {
    if (!this.playing) return;

    this.elapsedMs += deltaMs;
    const total = RESET.freezeMs + RESET.rewindMs;

    if (this.activeGhosts > 0) {
      // Hold through the freeze, then dissolve across the rewind.
      const rewindT = Math.min(
        1,
        Math.max(0, (this.elapsedMs - RESET.freezeMs) / RESET.rewindMs),
      );
      for (let i = 0; i < this.activeGhosts; i++) {
        const ghost = this.ghosts[i]!;
        const fade = 1 - i / this.ghosts.length;
        ghost.setAlpha(0.5 * fade * (1 - rewindT));
      }
    }

    if (this.elapsedMs >= total) this.stop();
  }

  /** Hide everything immediately. Used on level restart and scene shutdown. */
  stop(): void {
    this.playing = false;
    this.elapsedMs = 0;
    for (let i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i]!.setActive(false).setVisible(false);
    }
    this.activeGhosts = 0;
  }

  /** Materialisation flash for the new timeline's Echo. */
  playMaterialise(x: number, y: number): void {
    if (ACCESSIBILITY.reducedMotion) return;
    this.fx.pulse(x, y, COLORS.echo, 2.8, 0.3, RESET.materialiseMs + 120);
    this.fx.burst(x, y, 6, COLORS.echo, 160, 240, 0.7);
  }

  destroy(): void {
    for (let i = 0; i < this.ghosts.length; i++) this.ghosts[i]!.destroy();
    this.ghosts.length = 0;
  }
}
