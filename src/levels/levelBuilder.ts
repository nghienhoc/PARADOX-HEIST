import Phaser from 'phaser';
import { OBJECTIVE } from '@/config/balance';
import { COLORS, DEPTH } from '@/config/theme';
import { Door } from '@/entities/Door';
import { DoorView } from '@/entities/DoorView';
import { PressureSwitch } from '@/entities/PressureSwitch';
import { PressureSwitchView } from '@/entities/PressureSwitchView';
import { validateLevel, type LevelDef } from '@/types/level';
import { TEX } from '@/utils/textures';

/** A door plus the view that renders and blocks for it. */
export interface BuiltDoor {
  door: Door;
  view: DoorView;
}

export interface BuiltLevel {
  /** Static collision bodies for every wall. */
  walls: Phaser.Physics.Arcade.StaticGroup;
  /** Static collision bodies for doors — separate so they can be toggled. */
  doorBodies: Phaser.Physics.Arcade.StaticGroup;
  switches: PressureSwitch[];
  doors: BuiltDoor[];
}

/**
 * Instantiate a level from data.
 *
 * Wall visuals are baked into a single Graphics object (one draw call for the whole room)
 * while collision uses invisible static bodies. Nothing here is redrawn per frame — the
 * room is static geometry.
 *
 * Mechanism *rules* are pure classes (`PressureSwitch`, `Door`); this function only builds
 * them and binds their state-change callbacks to view objects. The Time Core and extraction
 * pad are built by the scene, which owns the objective wiring.
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

  // --- Pressure switches ---
  const switches: PressureSwitch[] = [];
  for (const def of level.switches) {
    const radius = def.radius ?? OBJECTIVE.switchRadius;
    const mechanism = new PressureSwitch(def.id, def.x, def.y, radius);
    const view = new PressureSwitchView(scene, def.x, def.y, radius);
    mechanism.onStateChange = (held): void => view.setHeld(held);
    switches.push(mechanism);
  }

  const switchById = new Map(switches.map((s) => [s.id, s]));

  // --- Doors ---
  const doorBodies = scene.physics.add.staticGroup();
  const doors: BuiltDoor[] = [];

  for (const def of level.doors) {
    // Unknown ids are already reported by validateLevel; filter so a bad reference cannot
    // silently become an always-open door.
    const linked = def.switchIds
      .map((id) => switchById.get(id))
      .filter((s): s is PressureSwitch => s !== undefined);

    const door = new Door(def.id, def.x, def.y, def.w, def.h, linked);
    const view = new DoorView(scene, def, doorBodies);
    door.onStateChange = (open): void => view.setOpen(open);
    doors.push({ door, view });
  }

  return { walls, doorBodies, switches, doors };
}
