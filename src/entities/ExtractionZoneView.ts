import Phaser from 'phaser';
import { COLORS, DEPTH } from '@/config/theme';
import { TEX } from '@/utils/textures';

/**
 * Visual half of the extraction pad. Holds no rules — driven by
 * `ExtractionZone.onArmedChange`.
 *
 * Disarmed it is a dim outline the player learns to ignore; armed it becomes the
 * brightest thing in the room, so "where do I go now" never needs a text prompt.
 */
export class ExtractionZoneView {
  private readonly pad: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private spin: Phaser.Tweens.Tween | null = null;
  private pulse: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    radius: number,
  ) {
    const scale = (radius * 2) / 120;

    this.glow = scene.add
      .image(x, y, TEX.glow)
      .setDepth(DEPTH.interactable - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.cyan)
      .setScale(radius / 20)
      .setAlpha(0);

    this.pad = scene.add
      .image(x, y, TEX.extractionPad)
      .setDepth(DEPTH.interactable)
      .setScale(scale)
      .setTint(COLORS.hudDim)
      .setAlpha(0.55);

    this.setArmed(false);
  }

  setArmed(armed: boolean): void {
    this.spin?.remove();
    this.pulse?.remove();
    this.spin = null;
    this.pulse = null;

    if (!armed) {
      this.pad.setTint(COLORS.hudDim).setAlpha(0.55).setAngle(0);
      this.glow.setAlpha(0);
      return;
    }

    this.pad.setTint(COLORS.gold).setAlpha(1);
    this.spin = this.scene.tweens.add({
      targets: this.pad,
      angle: 360,
      duration: 6_000,
      repeat: -1,
      ease: 'Linear',
    });

    this.glow.setAlpha(0.45);
    this.pulse = this.scene.tweens.add({
      targets: this.glow,
      alpha: 0.9,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }
}
