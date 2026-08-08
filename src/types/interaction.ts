/**
 * The generic bridge between "things that act in the world" and "things the world
 * reacts to". Phaser-free, so it is fully unit testable.
 *
 * The point of this abstraction is that an Echo and the live player are the *same
 * kind of thing* to an interactable. That is what makes the Level 1 puzzle work
 * without any special-casing: a pressure plate simply asks "is anybody standing on
 * me?", and a replayed timeline answers yes exactly as the live player would.
 */

/** Something that can act on the world: the live player, or a replaying Echo. */
export interface Interactor {
  readonly x: number;
  readonly y: number;
  /** True only for the timeline the human is currently playing. */
  readonly isLivePlayer: boolean;
  /** Stable id: 0 for the live player, otherwise the Echo's timeline id. */
  readonly interactorId: number;
  /**
   * False when this interactor is not currently part of the world — an Echo whose
   * recording has already run out stops holding switches, because its timeline
   * never recorded it being there.
   */
  readonly isPresent: boolean;
}

/** Something the world reacts with: pressure plates, doors, terminals, the Time Core. */
export interface Interactable {
  readonly x: number;
  readonly y: number;
  /** Activation radius in pixels. */
  readonly interactRadius: number;

  /**
   * Reacts to interactors merely standing in range — pressure plates, and pickups
   * that are collected by walking into them.
   */
  readonly reactsToPresence: boolean;
  /** Reacts to an explicit Interact action (`E` for the player, a recorded
   * `EchoAction.Interact` for an Echo). */
  readonly reactsToInteractAction: boolean;
  /**
   * When true, Echoes are filtered out entirely and only the live player can
   * activate this. Used for objective-critical interactables so a replayed timeline
   * cannot complete the level on the player's behalf.
   */
  readonly livePlayerOnly: boolean;

  /**
   * Called every frame with the interactors currently in range (already filtered by
   * `isPresent` and `livePlayerOnly`). Receives an empty list when nobody is in
   * range, so a pressure plate can release itself.
   *
   * The array is a reused scratch buffer — read it, never retain it.
   */
  onPresence(occupants: readonly Interactor[]): void;

  /**
   * Called when an in-range interactor performs an explicit Interact action.
   * @returns true if the action was consumed.
   */
  onInteractAction(interactor: Interactor): boolean;

  /** Restore to this level's per-loop initial state (MASTER_GAME_SPEC.md §7). */
  resetForLoop(): void;
}
