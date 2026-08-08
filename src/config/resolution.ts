/**
 * Logical game resolution. All layout maths assume this size and are scaled to fit
 * the viewport by Phaser's FIT scale mode.
 *
 * Kept in its own Phaser-free module so level data and pure logic can reference the
 * room size without dragging Phaser (and therefore a DOM) into unit tests.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
