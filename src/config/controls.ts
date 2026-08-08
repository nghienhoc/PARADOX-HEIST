/**
 * Key bindings, declared as data so remapping later only touches this file.
 * Values are Phaser key-code names (`Phaser.Input.Keyboard.KeyCodes` keys).
 */
export const KEYS = {
  up: ['W', 'UP'],
  down: ['S', 'DOWN'],
  left: ['A', 'LEFT'],
  right: ['D', 'RIGHT'],
  dash: ['SPACE'],
  interact: ['E'],
  emp: ['Q'],
  resetTimeline: ['R'],
  pause: ['ESC'],
  mute: ['M'],
} as const;

export type ControlAction = keyof typeof KEYS;
