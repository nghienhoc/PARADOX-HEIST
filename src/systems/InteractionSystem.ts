import type { Interactable, Interactor } from '@/types/interaction';

/**
 * Dispatches presence and Interact actions from interactors to interactables.
 *
 * Deliberately generic and Phaser-free. Nothing in here knows what a Time Core or a
 * pressure plate is, which is what lets the next phase add switches and doors without
 * touching this file or special-casing Echoes.
 */
export class InteractionSystem {
  private readonly interactables: Interactable[] = [];
  /** Reused scratch buffer, so the per-frame presence pass allocates nothing. */
  private readonly occupants: Interactor[] = [];

  register(interactable: Interactable): void {
    if (!this.interactables.includes(interactable)) {
      this.interactables.push(interactable);
    }
  }

  unregister(interactable: Interactable): void {
    const index = this.interactables.indexOf(interactable);
    if (index >= 0) this.interactables.splice(index, 1);
  }

  clear(): void {
    this.interactables.length = 0;
  }

  get count(): number {
    return this.interactables.length;
  }

  /**
   * Per-frame presence pass.
   *
   * Every presence-reactive interactable is notified every frame, including when
   * nobody is in range — that "empty" call is what lets a pressure plate release.
   */
  update(interactors: readonly Interactor[]): void {
    for (let i = 0; i < this.interactables.length; i++) {
      const target = this.interactables[i]!;
      if (!target.reactsToPresence) continue;

      this.occupants.length = 0;
      const radiusSq = target.interactRadius * target.interactRadius;

      for (let j = 0; j < interactors.length; j++) {
        const actor = interactors[j]!;
        if (!actor.isPresent) continue;
        if (target.livePlayerOnly && !actor.isLivePlayer) continue;

        const dx = actor.x - target.x;
        const dy = actor.y - target.y;
        if (dx * dx + dy * dy <= radiusSq) this.occupants.push(actor);
      }

      target.onPresence(this.occupants);
    }
  }

  /**
   * Dispatch one explicit Interact action to the nearest eligible interactable.
   *
   * Only the nearest is notified, so standing between two terminals is unambiguous.
   *
   * @returns true if something consumed the action.
   */
  triggerInteract(actor: Interactor): boolean {
    if (!actor.isPresent) return false;

    let best: Interactable | null = null;
    let bestDistSq = Number.POSITIVE_INFINITY;

    for (let i = 0; i < this.interactables.length; i++) {
      const target = this.interactables[i]!;
      if (!target.reactsToInteractAction) continue;
      if (target.livePlayerOnly && !actor.isLivePlayer) continue;

      const dx = actor.x - target.x;
      const dy = actor.y - target.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > target.interactRadius * target.interactRadius) continue;
      if (distSq >= bestDistSq) continue;

      best = target;
      bestDistSq = distSq;
    }

    return best ? best.onInteractAction(actor) : false;
  }

  /** Reset every interactable to its per-loop initial state. */
  resetForLoop(): void {
    for (let i = 0; i < this.interactables.length; i++) {
      this.interactables[i]!.resetForLoop();
    }
  }
}
