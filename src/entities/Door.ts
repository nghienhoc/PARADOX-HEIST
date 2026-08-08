import type { PressureSwitch } from '@/entities/PressureSwitch';

/**
 * A security door driven by one or more pressure switches.
 *
 * Opens only while **every** linked switch is held, which makes the
 * multiple-simultaneous-switches puzzle in later levels a data change rather than a code
 * change. A door with no linked switches stays permanently shut — a level-data mistake
 * should fail closed, not hand the player a free route.
 *
 * Pure logic, no Phaser: the collision body and visuals live in `DoorView`, driven by
 * `onStateChange`. Nothing here knows about Level 01.
 */
export class Door {
  /** Fired only on an actual state change, never every frame. */
  onStateChange: ((open: boolean) => void) | null = null;

  private open = false;

  constructor(
    readonly id: string,
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number,
    private readonly switches: readonly PressureSwitch[],
  ) {}

  get isOpen(): boolean {
    return this.open;
  }

  /** Number of linked switches currently held — drives partial-progress visuals. */
  get heldSwitchCount(): number {
    let n = 0;
    for (let i = 0; i < this.switches.length; i++) {
      if (this.switches[i]!.isHeld) n += 1;
    }
    return n;
  }

  get requiredSwitchCount(): number {
    return this.switches.length;
  }

  /**
   * Recompute from the linked switches. Call once per frame, after the interaction
   * presence pass, so the door reacts to this frame's positions.
   */
  update(): void {
    const shouldOpen =
      this.switches.length > 0 && this.heldSwitchCount === this.switches.length;
    this.setOpen(shouldOpen);
  }

  /** Restore the closed initial state (MASTER_GAME_SPEC.md §7). */
  resetForLoop(): void {
    this.setOpen(false);
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.onStateChange?.(open);
  }
}
