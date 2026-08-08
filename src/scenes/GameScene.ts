import Phaser from 'phaser';
import { ACCESSIBILITY, EFFECTS, LOOP, OBJECTIVE, RESET_TOTAL_MS } from '@/config/balance';
import { COLORS, DEPTH } from '@/config/theme';
import type { Door } from '@/entities/Door';
import type { DoorView } from '@/entities/DoorView';
import type { Echo } from '@/entities/Echo';
import { ExtractionZone } from '@/entities/ExtractionZone';
import { ExtractionZoneView } from '@/entities/ExtractionZoneView';
import { Player } from '@/entities/Player';
import type { PressureSwitch } from '@/entities/PressureSwitch';
import { Projectile, ProjectilePool } from '@/entities/Projectile';
import { TimeCore } from '@/entities/TimeCore';
import { TimeCoreView } from '@/entities/TimeCoreView';
import { LEVEL_01 } from '@/levels/level01';
import { buildLevel } from '@/levels/levelBuilder';
import { REPLAY_EVENT, SCENES } from '@/scenes/SceneKeys';
import type { ResultSceneData } from '@/scenes/ResultScene';
import { EchoManager } from '@/systems/EchoManager';
import { EffectsSystem } from '@/systems/EffectsSystem';
import { InputSystem } from '@/systems/InputSystem';
import { InteractionSystem } from '@/systems/InteractionSystem';
import { LevelRun, objectiveLabel } from '@/systems/LevelRun';
import { LoopManager } from '@/systems/LoopManager';
import { SaveManager } from '@/systems/SaveManager';
import { installTelemetry, telemetry } from '@/systems/Telemetry';
import { TimelineResetVfx } from '@/systems/TimelineResetVfx';
import type { Interactor } from '@/types/interaction';
import type { LevelDef } from '@/types/level';
import { DebugOverlay } from '@/ui/DebugOverlay';
import { HUD } from '@/ui/HUD';
import { clampDelta } from '@/utils/math';
import { TEX } from '@/utils/textures';

/**
 * The playable vault chamber.
 *
 * Orchestration only: the scene wires systems together and owns the timeline reset
 * sequence. Gameplay rules live in `systems/` and `entities/`, so this file does not grow
 * into the "one enormous GameScene" the spec warns about.
 *
 * Note: the gameplay input wrapper is called `controls`, not `input` — `Scene.input` is
 * Phaser's own InputPlugin and must not be shadowed.
 */
export class GameScene extends Phaser.Scene {
  private level!: LevelDef;
  private controls!: InputSystem;
  private loop!: LoopManager;
  private run!: LevelRun;
  private player!: Player;
  private echoes!: EchoManager;
  private bullets!: ProjectilePool;
  private fx!: EffectsSystem;
  private hud!: HUD;
  private interactions!: InteractionSystem;
  private resetVfx!: TimelineResetVfx;
  private save!: SaveManager;

  private core!: TimeCore;
  private coreView!: TimeCoreView;
  private carryRing!: Phaser.GameObjects.Image;
  private extraction!: ExtractionZone;
  private extractionView!: ExtractionZoneView;
  private switches: PressureSwitch[] = [];
  private doors: Door[] = [];
  private doorViews: DoorView[] = [];

  private debug: DebugOverlay | null = null;

  /**
   * Everyone who can act on the world this loop: the live player plus every active Echo.
   * Rebuilt only when the Echo set changes, never per frame.
   */
  private readonly interactors: Interactor[] = [];

  /** True during the reset transition; the clock, physics and player input are frozen. */
  private transitioning = false;
  private paused = false;
  private resetTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.level = LEVEL_01;
    const built = buildLevel(this, this.level);

    this.switches = built.switches;
    this.doors = built.doors.map((d) => d.door);
    this.doorViews = built.doors.map((d) => d.view);

    // Every timeline value comes from the level, never from a global constant.
    this.loop = new LoopManager(this.level.timeline);
    this.run = new LevelRun(this.level.id, this.level.name, this.level.scoring);
    this.save = new SaveManager();

    this.fx = new EffectsSystem(this);
    this.bullets = new ProjectilePool(this);
    this.echoes = new EchoManager(this, this.level.timeline.maxEchoes);
    this.hud = new HUD(this, this.level.timeline.loopDurationMs, this.level.timeline.maxEchoes);
    this.interactions = new InteractionSystem();
    this.resetVfx = new TimelineResetVfx(this, this.fx);

    this.player = new Player(this, this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.player.onFire = this.fireProjectile;
    this.player.onInteract = this.dispatchInteract;

    this.echoes.onShoot = this.onEchoShoot;
    this.echoes.onDash = this.onEchoDash;
    this.echoes.onInteract = this.onEchoInteract;

    this.setupObjective();

    // Switches are registered after the Core so that an Interact press near both prefers
    // whichever is genuinely nearest — the system resolves by distance, not order.
    for (const mechanism of this.switches) this.interactions.register(mechanism);

    this.rebuildInteractors();

    // Frame 0 of timeline 1 must be the spawn pose, recorded before any time passes.
    this.loop.primeRecording(this.player.readSampleState());

    this.controls = new InputSystem(this);

    // --- Collisions ---
    this.physics.add.collider(this.player, built.walls);
    this.physics.add.collider(this.player, built.doorBodies);
    this.physics.add.collider(this.bullets.group, built.walls, this.onProjectileHitWall);
    this.physics.add.collider(this.bullets.group, built.doorBodies, this.onProjectileHitWall);

    // --- Camera: soft follow with a small look-ahead toward the cursor. ---
    const camera = this.cameras.main;
    camera.startFollow(this.player, true, 0.12, 0.12);
    camera.setDeadzone(180, 120);
    camera.fadeIn(320, 0, 0, 0);

    if (import.meta.env.DEV) {
      this.debug = new DebugOverlay(this);
    }

    installTelemetry();

    this.game.events.on(REPLAY_EVENT, this.restartLevel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  override update(nowMs: number, rawDeltaMs: number): void {
    const delta = clampDelta(rawDeltaMs, LOOP.maxDeltaMs);

    this.controls.update(nowMs);

    if (this.controls.justPressed('pause') && !this.transitioning && !this.run.isComplete) {
      this.togglePause();
    }

    if (!this.paused) {
      this.fx.update(delta);
      this.resetVfx.update(delta);
      this.bullets.update(this.time.now);
      for (const view of this.doorViews) view.update(delta);

      if (!this.transitioning && !this.run.isComplete) {
        this.simulateLoop(nowMs, delta);
      }
    }

    this.updateCarryRing();

    this.hud.update(
      {
        remainingMs: this.loop.clock.remainingMs,
        progress: this.loop.clock.progress,
        loopNumber: this.loop.loopNumber,
        echoCount: this.loop.echoCount,
        dashCooldownRatio: this.player.dashCooldownRatio(nowMs),
        objective: this.describeObjective(),
        carryingCore: this.core.isCollected,
        paused: this.paused,
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

  /** One tick of live gameplay: player, recording, Echo playback, mechanisms. */
  private simulateLoop(nowMs: number, delta: number): void {
    this.run.tick(delta);
    this.player.tick(nowMs, delta, this.controls);

    // Record first, then replay: Echoes must be driven by the same loop time the live
    // player was just sampled at, so everything stays on one clock.
    const expired = this.loop.tick(delta, this.player.readSampleState());
    if (this.loop.samplesWritten > 0) this.player.clearPendingActions();

    this.echoes.tick(this.loop.clock.elapsedMs, delta);

    // Presence pass runs after Echo playback so plates and pads see this frame's
    // positions, not last frame's.
    this.interactions.update(this.interactors);

    // Mechanisms settle after the presence pass: doors read switch state, and the
    // extraction pad syncs its visuals from its derived armed state.
    for (const door of this.doors) door.update();
    this.extraction.refresh();

    this.applyCameraLookAhead();

    if (this.run.isComplete) return; // Extraction fired this frame; do not also reset.

    if (expired) {
      this.startTimelineReset('expired');
    } else if (this.controls.justPressed('resetTimeline')) {
      this.startTimelineReset('manual');
    }
  }

  // ---------------------------------------------------------------------------
  // Objective
  // ---------------------------------------------------------------------------

  private setupObjective(): void {
    this.core = new TimeCore(
      this.level.core.x,
      this.level.core.y,
      this.level.completeOnCoreCollected,
      OBJECTIVE.coreCollectRadius,
    );
    this.coreView = new TimeCoreView(this, this.level.core.x, this.level.core.y);

    // Possession is represented by state + HUD badge + this ring, rather than a physical
    // carried object — clear enough for the level, and far less to go wrong.
    this.carryRing = this.add
      .image(0, 0, TEX.glow)
      .setDepth(DEPTH.player - 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.gold)
      .setScale(0.9)
      .setVisible(false);

    this.core.onCollected = (): void => {
      this.coreView.showCollected();
      this.fx.pulse(this.core.x, this.core.y, COLORS.gold, 0.6, 3.2, 360);
      this.fx.burst(this.core.x, this.core.y, 16, COLORS.gold, 300, 480, 1.05);
      this.shake(170, EFFECTS.shakeDefault * 1.1);
      this.hud.showNotice('TIME CORE SECURED — REACH EXTRACTION');
    };

    this.core.onRestored = (): void => {
      this.coreView.showRestored();
    };

    // Only used by levels where touching the Core is itself the win condition.
    this.core.onLevelCompleted = (): void => this.completeLevel();

    this.interactions.register(this.core);

    // --- Extraction ---
    const radius = this.level.extraction.radius ?? OBJECTIVE.extractionRadius;
    this.extraction = new ExtractionZone(
      this.level.extraction.x,
      this.level.extraction.y,
      radius,
      () => this.core.isCollected,
    );
    this.extractionView = new ExtractionZoneView(
      this,
      this.level.extraction.x,
      this.level.extraction.y,
      radius,
    );

    this.extraction.onArmedChange = (armed): void => {
      this.extractionView.setArmed(armed);
      if (armed) {
        this.fx.pulse(this.extraction.x, this.extraction.y, COLORS.gold, 0.4, 3.0, 420);
      }
    };

    this.extraction.onExtracted = (): void => this.completeLevel();

    this.interactions.register(this.extraction);
  }

  private describeObjective(): string {
    return objectiveLabel({
      loopNumber: this.loop.loopNumber,
      switchHeld: this.switches.some((s) => s.isHeld),
      doorOpen: this.doors.some((d) => d.isOpen),
      coreCollected: this.core.isCollected,
      complete: this.run.isComplete,
    });
  }

  private updateCarryRing(): void {
    if (!this.core.isCollected) {
      if (this.carryRing.visible) this.carryRing.setVisible(false);
      return;
    }
    this.carryRing.setVisible(true).setPosition(this.player.x, this.player.y);
    // Gentle breathing scale, computed rather than tweened so a reset cannot leave a
    // tween running on a hidden object.
    this.carryRing.setScale(0.85 + Math.sin(this.time.now * 0.006) * 0.08);
  }

  // ---------------------------------------------------------------------------
  // Level completion
  // ---------------------------------------------------------------------------

  /**
   * Finish the level. Guarded twice over: `ExtractionZone` latches after one use, and
   * `LevelRun.complete()` returns null if a result already exists.
   */
  private completeLevel(): void {
    const result = this.run.complete(this.loop.loopNumber, this.loop.totalTimelinesCreated);
    if (!result) return;

    const previousBest = this.save.loadBest(this.level.id);
    const isNewBest = this.save.submit(this.level.id, result);

    this.hud.setBanner(null);
    this.hud.showNotice('EXTRACTION COMPLETE', 1_200);

    const camera = this.cameras.main;
    camera.flash(260, 255, 210, 87, false);
    this.shake(320, EFFECTS.shakeDefault * 2);
    this.fx.pulse(this.player.x, this.player.y, COLORS.gold, 0.5, 5.5, 620);
    this.fx.burst(this.player.x, this.player.y, 26, COLORS.gold, 420, 700, 1.2);

    (this.player.body as Phaser.Physics.Arcade.Body).velocity.set(0, 0);
    this.bullets.releaseAll();

    // Short beat so the victory effect lands before the panel covers it.
    this.time.delayedCall(700, () => {
      this.scene.pause();
      const data: ResultSceneData = { result, best: previousBest ?? null, isNewBest };
      this.scene.launch(SCENES.result, data);
    });
  }

  // ---------------------------------------------------------------------------
  // Pause
  // ---------------------------------------------------------------------------

  /**
   * Freeze the world.
   *
   * `time.paused` is the important part: it stops the scene clock, so the loop timer,
   * projectile lifetimes and any pending reset timer all hold rather than silently
   * advancing while the player is away.
   */
  private togglePause(): void {
    this.paused = !this.paused;
    this.time.paused = this.paused;

    if (this.paused) {
      this.physics.world.pause();
    } else {
      this.physics.world.resume();
      this.controls.clearBuffers();
    }
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
   * Rebuild the interactor list. Called at level start and after each reset, because that
   * is the only time the set of active Echoes changes.
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
   * Begin the collapse. Guarded so spamming R cannot queue several resets, and so a reset
   * can never fire once the level is over.
   */
  private startTimelineReset(reason: 'expired' | 'manual'): void {
    if (this.transitioning || this.paused || this.run.isComplete) return;
    this.transitioning = true;

    if (reason === 'manual') this.run.recordManualReset();

    // Freeze the simulation for the whole transition. Physics only — the scene clock must
    // keep running or the delayedCall below would never fire.
    this.physics.world.pause();
    (this.player.body as Phaser.Physics.Arcade.Body).velocity.set(0, 0);

    this.resetVfx.play(
      this.loop.recorder,
      this.player.x,
      this.player.y,
      this.player.rotation,
      reason === 'manual',
    );

    this.resetTimer = this.time.delayedCall(
      RESET_TOTAL_MS,
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
        this.hud.showNotice(`ECHO LIMIT ${this.loop.maxEchoes} — OLDEST TIMELINE DISCARDED`, 2_200);
      }
    }

    // World reset (MASTER_GAME_SPEC.md §7). Nothing is destroyed or recreated — every
    // object is reused, which is what keeps the restart effectively instant.
    this.bullets.releaseAll();
    this.fx.clear();
    this.resetVfx.stop();
    this.echoes.restartAll();
    this.interactions.resetForLoop();
    for (const door of this.doors) door.resetForLoop();
    this.controls.clearBuffers();
    this.player.respawn(this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.loop.primeRecording(this.player.readSampleState());

    this.resetVfx.playMaterialise(this.player.x, this.player.y);

    this.physics.world.resume();
    this.transitioning = false;
  }

  /** Full level restart: wipes every timeline, the run stats and permanent progress. */
  private restartLevel(): void {
    this.resetTimer?.remove(false);
    this.resetTimer = null;

    this.loop.clear();
    this.run.reset();
    this.echoes.clear();
    this.bullets.releaseAll();
    this.fx.clear();
    this.resetVfx.stop();

    this.core.resetLevel();
    this.extraction.resetLevel();
    this.interactions.resetForLoop();
    for (const door of this.doors) door.resetForLoop();

    this.controls.clearBuffers();
    this.hud.clearTransients();
    this.player.respawn(this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.loop.primeRecording(this.player.readSampleState());
    this.rebuildInteractors();

    this.paused = false;
    this.time.paused = false;
    this.transitioning = false;
    this.physics.world.resume();

    this.cameras.main.setZoom(1);
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

    if (!fromEcho) this.shake(60, EFFECTS.shakeDefault * 0.4);
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

  /** Shake, scaled by the accessibility setting so it can be reduced or disabled. */
  private shake(durationMs: number, intensity: number): void {
    if (ACCESSIBILITY.shakeScale <= 0) return;
    this.cameras.main.shake(durationMs, intensity * ACCESSIBILITY.shakeScale);
  }

  // ---------------------------------------------------------------------------
  // Telemetry
  // ---------------------------------------------------------------------------

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
    t.switchHeld = this.switches.some((s) => s.isHeld);
    t.switchX = this.switches[0]?.x ?? 0;
    t.switchY = this.switches[0]?.y ?? 0;
    t.doorOpen = this.doors.some((d) => d.isOpen);
    const firstDoor = this.doors[0];
    t.doorX = firstDoor ? firstDoor.x + firstDoor.width / 2 : 0;
    t.doorY = firstDoor ? firstDoor.y + firstDoor.height / 2 : 0;
    t.extractionArmed = this.extraction.isArmed;
    t.extractionX = this.extraction.x;
    t.extractionY = this.extraction.y;
    t.levelComplete = this.run.isComplete;
    t.paused = this.paused;
    t.objective = this.describeObjective();
    t.grade = this.run.finalResult?.grade ?? '';
    t.timelinesUsed = this.run.finalResult?.timelinesUsed ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Teardown
  // ---------------------------------------------------------------------------

  /** Make sure nothing outlives the scene (spec §17 "Memory"). */
  private onShutdown(): void {
    this.game.events.off(REPLAY_EVENT, this.restartLevel, this);
    this.resetTimer?.remove(false);
    this.resetTimer = null;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.time.paused = false;
    this.controls.destroy();
    this.resetVfx.destroy();
    this.echoes.clear();
    this.loop.clear();
    this.interactions.clear();
    this.interactors.length = 0;
    this.switches = [];
    this.doors = [];
    this.doorViews = [];
  }
}
