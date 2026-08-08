import Phaser from 'phaser';
import { WEAPON } from '@/config/balance';
import { DEPTH } from '@/config/theme';
import { TEX } from '@/utils/textures';

/**
 * A pooled bullet. Never constructed during gameplay — the pool preallocates and
 * recycles instances, so firing allocates nothing.
 */
export class Projectile extends Phaser.Physics.Arcade.Image {
  /** Scene time (ms) at which this bullet expires. */
  private expiresAt = 0;
  /** True when the shot came from an Echo rather than the live player. */
  fromEcho = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.bullet);
    this.setDepth(DEPTH.projectile);
    this.setActive(false).setVisible(false);
  }

  launch(x: number, y: number, angle: number, nowMs: number, fromEcho: boolean): void {
    this.fromEcho = fromEcho;
    this.setTexture(fromEcho ? TEX.bulletEcho : TEX.bullet);
    this.enableBody(true, x, y, true, true);
    this.setRotation(angle);
    this.setBlendMode(Phaser.BlendModes.ADD);

    // Small circular body centred in the 18x6 sprite, so grazing a wall corner
    // does not read as a phantom hit.
    this.setCircle(3, this.width / 2 - 3, this.height / 2 - 3);
    this.setVelocity(
      Math.cos(angle) * WEAPON.projectileSpeed,
      Math.sin(angle) * WEAPON.projectileSpeed,
    );

    this.expiresAt = nowMs + WEAPON.projectileLifeMs;
  }

  isExpired(nowMs: number): boolean {
    return nowMs >= this.expiresAt;
  }

  /** Return to the pool. */
  recycle(): void {
    this.disableBody(true, true);
  }
}

/** Fixed-capacity projectile pool built on an arcade physics group. */
export class ProjectilePool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, max: number = WEAPON.maxProjectiles) {
    this.group = scene.physics.add.group({
      classType: Projectile,
      maxSize: max,
      runChildUpdate: false,
    });
  }

  /**
   * Fire a bullet.
   * @returns The projectile, or `null` when the hard cap is reached.
   */
  spawn(x: number, y: number, angle: number, nowMs: number, fromEcho: boolean): Projectile | null {
    const bullet = this.group.get(x, y) as Projectile | null;
    if (!bullet) return null;
    bullet.launch(x, y, angle, nowMs, fromEcho);
    return bullet;
  }

  /** Recycle bullets that have outlived their lifetime. */
  update(nowMs: number): void {
    const children = this.group.getChildren();
    for (let i = 0; i < children.length; i++) {
      const bullet = children[i] as Projectile;
      if (bullet.active && bullet.isExpired(nowMs)) bullet.recycle();
    }
  }

  /** Recycle everything — called on every timeline reset. */
  releaseAll(): void {
    const children = this.group.getChildren();
    for (let i = 0; i < children.length; i++) {
      const bullet = children[i] as Projectile;
      if (bullet.active) bullet.recycle();
    }
  }

  get activeCount(): number {
    return this.group.countActive(true);
  }
}
