import Phaser from 'phaser';
import { COLORS, DEPTH } from '@/config/theme';
import { TEX } from '@/utils/textures';

/**
 * Visual half of a pressure switch. Holds no rules — driven by
 * `PressureSwitch.onStateChange`.
 *
 * Two separate textures rather than a tint swap, so "nobody on it" and "held" are
 * unmistakable at a glance even with several Echoes crowding the plate.
 */
export class PressureSwitchView {
  private readonly off: Phaser.GameObjects.Image;
  private readonly on: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private pulse: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    radius: number,
  ) {
    // Scale the art to the level's activation radius so the visual never lies about reach.
    const scale = (radius * 2) / 72;

    this.glow = scene.add
      .image(x, y, TEX.glow)
      .setDepth(DEPTH.interactable - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.cyan)
      .setScale(radius / 22)
      .setAlpha(0);

    this.off = scene.add
      .image(x, y, TEX.switchOff)
      .setDepth(DEPTH.interactable)
      .setScale(scale);

    this.on = scene.add
      .image(x, y, TEX.switchOn)
      .setDepth(DEPTH.interactable)
      .setScale(scale)
      .setAlpha(0)
      .setVisible(false);
  }

  setHeld(held: boolean): void {
    this.off.setVisible(!held);
    this.on.setVisible(held);
    this.on.setAlpha(held ? 1 : 0);

    this.pulse?.remove();
    this.pulse = null;

    if (!held) {
      this.glow.setAlpha(0);
      this.on.setScale(this.off.scaleX);
      return;
    }

    // A quick overshoot on activation, then a slow breathing glow while held — the plate
    // should look like it is actively doing something.
    const base = this.off.scaleX;
    this.on.setScale(base * 1.25);
    this.scene.tweens.add({
      targets: this.on,
      scale: base,
      duration: 180,
      ease: 'Back.Out',
    });

    this.glow.setAlpha(0.5);
    this.pulse = this.scene.tweens.add({
      targets: this.glow,
      alpha: 0.85,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }
}
