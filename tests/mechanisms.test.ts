import { beforeEach, describe, expect, it } from 'vitest';
import { Door } from '@/entities/Door';
import { ExtractionZone } from '@/entities/ExtractionZone';
import { PressureSwitch } from '@/entities/PressureSwitch';
import { TimeCore } from '@/entities/TimeCore';
import { InteractionSystem } from '@/systems/InteractionSystem';
import type { Interactor } from '@/types/interaction';

function actor(overrides: Partial<Interactor> = {}): Interactor {
  return { x: 0, y: 0, isLivePlayer: true, interactorId: 0, isPresent: true, ...overrides };
}

const player = (x: number, y: number): Interactor => actor({ x, y });
const echo = (x: number, y: number, id = 1): Interactor =>
  actor({ x, y, isLivePlayer: false, interactorId: id });

// ---------------------------------------------------------------------------
// Pressure switch
// ---------------------------------------------------------------------------

describe('PressureSwitch', () => {
  let plate: PressureSwitch;
  let changes: boolean[];

  beforeEach(() => {
    plate = new PressureSwitch('sw', 100, 100, 30);
    changes = [];
    plate.onStateChange = (held) => changes.push(held);
  });

  it('starts released', () => {
    expect(plate.isHeld).toBe(false);
    expect(plate.holderCount).toBe(0);
  });

  it('is held while the live player stands on it', () => {
    plate.onPresence([player(100, 100)]);
    expect(plate.isHeld).toBe(true);
    expect(plate.heldByLivePlayer).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('releases when nobody is on it', () => {
    plate.onPresence([player(100, 100)]);
    plate.onPresence([]);
    expect(plate.isHeld).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('is held by an Echo exactly as by the player', () => {
    // The whole point: no special-casing anywhere for replayed timelines.
    plate.onPresence([echo(100, 100, 7)]);
    expect(plate.isHeld).toBe(true);
    expect(plate.heldByLivePlayer).toBe(false);
    expect(plate.holderCount).toBe(1);
  });

  it('only reports a state change on an actual transition', () => {
    for (let frame = 0; frame < 30; frame++) plate.onPresence([player(100, 100)]);
    expect(changes).toEqual([true]);
  });

  it('stays held while at least one holder remains', () => {
    plate.onPresence([player(100, 100), echo(100, 100, 2)]);
    expect(plate.holderCount).toBe(2);

    plate.onPresence([echo(100, 100, 2)]);
    expect(plate.isHeld).toBe(true);
    expect(plate.heldByLivePlayer).toBe(false);
    expect(changes).toEqual([true]);
  });

  it('ignores explicit Interact actions — it is a plate, not a button', () => {
    expect(plate.onInteractAction()).toBe(false);
    expect(plate.isHeld).toBe(false);
  });

  it('releases on a loop reset', () => {
    plate.onPresence([player(100, 100)]);
    plate.resetForLoop();
    expect(plate.isHeld).toBe(false);
    expect(plate.holderCount).toBe(0);
    expect(changes).toEqual([true, false]);
  });

  it('is held through the InteractionSystem by a replaying Echo', () => {
    const system = new InteractionSystem();
    system.register(plate);

    system.update([echo(105, 98, 3)]);
    expect(plate.isHeld).toBe(true);

    system.update([echo(600, 600, 3)]);
    expect(plate.isHeld).toBe(false);
  });

  it('ignores an Echo whose recording has ended', () => {
    const system = new InteractionSystem();
    system.register(plate);
    system.update([actor({ x: 100, y: 100, isLivePlayer: false, interactorId: 4, isPresent: false })]);
    expect(plate.isHeld).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Door
// ---------------------------------------------------------------------------

describe('Door', () => {
  let plate: PressureSwitch;
  let door: Door;
  let changes: boolean[];

  beforeEach(() => {
    plate = new PressureSwitch('sw', 0, 0, 30);
    door = new Door('door', 100, 100, 40, 120, [plate]);
    changes = [];
    door.onStateChange = (open) => changes.push(open);
  });

  it('starts closed', () => {
    expect(door.isOpen).toBe(false);
    expect(door.requiredSwitchCount).toBe(1);
  });

  it('opens when its switch is held', () => {
    plate.onPresence([player(0, 0)]);
    door.update();
    expect(door.isOpen).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('closes again when the switch releases', () => {
    plate.onPresence([player(0, 0)]);
    door.update();
    plate.onPresence([]);
    door.update();
    expect(door.isOpen).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('opens for an Echo holding the switch', () => {
    plate.onPresence([echo(0, 0)]);
    door.update();
    expect(door.isOpen).toBe(true);
  });

  it('only reports a state change on an actual transition', () => {
    plate.onPresence([player(0, 0)]);
    for (let frame = 0; frame < 30; frame++) door.update();
    expect(changes).toEqual([true]);
  });

  it('resets to closed on a loop reset', () => {
    plate.onPresence([player(0, 0)]);
    door.update();
    door.resetForLoop();
    expect(door.isOpen).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('a door with no switches can never open — bad data fails closed', () => {
    const orphan = new Door('orphan', 0, 0, 10, 10, []);
    orphan.update();
    expect(orphan.isOpen).toBe(false);
  });
});

describe('Door with multiple switches', () => {
  it('requires every linked switch to be held', () => {
    const a = new PressureSwitch('a', 0, 0, 30);
    const b = new PressureSwitch('b', 200, 0, 30);
    const door = new Door('door', 0, 0, 10, 10, [a, b]);

    a.onPresence([player(0, 0)]);
    door.update();
    expect(door.isOpen).toBe(false);
    expect(door.heldSwitchCount).toBe(1);

    b.onPresence([echo(200, 0)]);
    door.update();
    expect(door.isOpen).toBe(true);
    expect(door.heldSwitchCount).toBe(2);

    // Losing either one shuts it again.
    a.onPresence([]);
    door.update();
    expect(door.isOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Extraction zone
// ---------------------------------------------------------------------------

describe('ExtractionZone', () => {
  let zone: ExtractionZone;
  let extractions: number;
  let coreHeld: boolean;

  beforeEach(() => {
    coreHeld = false;
    zone = new ExtractionZone(500, 500, 40, () => coreHeld);
    extractions = 0;
    zone.onExtracted = () => {
      extractions += 1;
    };
  });

  it('starts disarmed and does nothing when entered', () => {
    zone.onPresence([player(500, 500)]);
    expect(zone.isArmed).toBe(false);
    expect(zone.hasExtracted).toBe(false);
    expect(extractions).toBe(0);
  });

  it('requires the Time Core before it can be used', () => {
    zone.onPresence([player(500, 500)]);
    expect(extractions).toBe(0);

    coreHeld = true;
    zone.onPresence([player(500, 500)]);
    expect(extractions).toBe(1);
  });

  it('arms the same frame the Core is taken — no one-frame lag', () => {
    expect(zone.isArmed).toBe(false);
    coreHeld = true;
    expect(zone.isArmed).toBe(true);
  });

  it('disarms again if the Core is restored by a reset', () => {
    coreHeld = true;
    expect(zone.isArmed).toBe(true);
    coreHeld = false;
    expect(zone.isArmed).toBe(false);
    zone.onPresence([player(500, 500)]);
    expect(extractions).toBe(0);
  });

  it('completes exactly once however long the player stands on it', () => {
    coreHeld = true;
    for (let frame = 0; frame < 60; frame++) zone.onPresence([player(500, 500)]);
    expect(extractions).toBe(1);
  });

  it('can never be completed by an Echo', () => {
    coreHeld = true;
    zone.onPresence([echo(500, 500)]);
    expect(zone.onInteractAction(echo(500, 500))).toBe(false);
    expect(extractions).toBe(0);
    expect(zone.hasExtracted).toBe(false);
  });

  it('reports armed changes only on transition', () => {
    const armedChanges: boolean[] = [];
    zone.onArmedChange = (armed) => armedChanges.push(armed);

    coreHeld = true;
    zone.refresh();
    zone.refresh();
    coreHeld = false;
    zone.refresh();
    expect(armedChanges).toEqual([true, false]);
  });

  it('a loop reset does not undo a finished extraction', () => {
    coreHeld = true;
    zone.onPresence([player(500, 500)]);
    zone.resetForLoop();
    expect(zone.hasExtracted).toBe(true);
  });

  it('is no longer armed once used, so completion cannot re-fire', () => {
    coreHeld = true;
    zone.onPresence([player(500, 500)]);
    expect(zone.hasExtracted).toBe(true);
    expect(zone.isArmed).toBe(false);
  });

  it('resetLevel clears it for a replay', () => {
    coreHeld = true;
    zone.onPresence([player(500, 500)]);
    zone.resetLevel();

    expect(zone.hasExtracted).toBe(false);

    zone.onPresence([player(500, 500)]);
    expect(extractions).toBe(2);
  });

  it('filters Echoes out through the InteractionSystem', () => {
    const system = new InteractionSystem();
    system.register(zone);
    coreHeld = true;

    for (let frame = 0; frame < 10; frame++) system.update([echo(500, 500, 5)]);
    expect(extractions).toBe(0);

    system.update([echo(500, 500, 5), player(505, 495)]);
    expect(extractions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The full Level 01 objective chain
// ---------------------------------------------------------------------------

describe('Level 01 objective chain', () => {
  interface Room {
    system: InteractionSystem;
    plate: PressureSwitch;
    door: Door;
    core: TimeCore;
    exit: ExtractionZone;
    completions: number;
    /** Advance one frame with the given interactors. */
    frame: (interactors: Interactor[]) => void;
    resetLoop: () => void;
  }

  function buildRoom(): Room {
    const system = new InteractionSystem();
    const plate = new PressureSwitch('sw', 100, 100, 34);
    const door = new Door('door', 400, 300, 40, 120, [plate]);
    // completeOnCoreCollected = false: extraction is the win condition, so a reset before
    // getting out puts the Core back.
    const core = new TimeCore(800, 100, false, 34);
    const exit = new ExtractionZone(1100, 600, 44, () => core.isCollected);

    const room: Room = {
      system,
      plate,
      door,
      core,
      exit,
      completions: 0,
      // Mirrors GameScene.simulateLoop: presence pass, then mechanisms settle.
      frame: (interactors) => {
        system.update(interactors);
        door.update();
        exit.refresh();
      },
      resetLoop: () => {
        system.resetForLoop();
        door.resetForLoop();
      },
    };

    exit.onExtracted = () => {
      room.completions += 1;
    };

    system.register(plate);
    system.register(core);
    system.register(exit);
    return room;
  }

  it('cannot be solved by one timeline: stepping off the plate shuts the door', () => {
    const room = buildRoom();

    room.frame([player(100, 100)]);
    expect(room.door.isOpen).toBe(true);

    // The player has to leave the plate to reach the door.
    room.frame([player(400, 300)]);
    expect(room.door.isOpen).toBe(false);
  });

  it('is solved by two timelines: an Echo holds the plate while the player runs the heist', () => {
    const room = buildRoom();
    const holder = () => echo(100, 100, 1);

    // Loop 2: the Echo from loop 1 stands on the plate for the whole loop.
    room.frame([player(200, 600), holder()]);
    expect(room.door.isOpen).toBe(true);

    // Player walks east through the open door and takes the Core.
    room.frame([player(800, 100), holder()]);
    expect(room.core.isCollected).toBe(true);
    expect(room.exit.isArmed).toBe(true);

    // ...and reaches extraction.
    room.frame([player(1100, 600), holder()]);
    expect(room.completions).toBe(1);
    expect(room.exit.hasExtracted).toBe(true);
  });

  it('a reset before extraction restores the Core', () => {
    const room = buildRoom();
    const holder = () => echo(100, 100, 1);

    room.frame([player(800, 100), holder()]);
    expect(room.core.isCollected).toBe(true);

    room.resetLoop();

    expect(room.core.isCollected).toBe(false);
    expect(room.door.isOpen).toBe(false);
    expect(room.plate.isHeld).toBe(false);

    // And it can be collected again on the next timeline.
    room.frame([player(800, 100), holder()]);
    expect(room.core.isCollected).toBe(true);
  });

  it('an Echo standing on the Core and the pad cannot finish the level', () => {
    const room = buildRoom();

    for (let frame = 0; frame < 30; frame++) {
      room.frame([echo(100, 100, 1), echo(800, 100, 2), echo(1100, 600, 3)]);
    }

    expect(room.door.isOpen).toBe(true); // Echo 1 legitimately holds the plate.
    expect(room.core.isCollected).toBe(false); // But no Echo can take the Core...
    expect(room.completions).toBe(0); // ...or extract.
  });

  it('extraction is inert until the Core is actually taken', () => {
    const room = buildRoom();
    for (let frame = 0; frame < 10; frame++) room.frame([player(1100, 600)]);
    expect(room.completions).toBe(0);
  });

  it('completion fires once even if the player camps the pad', () => {
    const room = buildRoom();
    room.frame([player(800, 100), echo(100, 100, 1)]);
    for (let frame = 0; frame < 60; frame++) room.frame([player(1100, 600), echo(100, 100, 1)]);
    expect(room.completions).toBe(1);
  });
});
