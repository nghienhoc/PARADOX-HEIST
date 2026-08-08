import Phaser from 'phaser';
import { EFFECTS, LOOP } from '@/config/balance';
import { COLORS } from '@/config/theme';
import type { Echo } from '@/entities/Echo';
import { Player } from '@/entities/Player';
import { Projectile, ProjectilePool } from '@/entities/Projectile';
import { TimeCore } from '@/entities/TimeCore';
import { TimeCoreView } from '@/entities/TimeCoreView';
import { LEVEL_01 } from '@/levels/level01';
import { buildLevel } from '@/levels/levelBuilder';
import { SCENES } from '@/scenes/SceneKeys';
import { EchoManager } from '@/systems/EchoManager';
import { EffectsSystem } from '@/systems/EffectsSystem';
import { InputSystem } from '@/systems/InputSystem';
import { InteractionSystem } from '@/systems/InteractionSystem';
import { LoopManager } from '@/systems/LoopManager';
import { installTelemetry, telemetry } from '@/systems/Telemetry';
import type { Interactor } from '@/types/interaction';
import type { LevelDef } from '@/types/level';
import { DebugOverlay } from '@/ui/DebugOverlay';
import { HUD } from '@/ui/HUD';
import { clampDelta } from '@/utils/math';

/**
 * The playable vault chamber.
 *
 * Orchestration only: the scene wires systems together and owns the timeline reset
 * sequence. Gameplay rules live in `systems/` and `entities/`, so this file does not
 * grow into the "one enormous GameScene" the spec warns about.
 *
 * Note: the gameplay input wrapper is called `controls`, not `input` — `Scene.input` is
 * Phaser's own InputPlugin and must not be shadowed.
 */
export class GameScene extends Phaser.Scene {
  private level!: LevelDef;
  private controls!: InputSystem;
  private loop!: LoopManager;
  private player!: Player;
  private echoes!: EchoManager;
  private bullets!: ProjectilePool;
  private fx!: EffectsSystem;
  private hud!: HUD;
  private interactions!: InteractionSystem;
  private core!: TimeCore;
  private coreView!: TimeCoreView;
  private debug: DebugOverlay | null = null;

  /**
   * Everyone who can act on the world this loop: the live player plus every active
   * Echo. Rebuilt only when the Echo set changes, never per frame.
   */
  private readonly interactors: Interactor[] = [];

  /** True during the reset transition; the clock and player input are frozen. */
  private transitioning = false;
  private resetTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.level = LEVEL_01;
    const built = buildLevel(this, this.level);

    // Every timeline value comes from the level, never from a global constant.
    this.loop = new LoopManager(this.level.timeline);

    this.fx = new EffectsSystem(this);
    this.bullets = new ProjectilePool(this);
    this.echoes = new EchoManager(this, this.level.timeline.maxEchoes);
    this.hud = new HUD(this, this.level.timeline.loopDurationMs, this.level.timeline.maxEchoes);
    this.interactions = new InteractionSystem();

    this.player = new Player(this, this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.player.onFire = this.fireProjectile;
    this.player.onInteract = this.dispatchInteract;

    this.echoes.onShoot = this.onEchoShoot;
    this.echoes.onDash = this.onEchoDash;
    this.echoes.onInteract = this.onEchoInteract;

    this.setupTimeCore();
    this.rebuildInteractors();

    // Frame 0 of timeline 1 must be the spawn pose, recorded before any time passes.
    this.loop.primeRecording(this.player.readSampleState());

    this.controls = new InputSystem(this);

    // --- Collisions ---
    this.physics.add.collider(this.player, built.walls);
    this.physics.add.collider(this.bullets.group, built.walls, this.onProjectileHitWall);

    // --- Camera: soft follow with a small look-ahead toward the cursor. ---
    const camera = this.cameras.main;
    camera.startFollow(this.player, true, 0.12, 0.12);
    camera.setDeadzone(180, 120);
    camera.fadeIn(320, 0, 0, 0);

    if (import.meta.env.DEV) {
      this.debug = new DebugOverlay(this);
    }

    installTelemetry();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  override update(nowMs: number, rawDeltaMs: number): void {
    const delta = clampDelta(rawDeltaMs, LOOP.maxDeltaMs);

    this.controls.update(nowMs);
    this.fx.update(delta);
    this.bullets.update(nowMs);

    if (!this.transitioning) {
      if (this.core.isLevelComplete) {
        // Level finished: the clock is stopped, but R restarts the whole level so the
        // player can immediately try for a cleaner solution.
        if (this.controls.justPressed('resetTimeline')) this.restartLevel();
      } else {
        this.simulateLoop(nowMs, delta);
      }
    }

    this.hud.update(
      {
        remainingMs: this.loop.clock.remainingMs,
        progress: this.loop.clock.progress,
        loopNumber: this.loop.loopNumber,
        echoCount: this.loop.echoCount,
        dashCooldownRatio: this.player.dashCooldownRatio(nowMs),
        objective: this.describeObjective(),
      },
      delta,
    );

    this.debug?.update(delta, {
      projectiles: this.bullets.activeCount,
      particles: this.fx.activeCount,
      echoes: this.echoes.activeCount,
      echoFrames: this.loop.totalArchivedFrames + this.loop.recorder.frameCount,
    });

    this.publishTelemetry();
  }

  /** Mirror key state into the read-only telemetry snapshot. See `Telemetry.ts`. */
  private publishTelemetry(): void {
    const t = telemetry();
    t.loopNumber = this.loop.loopNumber;
    t.echoCount = this.loop.echoCount;
    t.maxEchoes = this.loop.maxEchoes;
    t.loopRemainingMs = this.loop.clock.remainingMs;
    t.loopDurationMs = this.loop.loopDurationMs;
    t.playerX = this.player.x;
    t.playerY = this.player.y;
    t.coreX = this.core.x;
    t.coreY = this.core.y;
    t.coreCollected = this.core.isCollected;
    t.levelComplete = this.core.isLevelComplete;
  }

  /** One tick of live gameplay: player, recording, Echo playback, interactions. */
  private simulateLoop(nowMs: number, delta: number): void {
    this.player.tick(nowMs, delta, this.controls);

    // Record first, then replay: Echoes must be driven by the same loop time the live
    // player was just sampled at, so everything stays on one clock.
    const expired = this.loop.tick(delta, this.player.readSampleState());
    if (this.loop.samplesWritten > 0) this.player.clearPendingActions();

    this.echoes.tick(this.loop.clock.elapsedMs, delta);

    // Presence pass runs after Echo playback so plates and pickups see this frame's
    // positions, not last frame's.
    this.interactions.update(this.interactors);

    this.applyCameraLookAhead();

    if (expired) {
      this.startTimelineReset('expired');
    } else if (this.controls.justPressed('resetTimeline')) {
      this.startTimelineReset('manual');
    }
  }

  // ---------------------------------------------------------------------------
  // Objective
  // ---------------------------------------------------------------------------

  private setupTimeCore(): void {
    this.core = new TimeCore(
      this.level.core.x,
      this.level.core.y,
      this.level.completeOnCoreCollected,
    );
    this.coreView = new TimeCoreView(this, this.level.core.x, this.level.core.y);

    this.core.onCollected = (): void => {
      this.coreView.showCollected();
      this.fx.pulse(this.core.x, this.core.y, COLORS.gold, 0.6, 3.4, 380);
      this.fx.burst(this.core.x, this.core.y, 22, COLORS.gold, 300, 520, 1.1);
      this.cameras.main.shake(180, EFFECTS.shakeDefault * 1.2);
      this.hud.showNotice('TIME CORE SECURED');
    };

    this.core.onRestored = (): void => {
      this.coreView.showRestored();
    };

    this.core.onLevelCompleted = (): void => {
      this.hud.setBanner('PARADOX COMPLETE\n\npress R to replay');
      this.cameras.main.flash(260, 255, 210, 87, false);
    };

    this.interactions.register(this.core);
  }

  private describeObjective(): string {
    if (this.core.isLevelComplete) return 'Complete.';
    if (this.core.isCollected) return 'Time Core secured.';
    return this.level.objective;
  }

  // ---------------------------------------------------------------------------
  // Interaction dispatch
  // ---------------------------------------------------------------------------

  /** Routes an explicit Interact action (player `E`, or a replayed Echo) to the world. */
  private readonly dispatchInteract = (interactor: Interactor): void => {
    const consumed = this.interactions.triggerInteract(interactor);
    const color = interactor.isLivePlayer ? COLORS.cyan : COLORS.echo;
    this.fx.pulse(interactor.x, interactor.y, color, 0.5, consumed ? 2.2 : 1.2, 220);
  };

  /**
   * Rebuild the interactor list. Called at level start and after each reset, because
   * that is the only time the set of active Echoes changes.
   */
  private rebuildInteractors(): void {
    this.interactors.length = 0;
    this.interactors.push(this.player);
    this.echoes.appendInteractors(this.interactors);
  }

  // ---------------------------------------------------------------------------
  // Timeline reset
  // ---------------------------------------------------------------------------

  /**
   * Begin the reset transition. Guarded so spamming R cannot queue several resets.
   *
   * Kept deliberately short (`LOOP.resetTransitionMs`) — looping is the core verb of
   * the game and must never feel like waiting.
   */
  private startTimelineReset(reason: 'expired' | 'manual'): void {
    if (this.transitioning) return;
    this.transitioning = true;

    const camera = this.cameras.main;
    camera.flash(140, 95, 240, 255, false);
    camera.shake(160, reason === 'expired' ? 0.006 : 0.003);

    // Signature beat: the collapsing timeline throws off a shockwave and shards.
    this.fx.pulse(this.player.x, this.player.y, COLORS.cyan, 0.4, 4.2, 320);
    this.fx.burst(this.player.x, this.player.y, 18, COLORS.cyan, 420, 380, 1.1);

    (this.player.body as Phaser.Physics.Arcade.Body).velocity.set(0, 0);

    this.resetTimer = this.time.delayedCall(
      LOOP.resetTransitionMs,
      this.beginNextLoop,
      undefined,
      this,
    );
  }

  /** Archive the finished timeline, restore the world, and start the next loop. */
  private beginNextLoop(): void {
    this.resetTimer = null;

    const archived = this.loop.closeTimeline();
    if (archived) {
      this.echoes.syncTimelines(this.loop.timelines);
      this.rebuildInteractors();

      if (this.loop.evictedOnLastClose > 0) {
        // Never silent: the player is told which way the cap cut.
        this.hud.showNotice(
          `ECHO LIMIT ${this.loop.maxEchoes} — OLDEST TIMELINE DISCARDED`,
          2200,
        );
      }
    }

    // World reset (MASTER_GAME_SPEC.md §7). Nothing is destroyed or recreated — every
    // object is reused, which is what keeps the restart effectively instant.
    this.bullets.releaseAll();
    this.fx.clear();
    this.echoes.restartAll();
    this.interactions.resetForLoop();
    this.controls.clearBuffers();
    this.player.respawn(this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.loop.primeRecording(this.player.readSampleState());

    this.fx.pulse(this.player.x, this.player.y, COLORS.echo, 2.6, 0.3, 260);

    this.transitioning = false;
  }

  /** Full level restart: wipes every timeline and permanent progress. */
  private restartLevel(): void {
    this.loop.clear();
    this.echoes.clear();
    this.bullets.releaseAll();
    this.fx.clear();
    this.core.resetLevel();
    this.interactions.resetForLoop();
    this.controls.clearBuffers();
    this.hud.clearTransients();
    this.player.respawn(this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.loop.primeRecording(this.player.readSampleState());
    this.rebuildInteractors();

    this.cameras.main.flash(200, 95, 240, 255, false);
  }

  // ---------------------------------------------------------------------------
  // Combat
  // ---------------------------------------------------------------------------

  /** Arrow properties so they can be handed to Player / EchoManager as callbacks. */
  private readonly fireProjectile = (x: number, y: number, angle: number): void => {
    this.spawnBullet(x, y, angle, false);
  };

  private readonly onEchoShoot = (echo: Echo): void => {
    this.spawnBullet(echo.muzzleX, echo.muzzleY, echo.aimRotation, true);
  };

  private readonly onEchoDash = (echo: Echo): void => {
    this.fx.burst(echo.x, echo.y, 5, COLORS.echo, 200, 220, 0.7, 1.2, echo.aimRotation + Math.PI);
  };

  private readonly onEchoInteract = (echo: Echo): void => {
    this.dispatchInteract(echo);
  };

  private readonly onProjectileHitWall: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
    projectile,
  ): void => {
    const bullet = projectile as Projectile;
    this.fx.burst(bullet.x, bullet.y, 4, bullet.fromEcho ? COLORS.echo : COLORS.cyan, 160, 200, 0.6);
    bullet.recycle();
  };

  private spawnBullet(x: number, y: number, angle: number, fromEcho: boolean): void {
    const spawned = this.bullets.spawn(x, y, angle, this.time.now, fromEcho);
    if (!spawned) return; // Pool exhausted — dropping the shot is correct, not an error.

    const color = fromEcho ? COLORS.echo : COLORS.cyan;
    this.fx.pulse(x, y, color, 0.7, 0.1, 90);
    this.fx.burst(x, y, 3, color, 180, 130, 0.5, 0.7, angle);

    if (!fromEcho) {
      this.cameras.main.shake(60, EFFECTS.shakeDefault * 0.4);
    }
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------

  /** Nudge the camera toward the cursor so the player can see where they aim. */
  private applyCameraLookAhead(): void {
    const camera = this.cameras.main;
    const dx = (this.controls.aimX - this.player.x) * 0.12;
    const dy = (this.controls.aimY - this.player.y) * 0.12;
    camera.setFollowOffset(
      Phaser.Math.Linear(camera.followOffset.x, -dx, 0.08),
      Phaser.Math.Linear(camera.followOffset.y, -dy, 0.08),
    );
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  /** Make sure nothing outlives the scene (spec §17 "Memory"). */
  private onShutdown(): void {
    this.resetTimer?.remove(false);
    this.resetTimer = null;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.controls.destroy();
    this.echoes.clear();
    this.loop.clear();
    this.interactions.clear();
    this.interactors.length = 0;
  }
}
