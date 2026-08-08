import Phaser from 'phaser';
import { COLORS, DEPTH, toCss } from '@/config/theme';

export interface DebugStats {
  projectiles: number;
  particles: number;
  echoes: number;
  echoFrames: number;
}

/**
 * Development-only performance overlay (F3).
 *
 * Never shown in a production build: `main.ts` only installs it when
 * `import.meta.env.DEV` is true, so the whole thing tree-shakes out of `dist`.
 * Text is refreshed 5x/second rather than per frame to keep its own cost invisible.
 */
export class DebugOverlay {
  private readonly text: Phaser.GameObjects.Text;
  private accumulatorMs = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      .text(24, 104, '', {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '12px',
        color: toCss(COLORS.hudText),
        backgroundColor: 'rgba(5,7,15,0.7)',
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);

    scene.input.keyboard?.on('keydown-F3', this.toggle, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.keyboard?.off('keydown-F3', this.toggle, this);
    });
  }

  private toggle(): void {
    this.text.setVisible(!this.text.visible);
  }

  update(deltaMs: number, stats: DebugStats): void {
    if (!this.text.visible) return;

    this.accumulatorMs += deltaMs;
    if (this.accumulatorMs < 200) return;
    this.accumulatorMs = 0;

    const loop = this.scene.game.loop;
    // ~24 bytes per frame of numeric payload; good enough for a budget readout.
    const timelineKb = ((stats.echoFrames * 24) / 1024).toFixed(1);

    this.text.setText(
      [
        `FPS         ${loop.actualFps.toFixed(1)}`,
        `frame       ${loop.delta.toFixed(2)} ms`,
        `projectiles ${stats.projectiles}`,
        `particles   ${stats.particles}`,
        `echoes      ${stats.echoes}`,
        `echo frames ${stats.echoFrames} (~${timelineKb} KB)`,
        `renderer    ${this.scene.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas'}`,
      ].join('\n'),
    );
  }
}
