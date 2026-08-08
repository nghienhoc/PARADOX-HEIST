import { OBJECTIVE } from '@/config/balance';
import type { Interactable, Interactor } from '@/types/interaction';

/**
 * The extraction pad: inert until the Time Core is in hand, then the level's exit.
 *
 * Armed state is **derived**, not pushed. The zone asks its `isCoreHeld` supplier at the
 * moment it matters, so it can never be one frame stale — pushing the state in would make
 * correctness depend on whether the caller happened to sync before or after the
 * interaction pass, which is exactly the kind of ordering bug that hides for weeks.
 *
 * Two independent guards make sure a replayed timeline can never finish the heist for the
 * player: `livePlayerOnly` filters Echoes out inside `InteractionSystem`, and `extract()`
 * re-checks `isLivePlayer`. The `used` latch means completion fires exactly once however
 * many frames the player stands on the pad.
 *
 * Pure logic, no Phaser — visuals live in `ExtractionZoneView`.
 */
export class ExtractionZone implements Interactable {
  readonly reactsToPresence = true;
  /** Pressing E on the pad also works, for players who expect it. */
  readonly reactsToInteractAction = true;
  /** The player must finish their own heist. */
  readonly livePlayerOnly = true;

  onArmedChange: ((armed: boolean) => void) | null = null;
  onExtracted: ((by: Interactor) => void) | null = null;

  private used = false;
  private lastArmed = false;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly interactRadius: number = OBJECTIVE.extractionRadius,
    /** Does the live player currently hold the Time Core? */
    private readonly isCoreHeld: () => boolean = () => false,
  ) {}

  /** Live-derived: armed exactly while the Core is held and the level is unfinished. */
  get isArmed(): boolean {
    return !this.used && this.isCoreHeld();
  }

  get hasExtracted(): boolean {
    return this.used;
  }

  /**
   * Emit `onArmedChange` if the derived armed state has changed since the last call.
   *
   * Purely for driving visuals — gameplay reads `isArmed` directly and never depends on
   * this having been called.
   */
  refresh(): void {
    const armed = this.isArmed;
    if (armed === this.lastArmed) return;
    this.lastArmed = armed;
    this.onArmedChange?.(armed);
  }

  onPresence(occupants: readonly Interactor[]): void {
    if (occupants.length === 0) return;
    // Occupants are pre-filtered to the live player by `livePlayerOnly`.
    this.extract(occupants[0]!);
  }

  onInteractAction(interactor: Interactor): boolean {
    return this.extract(interactor);
  }

  /** A loop reset does not clear a finished extraction — the level is over. */
  resetForLoop(): void {
    /* Armed state is derived from Core possession; there is nothing to restore. */
  }

  /** Full level restart. */
  resetLevel(): void {
    this.used = false;
    this.refresh();
  }

  /** @returns true if this call is the one that completed the level. */
  private extract(by: Interactor): boolean {
    if (this.used) return false;
    if (!by.isLivePlayer) return false;
    if (!this.isArmed) return false;

    this.used = true;
    this.onExtracted?.(by);
    return true;
  }
}
