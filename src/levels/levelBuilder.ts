import Phaser from 'phaser';
import { COLORS, DEPTH } from '@/config/theme';
import { validateLevel, type LevelDef } from '@/types/level';
import { TEX } from '@/utils/textures';

export interface BuiltLevel {
  /** Static collision bodies for every wall. */
  walls: Phaser.Physics.Arcade.StaticGroup;
}

/**
 * Instantiate a level from data.
 *
 * Wall visuals are baked into a single Graphics object (one draw call for the whole
 * room) while collision uses invisible static bodies. Nothing here is redrawn per
 * frame — the room is static geometry.
 */
export function buildLevel(scene: Phaser.Scene, level: LevelDef): BuiltLevel {
  const errors = validateLevel(level);
  if (errors.length > 0) {
    // Loud in development, non-fatal in production: the room still builds.
    const message = `[levelBuilder] Invalid level "${level.id}":\n - ${errors.join('\n - ')}`;
    if (import.meta.env.DEV) throw new Error(message);
    console.error(message);
  }

  scene.physics.world.setBounds(0, 0, level.width, level.height);
  scene.cameras.main.setBounds(0, 0, level.width, level.height);

  // --- Floor: one tiled sprite, one draw call. ---
  scene.add
    .tileSprite(0, 0, level.width, level.height, TEX.floorTile)
    .setOrigin(0, 0)
    .setDepth(DEPTH.background);

  // --- Walls: baked visuals + invisible bodies. ---
  const graphics = scene.add.graphics().setDepth(DEPTH.environment);
  const walls = scene.physics.add.staticGroup();

  for (const wall of level.walls) {
    graphics.fillStyle(COLORS.wall, 1);
    graphics.fillRect(wall.x, wall.y, wall.w, wall.h);

    // Lit top edge gives the flat blocks a readable silhouette.
    graphics.fillStyle(COLORS.wallEdge, 0.5);
    graphics.fillRect(wall.x, wall.y, wall.w, 3);
    graphics.lineStyle(1, COLORS.wallEdge, 0.22);
    graphics.strokeRect(wall.x + 0.5, wall.y + 0.5, wall.w - 1, wall.h - 1);

    const body = walls.create(
      wall.x + wall.w / 2,
      wall.y + wall.h / 2,
      TEX.wall,
    ) as Phaser.Physics.Arcade.Sprite;
    body.setVisible(false);
    body.setDisplaySize(wall.w, wall.h);
    body.refreshBody();
  }

  // The Time Core is not built here: its logic lives in `TimeCore` and its visuals in
  // `TimeCoreView`, wired together by the scene. Keeping it out of the builder is what
  // lets the pickup rules be unit tested without a renderer.
  return { walls };
}
