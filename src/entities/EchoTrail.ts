import Phaser from 'phaser';
import { ECHO_VISUALS } from '@/config/balance';
import { COLORS, DEPTH } from '@/config/theme';
import { TEX } from '@/utils/textures';

/**
 * A short afterimage trail behind an Echo.
 *
 * Cheap by construction: a fixed ring of 3 preallocated sprites per Echo, stamped on
 * a timer rather than every frame, faded by arithmetic rather than tweens. Total cost
 * for a level with 3 Echoes is 9 additive sprites.
 *
 * The trail is what makes an Echo read as "a recording playing back" rather than
 * "a second player", which is the whole point of the visual language.
 */
export class EchoTrail {
  private readonly ghosts: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  private sinceStampMs = 0;

  constructor(scene: Phaser.Scene, count: number = ECHO_VISUALS.trailGhosts) {
    for (let i = 0; i < count; i++) {
      this.ghosts.push(
        scene.add
          .image(0, 0, TEX.echo)
          .setDepth(DEPTH.echo - 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(COLORS.echo)
          .setActive(false)
          .setVisible(false),
      );
    }
  }

  /**
   * Advance the trail.
   *
   * @param ownerAlpha Current opacity of the Echo, so the trail fades with it.
   */
  update(x: number, y: number, rotation: number, ownerAlpha: number, deltaMs: number): void {
    this.sinceStampMs += deltaMs;

    if (this.sinceStampMs >= ECHO_VISUALS.trailIntervalMs) {
      this.sinceStampMs = 0;

      const ghost = this.ghosts[this.cursor]!;
      this.cursor = (this.cursor + 1) % this.ghosts.length;

      ghost
        .setPosition(x, y)
        .setRotation(rotation)
        .setScale(0.85)
        .setAlpha(ownerAlpha * ECHO_VISUALS.trailAlpha)
        .setActive(true)
        .setVisible(true);
    }

    // Fade and shrink whatever is on screen. Framerate-independent decay.
    const decay = Math.pow(0.86, deltaMs / 16.667);
    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i]!;
      if (!ghost.active) continue;

      const alpha = ghost.alpha * decay;
      if (alpha < 0.02) {
        ghost.setActive(false).setVisible(false);
        continue;
      }
      ghost.setAlpha(alpha).setScale(ghost.scaleX * decay);
    }
  }

  /** Hide every ghost immediately — used on loop reset and deactivation. */
  clear(): void {
    this.sinceStampMs = 0;
    for (let i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i]!.setActive(false).setVisible(false);
    }
  }

  destroy(): void {
    for (let i = 0; i < this.ghosts.length; i++) {
      this.ghosts[i]!.destroy();
    }
    this.ghosts.length = 0;
  }
}
