/** Central registry of scene keys so no string is duplicated across the codebase. */
export const SCENES = {
  boot: 'BootScene',
  game: 'GameScene',
  result: 'ResultScene',
} as const;

/** Event emitted on `game.events` when the result screen asks for a replay. */
export const REPLAY_EVENT = 'paradox:replay';
