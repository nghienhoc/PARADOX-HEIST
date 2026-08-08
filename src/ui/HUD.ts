import Phaser from 'phaser';
import { LOOP } from '@/config/balance';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config/resolution';
import { COLORS, DEPTH, toCss } from '@/config/theme';
import { formatSeconds } from '@/utils/math';

const BAR = {
  width: 520,
  height: 12,
  x: (GAME_WIDTH - 520) / 2,
  y: 46,
} as const;

const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';

export interface HudState {
  remainingMs: number;
  progress: number;
  loopNumber: number;
  echoCount: number;
  dashCooldownRatio: number;
  objective: string;
}

/**
 * Gameplay HUD.
 *
 * Static chrome (labels, frames, timeline tick marks) is drawn once from the **level's**
 * loop duration. Only the two progress bars are redrawn per frame, and text is only
 * re-set when its content actually changes — Phaser text updates re-render a canvas
 * texture, so they are not free.
 */
export class HUD {
  private readonly dynamic: Phaser.GameObjects.Graphics;
  private readonly timerText: Phaser.GameObjects.Text;
  private readonly loopText: Phaser.GameObjects.Text;
  private readonly echoText: Phaser.GameObjects.Text;
  private readonly objectiveText: Phaser.GameObjects.Text;
  private readonly noticeText: Phaser.GameObjects.Text;
  private readonly bannerText: Phaser.GameObjects.Text;

  private lastTimerLabel = '';
  private lastLoopLabel = '';
  private lastEchoLabel = '';
  private lastObjective = '';
  private warning = false;
  private noticeRemainingMs = 0;

  /**
   * @param loopDurationMs The active level's loop length. Drives the timeline tick
   *   marks; never assume a global 20 seconds.
   * @param maxEchoes The active level's Echo cap, shown in the counter.
   */
  constructor(
    scene: Phaser.Scene,
    loopDurationMs: number,
    private readonly maxEchoes: number,
  ) {
    // --- Static chrome, drawn once. ---
    const chrome = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);

    // Top band: timer, timeline bar, loop/echo counters, objective.
    chrome.fillStyle(COLORS.voidDark, 0.72);
    chrome.fillRect(0, 0, GAME_WIDTH, 92);
    chrome.lineStyle(1, COLORS.hudDim, 0.9);
    chrome.beginPath();
    chrome.moveTo(0, 92);
    chrome.lineTo(GAME_WIDTH, 92);
    chrome.strokePath();

    // Bottom band: without it, the control guide and dash meter sit on top of the
    // vault wall and become unreadable.
    chrome.fillStyle(COLORS.voidDark, 0.72);
    chrome.fillRect(0, GAME_HEIGHT - 62, GAME_WIDTH, 62);
    chrome.lineStyle(1, COLORS.hudDim, 0.9);
    chrome.beginPath();
    chrome.moveTo(0, GAME_HEIGHT - 62);
    chrome.lineTo(GAME_WIDTH, GAME_HEIGHT - 62);
    chrome.strokePath();

    // Timeline bar frame + a tick every 5 seconds of *this level's* loop.
    chrome.lineStyle(1, COLORS.hudDim, 1);
    chrome.strokeRect(BAR.x - 1, BAR.y - 1, BAR.width + 2, BAR.height + 2);
    const durationSec = loopDurationMs / 1000;
    for (let s = 5; s < durationSec; s += 5) {
      const tx = BAR.x + (BAR.width * s) / durationSec;
      chrome.beginPath();
      chrome.moveTo(tx, BAR.y - 5);
      chrome.lineTo(tx, BAR.y + BAR.height + 5);
      chrome.strokePath();
    }

    this.dynamic = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud);

    this.timerText = scene.add
      .text(GAME_WIDTH / 2, 22, '', { fontFamily: MONO, fontSize: '26px', color: toCss(COLORS.white) })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    this.loopText = scene.add
      .text(24, 14, '', { fontFamily: MONO, fontSize: '15px', color: toCss(COLORS.cyan) })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    this.echoText = scene.add
      .text(24, 38, '', { fontFamily: MONO, fontSize: '15px', color: toCss(COLORS.echo) })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    this.objectiveText = scene.add
      .text(GAME_WIDTH - 24, 22, '', {
        fontFamily: MONO,
        fontSize: '14px',
        color: toCss(COLORS.hudText),
        align: 'right',
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    // Transient one-line messages (Echo evicted, Core secured).
    this.noticeText = scene.add
      .text(GAME_WIDTH / 2, 118, '', {
        fontFamily: MONO,
        fontSize: '15px',
        color: toCss(COLORS.gold),
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setAlpha(0);

    // Persistent completion banner.
    this.bannerText = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', {
        fontFamily: MONO,
        fontSize: '40px',
        color: toCss(COLORS.gold),
        align: 'center',
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setVisible(false);

    // Control guide + dash label — static, created once and never touched again.
    scene.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 14,
        'WASD move   ·   MOUSE aim   ·   LMB shoot   ·   SPACE dash   ·   E interact   ·   R reset timeline',
        { fontFamily: MONO, fontSize: '13px', color: toCss(COLORS.hudText) },
      )
      .setOrigin(0.5, 1)
      .setAlpha(0.85)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    scene.add
      .text(24, GAME_HEIGHT - 56, 'DASH', {
        fontFamily: MONO,
        fontSize: '12px',
        color: toCss(COLORS.hudText),
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
  }

  /** Show a transient message. Replaces any message still on screen. */
  showNotice(message: string, durationMs = 1800): void {
    this.noticeText.setText(message).setAlpha(1);
    this.noticeRemainingMs = durationMs;
  }

  /** Show or clear the persistent completion banner. */
  setBanner(message: string | null): void {
    if (message === null) {
      this.bannerText.setVisible(false);
      return;
    }
    this.bannerText.setText(message).setVisible(true).setAlpha(1);
  }

  update(state: HudState, deltaMs: number): void {
    // --- Text: only touched when the rendered string changes. ---
    const timerLabel = formatSeconds(state.remainingMs);
    if (timerLabel !== this.lastTimerLabel) {
      this.timerText.setText(timerLabel);
      this.lastTimerLabel = timerLabel;
    }

    const isWarning = state.remainingMs <= LOOP.warningMs;
    if (isWarning !== this.warning) {
      this.warning = isWarning;
      this.timerText.setColor(toCss(isWarning ? COLORS.danger : COLORS.white));
    }

    const loopLabel = `TIMELINE ${state.loopNumber.toString().padStart(2, '0')}`;
    if (loopLabel !== this.lastLoopLabel) {
      this.loopText.setText(loopLabel);
      this.lastLoopLabel = loopLabel;
    }

    const atCap = state.echoCount >= this.maxEchoes;
    const echoLabel = `ECHOES ${state.echoCount}/${this.maxEchoes}${atCap ? ' (FULL)' : ''}`;
    if (echoLabel !== this.lastEchoLabel) {
      this.echoText.setText(echoLabel).setColor(toCss(atCap ? COLORS.orange : COLORS.echo));
      this.lastEchoLabel = echoLabel;
    }

    if (state.objective !== this.lastObjective) {
      this.objectiveText.setText(state.objective);
      this.lastObjective = state.objective;
    }

    // --- Transient notice fade-out. ---
    if (this.noticeRemainingMs > 0) {
      this.noticeRemainingMs -= deltaMs;
      // Hold at full opacity, then fade over the last 400ms.
      this.noticeText.setAlpha(Math.min(1, Math.max(0, this.noticeRemainingMs / 400)));
    }

    // --- Bars: genuinely dynamic, redrawn each frame. ---
    const g = this.dynamic;
    g.clear();

    g.fillStyle(isWarning ? COLORS.danger : COLORS.cyan, 1);
    g.fillRect(BAR.x, BAR.y, BAR.width * (1 - state.progress), BAR.height);

    if (isWarning) {
      // Soft pulse instead of a hard flash (accessibility: no strobing).
      const pulse = 0.25 + 0.25 * Math.sin(state.remainingMs * 0.012);
      g.fillStyle(COLORS.danger, pulse);
      g.fillRect(BAR.x - 4, BAR.y - 4, BAR.width + 8, BAR.height + 8);
    }

    const dashWidth = 120;
    const dashY = GAME_HEIGHT - 40;
    g.fillStyle(COLORS.hudDim, 0.85);
    g.fillRect(24, dashY, dashWidth, 8);
    g.fillStyle(state.dashCooldownRatio > 0 ? COLORS.cyanDeep : COLORS.cyan, 1);
    g.fillRect(24, dashY, dashWidth * (1 - state.dashCooldownRatio), 8);
  }

  /** Reset transient UI state on a full level restart. */
  clearTransients(): void {
    this.noticeRemainingMs = 0;
    this.noticeText.setAlpha(0);
    this.setBanner(null);
  }
}
