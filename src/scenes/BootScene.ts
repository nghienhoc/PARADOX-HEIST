import Phaser from 'phaser';
import { SCENES } from '@/scenes/SceneKeys';
import { createTextures } from '@/utils/textures';

/**
 * Generates every procedural texture, then hands off to the game.
 *
 * There are no files to preload — all art is drawn at runtime — so this scene is
 * effectively instant. It stays a separate scene so that when real audio and font
 * loading arrive, there is already a place for them.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    createTextures(this);
    this.scene.start(SCENES.game);
  }
}
