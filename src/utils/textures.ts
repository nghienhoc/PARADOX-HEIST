import Phaser from 'phaser';
import { COLORS } from '@/config/theme';

/**
 * Texture keys. Every visual in the game is generated procedurally at boot, so the
 * project ships with zero external image assets and a guaranteed-consistent style.
 */
export const TEX = {
  player: 'tex-player',
  echo: 'tex-echo',
  bullet: 'tex-bullet',
  bulletEcho: 'tex-bullet-echo',
  particle: 'tex-particle',
  glow: 'tex-glow',
  floorTile: 'tex-floor-tile',
  wall: 'tex-wall',
  core: 'tex-core',
} as const;

/** Draw the shared agent silhouette (body + aim nose) pointing along +X. */
function drawAgent(
  g: Phaser.GameObjects.Graphics,
  size: number,
  bodyColor: number,
  edgeColor: number,
  coreColor: number,
): void {
  const c = size / 2;
  const r = size * 0.34;

  g.fillStyle(bodyColor, 1);
  g.fillCircle(c, c, r);

  g.lineStyle(2, edgeColor, 1);
  g.strokeCircle(c, c, r);

  // Aim nose — deliberately large, because reading facing at a glance is what
  // makes a top-down shooter feel responsive.
  g.fillStyle(edgeColor, 1);
  g.fillTriangle(c + r * 0.3, c - r * 0.66, size - 1, c, c + r * 0.3, c + r * 0.66);

  g.fillStyle(coreColor, 0.95);
  g.fillCircle(c, c, r * 0.33);
}

/** Soft radial blob built from concentric circles — cheap stand-in for a gradient. */
function drawRadial(g: Phaser.GameObjects.Graphics, size: number, steps: number): void {
  const c = size / 2;
  for (let i = steps; i >= 1; i--) {
    const t = i / steps;
    g.fillStyle(0xffffff, (1 - t) * 0.5 + 0.04);
    g.fillCircle(c, c, c * t);
  }
}

/**
 * Generate every runtime texture. Call once from the boot scene.
 * Safe to call twice — existing keys are skipped.
 */
export function createTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  const bake = (key: string, width: number, height: number, draw: () => void): void => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, width, height);
  };

  // --- Characters ---
  bake(TEX.player, 40, 40, () => drawAgent(g, 40, COLORS.cyanDeep, COLORS.cyan, COLORS.white));
  bake(TEX.echo, 40, 40, () => drawAgent(g, 40, COLORS.echoDeep, COLORS.echo, COLORS.white));

  // --- Projectiles ---
  bake(TEX.bullet, 18, 6, () => {
    g.fillStyle(COLORS.cyan, 1);
    g.fillRect(0, 1, 18, 4);
    g.fillStyle(COLORS.white, 1);
    g.fillRect(10, 2, 8, 2);
  });
  bake(TEX.bulletEcho, 18, 6, () => {
    g.fillStyle(COLORS.echo, 1);
    g.fillRect(0, 1, 18, 4);
    g.fillStyle(COLORS.white, 0.9);
    g.fillRect(10, 2, 8, 2);
  });

  // --- Effects (tinted at runtime) ---
  bake(TEX.particle, 12, 12, () => drawRadial(g, 12, 4));
  bake(TEX.glow, 64, 64, () => drawRadial(g, 64, 10));

  // --- Environment ---
  bake(TEX.floorTile, 64, 64, () => {
    g.fillStyle(COLORS.floor, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(1, COLORS.floorLine, 0.6);
    g.strokeRect(0.5, 0.5, 63, 63);
    g.lineStyle(1, COLORS.floorLine, 0.28);
    g.beginPath();
    g.moveTo(32, 26);
    g.lineTo(32, 38);
    g.moveTo(26, 32);
    g.lineTo(38, 32);
    g.strokePath();
  });

  bake(TEX.wall, 32, 32, () => {
    g.fillStyle(COLORS.wall, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(COLORS.wallEdge, 0.55);
    g.fillRect(0, 0, 32, 3);
    g.lineStyle(1, COLORS.wallEdge, 0.25);
    g.strokeRect(0.5, 0.5, 31, 31);
  });

  // --- Objective ---
  bake(TEX.core, 36, 36, () => {
    g.fillStyle(COLORS.goldDeep, 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(18, 0),
        new Phaser.Geom.Point(36, 18),
        new Phaser.Geom.Point(18, 36),
        new Phaser.Geom.Point(0, 18),
      ],
      true,
    );
    g.fillStyle(COLORS.gold, 1);
    g.fillPoints(
      [
        new Phaser.Geom.Point(18, 6),
        new Phaser.Geom.Point(30, 18),
        new Phaser.Geom.Point(18, 30),
        new Phaser.Geom.Point(6, 18),
      ],
      true,
    );
    g.fillStyle(COLORS.white, 0.9);
    g.fillCircle(18, 18, 4);
  });

  g.destroy();
}
