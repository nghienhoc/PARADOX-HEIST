import Phaser from 'phaser';
import { COLORS, DEPTH } from '@/config/theme';
import { TEX } from '@/utils/textures';

/**
 * Visual half of the Time Core. Driven by `TimeCore`'s callbacks — it holds no rules,
 * which is what keeps the pickup logic unit testable without a renderer.
 */
export class TimeCoreView {
  private readonly core: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly floatTween: Phaser.Tweens.Tween;
  private readonly spinTween: Phaser.Tweens.Tween;
  private readonly pulseTween: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
  ) {
    this.glow = scene.add
      .image(x, y, TEX.glow)
      .setDepth(DEPTH.interactable - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.gold)
      .setScale(1.4)
      .setAlpha(0.5);

    this.core = scene.add.image(x, y, TEX.core).setDepth(DEPTH.interactable);

    // Levitation, spin and a breathing glow — the Core should read as the one thing in
    // the room worth crossing it for.
    this.floatTween = scene.tweens.add({
      targets: [this.core, this.glow],
      y: y - 10,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    this.spinTween = scene.tweens.add({
      targets: this.core,
      angle: 360,
      duration: 9000,
      repeat: -1,
      ease: 'Linear',
    });
    this.pulseTween = scene.tweens.add({
      targets: this.glow,
      alpha: 0.85,
      scale: 1.7,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  /** Play the collection beat and hide the Core. */
  showCollected(): void {
    this.setVisible(false);
  }

  /** Put the Core back on its pedestal (loop reset). */
  showRestored(): void {
    this.setVisible(true);
    this.core.setScale(1.8).setAlpha(0);
    this.scene.tweens.add({
      targets: this.core,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.Out',
    });
  }

  private setVisible(visible: boolean): void {
    this.core.setVisible(visible);
    this.glow.setVisible(visible);
    if (visible) {
      this.floatTween.resume();
      this.spinTween.resume();
      this.pulseTween.resume();
    } else {
      this.floatTween.pause();
      this.spinTween.pause();
      this.pulseTween.pause();
    }
  }
}
