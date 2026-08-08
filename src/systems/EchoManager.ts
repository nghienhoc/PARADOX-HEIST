import Phaser from 'phaser';
import { COLORS, DEPTH } from '@/config/theme';
import { Echo } from '@/entities/Echo';
import { EchoAction, type EchoTimeline } from '@/types/echo';
import type { Interactor } from '@/types/interaction';
import { TEX } from '@/utils/textures';

/** Called when a replayed timeline performs an action at a world position. */
export type EchoActionHandler = (echo: Echo) => void;

/**
 * Owns the pool of Echo sprites and keeps it in sync with the archived timelines.
 *
 * The pool is sized from the level's `maxEchoes` and allocated once at level start, so
 * looping never creates or destroys game objects — one of the main defences against
 * memory growth across resets.
 */
export class EchoManager {
  onShoot: EchoActionHandler | null = null;
  onDash: EchoActionHandler | null = null;
  onInteract: EchoActionHandler | null = null;

  private readonly pool: Echo[] = [];

  constructor(scene: Phaser.Scene, maxEchoes: number) {
    for (let i = 0; i < maxEchoes; i++) {
      const marker = scene.add
        .image(0, 0, TEX.glow)
        .setDepth(DEPTH.echo - 2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0.35)
        .setTint(COLORS.echo)
        .setActive(false)
        .setVisible(false);

      this.pool.push(new Echo(scene, marker));
    }
  }

  get capacity(): number {
    return this.pool.length;
  }

  get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i]!.active) n++;
    }
    return n;
  }

  /**
   * Bind the current set of archived timelines to pool slots.
   * Call once per timeline reset, after the new timeline has been archived.
   */
  syncTimelines(timelines: readonly EchoTimeline[]): void {
    const count = Math.min(timelines.length, this.pool.length);

    for (let i = 0; i < this.pool.length; i++) {
      const echo = this.pool[i]!;
      if (i < count) {
        // `timelines` is oldest-first and already capped by LoopManager.
        echo.assign(timelines[i]!, i, count);
      } else {
        echo.deactivate();
      }
    }
  }

  /** Rewind every active Echo to timeline time 0, so they all start together. */
  restartAll(): void {
    for (let i = 0; i < this.pool.length; i++) {
      const echo = this.pool[i]!;
      if (echo.active) echo.restart();
    }
  }

  /** Advance playback for every active Echo and dispatch their actions. */
  tick(loopTimeMs: number, deltaMs: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const echo = this.pool[i]!;
      if (!echo.active) continue;

      const fired = echo.tick(loopTimeMs, deltaMs);
      if (fired === EchoAction.None) continue;

      if ((fired & EchoAction.Shoot) !== 0) this.onShoot?.(echo);
      if ((fired & EchoAction.Dash) !== 0) this.onDash?.(echo);
      if ((fired & EchoAction.Interact) !== 0) this.onInteract?.(echo);
    }
  }

  /**
   * Append every active Echo to `out` as an `Interactor`.
   *
   * Called only when the Echo set changes (on a loop reset), never per frame.
   */
  appendInteractors(out: Interactor[]): void {
    for (let i = 0; i < this.pool.length; i++) {
      const echo = this.pool[i]!;
      if (echo.active) out.push(echo);
    }
  }

  /** Unbind everything — used when leaving or restarting a level. */
  clear(): void {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i]!.deactivate();
    }
  }
}
