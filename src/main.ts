import Phaser from 'phaser';
import './style.css';
import { createGameConfig } from '@/config/gameConfig';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';

const game = new Phaser.Game(createGameConfig([BootScene, GameScene]));

// Pause the simulation while the tab is hidden. Without this, returning to the tab
// would replay the accumulated time and desynchronise the loop clock.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.loop.sleep();
  } else {
    game.loop.wake();
  }
});

if (import.meta.env.DEV) {
  // Vite HMR would otherwise leave a second Phaser.Game (and its WebGL context) alive.
  import.meta.hot?.dispose(() => game.destroy(true));
}
