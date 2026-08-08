import Phaser from 'phaser';
import { DASH, PLAYER, WEAPON } from '@/config/balance';
import { DEPTH } from '@/config/theme';
import type { InputSystem } from '@/systems/InputSystem';
import { AnimationState, EchoAction, type EchoSampleState } from '@/types/echo';
import type { Interactor } from '@/types/interaction';
import { lerp } from '@/utils/math';
import { TEX } from '@/utils/textures';

/** Emitted when the player fires. The scene owns projectile spawning. */
export type FireHandler = (x: number, y: number, angle: number) => void;

/** Emitted when the player presses Interact. The scene routes it to the world. */
export type InteractHandler = (interactor: Interactor) => void;

/**
 * The live player.
 *
 * Responsibilities are limited to locomotion, aiming, dashing and weapon timing.
 * World effects (bullets, particles, camera) are delegated to the scene through
 * `onFire` / `onInteract`, which keeps the entity free of scene-specific knowledge.
 *
 * Implements `Interactor` with `isLivePlayer = true`; an `Echo` implements the same
 * interface with `false`, which is the only difference the world sees between them.
 */
export class Player extends Phaser.Physics.Arcade.Sprite implements Interactor {
  readonly isLivePlayer = true;
  /** Reserved id 0. Echo interactor ids are their timeline ids, which start at 1. */
  readonly interactorId = 0;
  /** The live player is always part of the world. */
  readonly isPresent = true;

  onFire: FireHandler | null = null;
  onInteract: InteractHandler | null = null;

  /** Actions performed since the recorder last took a sample. */
  private pendingActions = EchoAction.None;
  private animState: AnimationState = AnimationState.Idle;

  private dashUntil = -Infinity;
  private dashReadyAt = -Infinity;
  private readonly dashDir = new Phaser.Math.Vector2(1, 0);
  private nextShotAt = -Infinity;

  /** Reused sample object — recording must not allocate per frame. */
  private readonly sampleState: EchoSampleState = {
    x: 0,
    y: 0,
    rotation: 0,
    animationState: AnimationState.Idle,
    actionMask: EchoAction.None,
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.player);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.player);
    this.setCircle(PLAYER.radius, this.width / 2 - PLAYER.radius, this.height / 2 - PLAYER.radius);
    this.setCollideWorldBounds(true);
  }

  get isDashing(): boolean {
    return this.scene.time.now < this.dashUntil;
  }

  /** 0 = ready, 1 = just used. Drives the HUD cooldown bar. */
  dashCooldownRatio(nowMs: number): number {
    const remaining = this.dashReadyAt - nowMs;
    if (remaining <= 0) return 0;
    return Math.min(1, remaining / DASH.cooldownMs);
  }

  /** Advance one frame. `deltaMs` is already clamped by the scene. */
  tick(nowMs: number, deltaMs: number, input: InputSystem): void {
    this.updateAim(input);
    this.updateDash(nowMs, input);
    this.updateMovement(nowMs, deltaMs, input);
    this.updateWeapon(nowMs, input);
    this.updateInteract(input);
  }

  /**
   * Interact (`E`).
   *
   * Recorded into the timeline as `EchoAction.Interact`, so an Echo replaying this
   * timeline performs the same interaction at the same moment.
   */
  private updateInteract(input: InputSystem): void {
    if (!input.justPressed('interact')) return;

    this.pendingActions |= EchoAction.Interact;
    this.onInteract?.(this);
  }

  private updateAim(input: InputSystem): void {
    this.setRotation(Phaser.Math.Angle.Between(this.x, this.y, input.aimX, input.aimY));
  }

  private updateDash(nowMs: number, input: InputSystem): void {
    if (this.isDashing) return;
    if (nowMs < this.dashReadyAt) return;
    if (!input.consumeDash(nowMs)) return;

    // Dash toward the movement input, or toward the aim direction when standing still.
    if (input.move.lengthSq() > 0) {
      this.dashDir.copy(input.move).normalize();
    } else {
      this.dashDir.setToPolar(this.rotation, 1);
    }

    this.dashUntil = nowMs + DASH.durationMs;
    this.dashReadyAt = nowMs + DASH.cooldownMs;
    this.pendingActions |= EchoAction.Dash;
  }

  private updateMovement(nowMs: number, deltaMs: number, input: InputSystem): void {
    const body = this.body as Phaser.Physics.Arcade.Body;

    if (nowMs < this.dashUntil) {
      body.velocity.set(this.dashDir.x * DASH.speed, this.dashDir.y * DASH.speed);
      this.animState = AnimationState.Dash;
      this.setScale(1.18, 0.86); // Squash-and-stretch reads as speed.
      return;
    }

    this.setScale(lerp(this.scaleX, 1, 0.25), lerp(this.scaleY, 1, 0.25));

    const moving = input.move.lengthSq() > 0;
    const targetX = input.move.x * PLAYER.speed;
    const targetY = input.move.y * PLAYER.speed;
    const responseMs = moving ? PLAYER.accelMs : PLAYER.decelMs;
    const k = Math.min(1, deltaMs / responseMs);

    body.velocity.set(
      lerp(body.velocity.x, targetX, k),
      lerp(body.velocity.y, targetY, k),
    );

    this.animState = moving ? AnimationState.Move : AnimationState.Idle;
  }

  private updateWeapon(nowMs: number, input: InputSystem): void {
    if (!input.isFiring || nowMs < this.nextShotAt) return;

    this.nextShotAt = nowMs + WEAPON.cooldownMs;
    this.pendingActions |= EchoAction.Shoot;

    const muzzleX = this.x + Math.cos(this.rotation) * WEAPON.muzzleOffset;
    const muzzleY = this.y + Math.sin(this.rotation) * WEAPON.muzzleOffset;
    this.onFire?.(muzzleX, muzzleY, this.rotation);

    // Recoil: a small backwards nudge, visible but not disruptive.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.velocity.x -= Math.cos(this.rotation) * WEAPON.recoil;
    body.velocity.y -= Math.sin(this.rotation) * WEAPON.recoil;
  }

  /**
   * Current state for the recorder. The returned object is reused — read it
   * immediately, never store it.
   */
  readSampleState(): EchoSampleState {
    this.sampleState.x = this.x;
    this.sampleState.y = this.y;
    this.sampleState.rotation = this.rotation;
    this.sampleState.animationState = this.animState;
    this.sampleState.actionMask = this.pendingActions;
    return this.sampleState;
  }

  /**
   * Clear buffered actions. Called only once the recorder has actually committed
   * a frame, so an action fired between two samples is never lost.
   */
  clearPendingActions(): void {
    this.pendingActions = EchoAction.None;
  }

  /** Put the player back at the loop's starting state. */
  respawn(x: number, y: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.reset(x, y);
    body.velocity.set(0, 0);

    this.pendingActions = EchoAction.None;
    this.animState = AnimationState.Idle;
    this.dashUntil = -Infinity;
    this.dashReadyAt = -Infinity;
    this.nextShotAt = -Infinity;

    this.setScale(1, 1);
    this.setAlpha(1);
    this.setActive(true).setVisible(true);
  }
}
