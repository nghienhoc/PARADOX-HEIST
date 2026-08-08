import { OBJECTIVE } from '@/config/balance';
import type { Interactable, Interactor } from '@/types/interaction';

/**
 * A pressure plate: held while any valid body stands on it, released the moment nobody
 * does.
 *
 * This is the first mechanism that proves Echoes affect the world, and it needed **no**
 * special handling to get there. `livePlayerOnly` is false, so `InteractionSystem` hands
 * it every interactor in range — live player or replayed timeline alike. An Echo holds
 * the plate purely because its recorded position happens to be on it, with Echo movement
 * left fully authoritative and kinematic (MASTER_GAME_SPEC.md §6).
 *
 * Pure logic, no Phaser: visuals live in `PressureSwitchView`, driven by `onStateChange`.
 * Reusable as-is by later levels — nothing here knows about Level 01.
 */
export class PressureSwitch implements Interactable {
  readonly reactsToPresence = true;
  /** Standing on a plate is enough; there is nothing to press. */
  readonly reactsToInteractAction = false;
  /** Echoes are the whole point of this device. */
  readonly livePlayerOnly = false;

  /** Fired only on an actual state change, never every frame. */
  onStateChange: ((held: boolean) => void) | null = null;

  private held = false;
  private holders = 0;
  private liveHolder = false;

  constructor(
    readonly id: string,
    readonly x: number,
    readonly y: number,
    readonly interactRadius: number = OBJECTIVE.switchRadius,
  ) {}

  get isHeld(): boolean {
    return this.held;
  }

  /** How many bodies are on the plate. Multi-body plates become possible for free. */
  get holderCount(): number {
    return this.holders;
  }

  /** True when the live player is one of the holders — used for contextual hints. */
  get heldByLivePlayer(): boolean {
    return this.liveHolder;
  }

  onPresence(occupants: readonly Interactor[]): void {
    this.holders = occupants.length;

    this.liveHolder = false;
    for (let i = 0; i < occupants.length; i++) {
      if (occupants[i]!.isLivePlayer) {
        this.liveHolder = true;
        break;
      }
    }

    this.setHeld(occupants.length > 0);
  }

  onInteractAction(): boolean {
    return false;
  }

  resetForLoop(): void {
    this.holders = 0;
    this.liveHolder = false;
    this.setHeld(false);
  }

  private setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    this.onStateChange?.(held);
  }
}
