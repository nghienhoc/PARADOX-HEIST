import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config/resolution';
import { COLORS, DEPTH, toCss } from '@/config/theme';
import { REPLAY_EVENT, SCENES } from '@/scenes/SceneKeys';
import type { Grade, RunResult } from '@/systems/LevelRun';
import type { StoredResult } from '@/systems/SaveManager';
import { formatSeconds } from '@/utils/math';

export interface ResultSceneData {
  result: RunResult;
  /** Best stored run for this level, if any. */
  best: StoredResult | null;
  /** True when this run became the new best. */
  isNewBest: boolean;
}

const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';

/** Grade colours — earned ranks read warmer, so an S feels different at a glance. */
const GRADE_COLOR: Readonly<Record<Grade, number>> = {
  C: 0x9aa8c7,
  B: 0x5ff0ff,
  A: 0xa07bff,
  S: 0xffd257,
};

/**
 * Result overlay shown when a level is completed.
 *
 * Runs as an overlay scene on top of a paused `GameScene`, so the finished vault stays
 * visible behind it and REPLAY can restart without a full scene rebuild.
 *
 * There is deliberately no CONTINUE button yet: there is no level select or level 02 to
 * continue to, and a button that goes nowhere is worse than no button.
 */
export class ResultScene extends Phaser.Scene {
  // Named `payload`, not `data` — `Scene.data` is Phaser's own DataManager.
  private payload!: ResultSceneData;

  constructor() {
    super(SCENES.result);
  }

  init(payload: ResultSceneData): void {
    this.payload = payload;
  }

  create(): void {
    const { result, best, isNewBest } = this.payload;
    const cx = GAME_WIDTH / 2;

    // --- Dimmed backdrop + panel ---
    const panel = this.add.graphics().setDepth(DEPTH.transition);
    panel.fillStyle(COLORS.voidDark, 0.82);
    panel.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const panelW = 620;
    const panelH = 460;
    const panelX = cx - panelW / 2;
    const panelY = GAME_HEIGHT / 2 - panelH / 2;

    panel.fillStyle(0x080d1c, 0.96);
    panel.fillRect(panelX, panelY, panelW, panelH);
    panel.lineStyle(2, COLORS.cyanDeep, 1);
    panel.strokeRect(panelX, panelY, panelW, panelH);
    panel.lineStyle(1, COLORS.gold, 0.5);
    panel.strokeRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12);

    const text = (
      x: number,
      y: number,
      value: string,
      size: number,
      color: number,
      originX = 0.5,
    ): Phaser.GameObjects.Text =>
      this.add
        .text(x, y, value, { fontFamily: MONO, fontSize: `${size}px`, color: toCss(color) })
        .setOrigin(originX, 0.5)
        .setDepth(DEPTH.transition + 1);

    text(cx, panelY + 52, 'LEVEL COMPLETE', 30, COLORS.white);
    text(cx, panelY + 88, result.levelName.toUpperCase(), 16, COLORS.cyan);

    // --- Grade ---
    const grade = text(cx, panelY + 158, result.grade, 76, GRADE_COLOR[result.grade]);
    grade.setScale(0.4).setAlpha(0);
    this.tweens.add({
      targets: grade,
      scale: 1,
      alpha: 1,
      duration: 420,
      ease: 'Back.Out',
    });

    if (isNewBest) {
      const badge = text(cx, panelY + 208, 'NEW BEST', 15, COLORS.gold);
      this.tweens.add({
        targets: badge,
        alpha: 0.35,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }

    // --- Stats ---
    const rows: Array<[string, string]> = [
      ['TIMELINES USED', String(result.timelinesUsed)],
      ['COMPLETION TIME', `${formatSeconds(result.elapsedMs)}s`],
      ['MANUAL RESETS', String(result.manualResets)],
      ['ECHOES CREATED', String(result.echoesCreated)],
    ];

    if (best) {
      rows.push([
        'BEST',
        `${best.grade}  ·  ${best.timelinesUsed} timelines  ·  ${formatSeconds(best.elapsedMs)}s`,
      ]);
    }

    const labelX = panelX + 56;
    const valueX = panelX + panelW - 56;
    rows.forEach(([label, value], index) => {
      const y = panelY + 254 + index * 30;
      text(labelX, y, label, 14, COLORS.hudText, 0);
      text(valueX, y, value, 14, COLORS.white, 1);
    });

    // --- Replay button ---
    const buttonY = panelY + panelH - 48;
    const buttonW = 220;
    const buttonH = 44;

    const button = this.add
      .graphics()
      .setDepth(DEPTH.transition + 1)
      .fillStyle(COLORS.cyanDeep, 0.35)
      .fillRect(cx - buttonW / 2, buttonY - buttonH / 2, buttonW, buttonH)
      .lineStyle(2, COLORS.cyan, 1)
      .strokeRect(cx - buttonW / 2, buttonY - buttonH / 2, buttonW, buttonH);

    const buttonLabel = text(cx, buttonY, 'REPLAY   (R)', 16, COLORS.white);

    const hit = this.add
      .zone(cx, buttonY, buttonW, buttonH)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    hit.on(Phaser.Input.Events.POINTER_OVER, () => {
      button.setAlpha(0.75);
      buttonLabel.setColor(toCss(COLORS.cyan));
    });
    hit.on(Phaser.Input.Events.POINTER_OUT, () => {
      button.setAlpha(1);
      buttonLabel.setColor(toCss(COLORS.white));
    });
    hit.once(Phaser.Input.Events.POINTER_DOWN, () => this.replay());

    this.input.keyboard?.once('keydown-R', () => this.replay());
    this.input.keyboard?.once('keydown-ENTER', () => this.replay());

    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  private replay(): void {
    // Hand control back to the (still-loaded) GameScene rather than rebuilding it.
    this.scene.stop();
    this.scene.resume(SCENES.game);
    this.game.events.emit(REPLAY_EVENT);
  }
}
