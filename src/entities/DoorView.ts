import Phaser from 'phaser';
import { COLORS, DEPTH } from '@/config/theme';
import type { DoorDef } from '@/types/level';
import { TEX } from '@/utils/textures';

/**
 * Visual and physical half of a security door. Holds no rules — driven by
 * `Door.onStateChange`.
 *
 * The collision body is a static arcade body that is disabled while the door is open.
 * Echoes are unaffected either way: they have no physics body at all, so a door can never
 * displace a replaying timeline (MASTER_GAME_SPEC.md §6).
 */
export class DoorView {
  /** Static body, enabled only while the door is shut. */
  readonly body: Phaser.Physics.Arcade.Sprite;

  private readonly barrier: Phaser.GameObjects.TileSprite;
  private readonly frame: Phaser.GameObjects.Graphics;
  private retract: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly def: DoorDef,
    group: Phaser.Physics.Arcade.StaticGroup,
  ) {
    const cx = def.x + def.w / 2;
    const cy = def.y + def.h / 2;

    // Frame is always visible, so the doorway reads as a doorway even when open.
    this.frame = scene.add.graphics().setDepth(DEPTH.environment + 1);
    this.frame.lineStyle(3, COLORS.wallEdge, 0.9);
    this.frame.strokeRect(def.x, def.y, def.w, def.h);
    this.frame.fillStyle(COLORS.wallEdge, 0.5);
    this.frame.fillRect(def.x, def.y - 4, def.w, 4);
    this.frame.fillRect(def.x, def.y + def.h, def.w, 4);

    this.barrier = scene.add
      .tileSprite(cx, cy, def.w, def.h, TEX.doorBarrier)
      .setDepth(DEPTH.interactable)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(COLORS.red);

    this.body = group.create(cx, cy, TEX.wall) as Phaser.Physics.Arcade.Sprite;
    this.body.setVisible(false);
    this.body.setDisplaySize(def.w, def.h);
    this.body.refreshBody();

    this.setOpen(false);
  }

  setOpen(open: boolean): void {
    const staticBody = this.body.body as Phaser.Physics.Arcade.StaticBody | null;
    if (staticBody) staticBody.enable = !open;

    this.retract?.remove();
    this.retract = null;

    if (open) {
      // Barrier snaps thin and fades — fast enough that the player can walk straight
      // through the frame the moment the switch is held.
      this.frame.setAlpha(0.9);
      this.retract = this.scene.tweens.add({
        targets: this.barrier,
        scaleY: 0.04,
        alpha: 0,
        duration: 140,
        ease: 'Quad.In',
        onComplete: () => this.barrier.setVisible(false),
      });
      this.barrier.setTint(COLORS.cyan);
    } else {
      this.barrier.setVisible(true).setTint(COLORS.red).setAlpha(1);
      this.retract = this.scene.tweens.add({
        targets: this.barrier,
        scaleY: 1,
        duration: 130,
        ease: 'Quad.Out',
      });
    }
  }

  /** Scroll the energy bands so a shut door never looks like static geometry. */
  update(deltaMs: number): void {
    if (!this.barrier.visible) return;
    this.barrier.tilePositionY -= deltaMs * 0.05;
  }

  get id(): string {
    return this.def.id;
  }
}
