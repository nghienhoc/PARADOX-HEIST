import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config/resolution';
import { COLORS } from '@/config/theme';

export function createGameConfig(
  scenes: Phaser.Types.Scenes.SceneType[],
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO, // WebGL when available, Canvas fallback.
    parent: 'game-root',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: COLORS.voidDark,
    antialias: true,
    roundPixels: true,
    autoFocus: true,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    fps: {
      target: 60,
      min: 30,
      // Phaser clamps its own delta; gameplay code clamps again via LOOP.maxDeltaMs.
      smoothStep: true,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: scenes,
  };
}
