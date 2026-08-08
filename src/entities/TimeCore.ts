import { OBJECTIVE } from '@/config/balance';
import type { Interactable, Interactor } from '@/types/interaction';

/**
 * The Time Core — the level objective.
 *
 * Pure logic, no Phaser: the visual side lives in `TimeCoreView` and is driven by the
 * `onCollected` / `onRestored` callbacks. That split is what makes pickup rules
 * directly unit testable.
 *
 * Rules (MASTER_GAME_SPEC.md §8, prompt 2 part 6):
 * - Collected by the live player walking into it, or by pressing Interact in range.
 * - Collection happens exactly once per loop; repeat contact does nothing.
 * - **Echoes can never collect it.** `livePlayerOnly` filters them out at the
 *   InteractionSystem level, and `collect()` re-checks, so a replayed timeline can
 *   never complete the level on the player's behalf.
 * - On a timeline reset the Core is restored, unless the level is permanently
 *   completed.
 */
export class TimeCore implements Interactable {
  readonly reactsToPresence = true;
  readonly reactsToInteractAction = true;
  readonly livePlayerOnly = true;

  /** Fired when the Core is picked up. */
  onCollected: ((by: Interactor) => void) | null = null;
  /** Fired when a loop reset puts the Core back. */
  onRestored: (() => void) | null = null;
  /** Fired the moment the level becomes permanently complete. */
  onLevelCompleted: (() => void) | null = null;

  private collected = false;
  private completed = false;

  /**
   * @param completesLevelOnCollect When true, picking the Core up permanently
   *   completes the level and it is *not* restored by later resets. When false the
   *   pickup is per-loop and every reset puts it back — which is the mode an
   *   extraction point will use once carrying the Core somewhere is implemented.
   */
  constructor(
    readonly x: number,
    readonly y: number,
    private readonly completesLevelOnCollect: boolean,
    readonly interactRadius: number = OBJECTIVE.coreCollectRadius,
  ) {}

  /** True while the Core is in the player's hands (or gone) this loop. */
  get isCollected(): boolean {
    return this.collected;
  }

  /** True once the level is permanently finished. */
  get isLevelComplete(): boolean {
    return this.completed;
  }

  onPresence(occupants: readonly Interactor[]): void {
    if (occupants.length === 0) return;
    // Occupants are pre-filtered to the live player by `livePlayerOnly`.
    this.collect(occupants[0]!);
  }

  onInteractAction(interactor: Interactor): boolean {
    return this.collect(interactor);
  }

  resetForLoop(): void {
    if (this.completed) return; // Permanently done — stays collected.
    if (!this.collected) return;

    this.collected = false;
    this.onRestored?.();
  }

  /** Full level restart: wipe permanent progress too. */
  resetLevel(): void {
    const wasHidden = this.collected;
    this.collected = false;
    this.completed = false;
    if (wasHidden) this.onRestored?.();
  }

  /** @returns true if this call is the one that collected the Core. */
  private collect(by: Interactor): boolean {
    if (this.collected) return false; // Once only — no duplicate collection.
    if (!by.isLivePlayer) return false; // Echoes never complete the objective.

    this.collected = true;
    this.onCollected?.(by);

    if (this.completesLevelOnCollect && !this.completed) {
      this.completed = true;
      this.onLevelCompleted?.();
    }

    return true;
  }
}
