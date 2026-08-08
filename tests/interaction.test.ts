import { beforeEach, describe, expect, it } from 'vitest';
import { InteractionSystem } from '@/systems/InteractionSystem';
import type { Interactable, Interactor } from '@/types/interaction';

/** Stand-in for the live player / an Echo. */
function actor(overrides: Partial<Interactor> = {}): Interactor {
  return {
    x: 0,
    y: 0,
    isLivePlayer: true,
    interactorId: 0,
    isPresent: true,
    ...overrides,
  };
}

/**
 * Stand-in for a pressure plate — exactly the shape the Level 1 puzzle needs:
 * held while anybody (player *or* Echo) stands on it, released otherwise.
 */
class TestPlate implements Interactable {
  readonly reactsToPresence = true;
  readonly reactsToInteractAction = false;

  held = false;
  heldBy: number[] = [];
  presenceCalls = 0;
  resets = 0;

  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly interactRadius = 30,
    readonly livePlayerOnly = false,
  ) {}

  onPresence(occupants: readonly Interactor[]): void {
    this.presenceCalls += 1;
    this.held = occupants.length > 0;
    this.heldBy = occupants.map((o) => o.interactorId);
  }

  onInteractAction(): boolean {
    return false;
  }

  resetForLoop(): void {
    this.resets += 1;
    this.held = false;
    this.heldBy = [];
  }
}

/** Stand-in for a terminal that needs an explicit Interact press. */
class TestTerminal implements Interactable {
  readonly reactsToPresence = false;
  readonly reactsToInteractAction = true;

  activations = 0;
  lastActivatedBy = -1;

  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly interactRadius = 30,
    readonly livePlayerOnly = false,
  ) {}

  onPresence(): void {
    /* not a presence device */
  }

  onInteractAction(interactor: Interactor): boolean {
    this.activations += 1;
    this.lastActivatedBy = interactor.interactorId;
    return true;
  }

  resetForLoop(): void {
    this.activations = 0;
    this.lastActivatedBy = -1;
  }
}

describe('InteractionSystem — presence', () => {
  let system: InteractionSystem;
  let plate: TestPlate;

  beforeEach(() => {
    system = new InteractionSystem();
    plate = new TestPlate(100, 100, 30);
    system.register(plate);
  });

  it('holds while an interactor is inside the radius', () => {
    system.update([actor({ x: 100, y: 110 })]);
    expect(plate.held).toBe(true);
  });

  it('releases when the interactor leaves', () => {
    system.update([actor({ x: 100, y: 100 })]);
    expect(plate.held).toBe(true);

    system.update([actor({ x: 400, y: 400 })]);
    expect(plate.held).toBe(false);
  });

  it('is notified every frame, including when nobody is in range', () => {
    system.update([]);
    system.update([]);
    expect(plate.presenceCalls).toBe(2);
    expect(plate.held).toBe(false);
  });

  it('treats an Echo exactly like the live player', () => {
    // This is the whole point of the abstraction: the Level 1 puzzle needs an Echo
    // to hold a plate with no special-casing anywhere.
    system.update([actor({ x: 100, y: 100, isLivePlayer: false, interactorId: 7 })]);
    expect(plate.held).toBe(true);
    expect(plate.heldBy).toEqual([7]);
  });

  it('reports every occupant, so multi-body plates are possible later', () => {
    system.update([
      actor({ x: 100, y: 100, interactorId: 0 }),
      actor({ x: 105, y: 95, isLivePlayer: false, interactorId: 1 }),
      actor({ x: 900, y: 900, isLivePlayer: false, interactorId: 2 }),
    ]);
    expect(plate.heldBy).toEqual([0, 1]);
  });

  it('ignores an Echo whose recording has run out', () => {
    system.update([actor({ x: 100, y: 100, isLivePlayer: false, interactorId: 3, isPresent: false })]);
    expect(plate.held).toBe(false);
  });

  it('uses a circular radius, not a bounding box', () => {
    // 25px away on each axis — inside a 30px box, but 35.4px diagonally, so outside
    // a 30px circle.
    system.update([actor({ x: 125, y: 125 })]);
    expect(plate.held).toBe(false);

    // Same distance along one axis only: inside.
    system.update([actor({ x: 125, y: 100 })]);
    expect(plate.held).toBe(true);
  });

  it('filters Echoes out of livePlayerOnly interactables', () => {
    const exclusive = new TestPlate(100, 100, 30, true);
    const solo = new InteractionSystem();
    solo.register(exclusive);

    solo.update([actor({ x: 100, y: 100, isLivePlayer: false, interactorId: 5 })]);
    expect(exclusive.held).toBe(false);

    solo.update([actor({ x: 100, y: 100 })]);
    expect(exclusive.held).toBe(true);
  });
});

describe('InteractionSystem — Interact actions', () => {
  it('activates an in-range terminal once per call', () => {
    const system = new InteractionSystem();
    const terminal = new TestTerminal(50, 50, 40);
    system.register(terminal);

    expect(system.triggerInteract(actor({ x: 60, y: 50 }))).toBe(true);
    expect(terminal.activations).toBe(1);
  });

  it('does nothing when out of range', () => {
    const system = new InteractionSystem();
    const terminal = new TestTerminal(50, 50, 40);
    system.register(terminal);

    expect(system.triggerInteract(actor({ x: 500, y: 500 }))).toBe(false);
    expect(terminal.activations).toBe(0);
  });

  it('only notifies the nearest eligible interactable', () => {
    const system = new InteractionSystem();
    const near = new TestTerminal(100, 100, 60);
    const far = new TestTerminal(140, 100, 60);
    system.register(near);
    system.register(far);

    system.triggerInteract(actor({ x: 105, y: 100 }));

    expect(near.activations).toBe(1);
    expect(far.activations).toBe(0);
  });

  it('lets a replayed Echo interact, recording which timeline did it', () => {
    const system = new InteractionSystem();
    const terminal = new TestTerminal(0, 0, 40);
    system.register(terminal);

    system.triggerInteract(actor({ x: 10, y: 0, isLivePlayer: false, interactorId: 4 }));

    expect(terminal.activations).toBe(1);
    expect(terminal.lastActivatedBy).toBe(4);
  });

  it('blocks Echoes from livePlayerOnly interactables', () => {
    const system = new InteractionSystem();
    const objective = new TestTerminal(0, 0, 40, true);
    system.register(objective);

    expect(system.triggerInteract(actor({ x: 5, y: 0, isLivePlayer: false, interactorId: 2 }))).toBe(
      false,
    );
    expect(objective.activations).toBe(0);

    expect(system.triggerInteract(actor({ x: 5, y: 0 }))).toBe(true);
    expect(objective.activations).toBe(1);
  });

  it('ignores an interactor that is not present', () => {
    const system = new InteractionSystem();
    const terminal = new TestTerminal(0, 0, 40);
    system.register(terminal);

    expect(system.triggerInteract(actor({ x: 0, y: 0, isPresent: false }))).toBe(false);
    expect(terminal.activations).toBe(0);
  });

  it('ignores presence-only interactables', () => {
    const system = new InteractionSystem();
    const plate = new TestPlate(0, 0, 40);
    system.register(plate);

    expect(system.triggerInteract(actor({ x: 0, y: 0 }))).toBe(false);
  });
});

describe('InteractionSystem — registry', () => {
  it('resets every interactable for a new loop', () => {
    const system = new InteractionSystem();
    const a = new TestPlate();
    const b = new TestPlate();
    system.register(a);
    system.register(b);

    system.resetForLoop();

    expect(a.resets).toBe(1);
    expect(b.resets).toBe(1);
  });

  it('does not register the same interactable twice', () => {
    const system = new InteractionSystem();
    const plate = new TestPlate();
    system.register(plate);
    system.register(plate);

    expect(system.count).toBe(1);
    system.update([actor({ x: 0, y: 0 })]);
    expect(plate.presenceCalls).toBe(1);
  });

  it('unregister and clear remove interactables', () => {
    const system = new InteractionSystem();
    const a = new TestPlate();
    const b = new TestPlate();
    system.register(a);
    system.register(b);

    system.unregister(a);
    expect(system.count).toBe(1);

    system.clear();
    expect(system.count).toBe(0);
  });
});
