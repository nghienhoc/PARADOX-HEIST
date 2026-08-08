import { beforeEach, describe, expect, it } from 'vitest';
import { TimeCore } from '@/entities/TimeCore';
import { InteractionSystem } from '@/systems/InteractionSystem';
import type { Interactor } from '@/types/interaction';

const CORE_X = 200;
const CORE_Y = 200;
const RADIUS = 34;

function actor(overrides: Partial<Interactor> = {}): Interactor {
  return { x: 0, y: 0, isLivePlayer: true, interactorId: 0, isPresent: true, ...overrides };
}

const player = (x: number, y: number): Interactor => actor({ x, y });
const echo = (x: number, y: number, id = 1): Interactor =>
  actor({ x, y, isLivePlayer: false, interactorId: id });

describe('TimeCore — collection', () => {
  let core: TimeCore;
  let collectedCount: number;
  let restoredCount: number;
  let completedCount: number;

  beforeEach(() => {
    core = new TimeCore(CORE_X, CORE_Y, true, RADIUS);
    collectedCount = 0;
    restoredCount = 0;
    completedCount = 0;
    core.onCollected = () => {
      collectedCount += 1;
    };
    core.onRestored = () => {
      restoredCount += 1;
    };
    core.onLevelCompleted = () => {
      completedCount += 1;
    };
  });

  it('starts uncollected and incomplete', () => {
    expect(core.isCollected).toBe(false);
    expect(core.isLevelComplete).toBe(false);
  });

  it('is collected by the live player walking into it', () => {
    core.onPresence([player(CORE_X, CORE_Y + 10)]);
    expect(core.isCollected).toBe(true);
    expect(collectedCount).toBe(1);
  });

  it('is collected by an explicit Interact action', () => {
    expect(core.onInteractAction(player(CORE_X, CORE_Y))).toBe(true);
    expect(core.isCollected).toBe(true);
  });

  it('collects exactly once, no matter how long contact lasts', () => {
    for (let frame = 0; frame < 60; frame++) {
      core.onPresence([player(CORE_X, CORE_Y)]);
    }
    expect(collectedCount).toBe(1);
  });

  it('a second Interact press after collection is not consumed', () => {
    expect(core.onInteractAction(player(CORE_X, CORE_Y))).toBe(true);
    expect(core.onInteractAction(player(CORE_X, CORE_Y))).toBe(false);
    expect(collectedCount).toBe(1);
  });

  it('ignores an empty presence list', () => {
    core.onPresence([]);
    expect(core.isCollected).toBe(false);
    expect(collectedCount).toBe(0);
  });

  it('can never be collected by an Echo', () => {
    core.onPresence([echo(CORE_X, CORE_Y)]);
    expect(core.isCollected).toBe(false);

    expect(core.onInteractAction(echo(CORE_X, CORE_Y))).toBe(false);
    expect(core.isCollected).toBe(false);
    expect(completedCount).toBe(0);
  });

  it('completes the level on collection when the level says so', () => {
    core.onPresence([player(CORE_X, CORE_Y)]);
    expect(core.isLevelComplete).toBe(true);
    expect(completedCount).toBe(1);
  });

  it('fires onLevelCompleted only once', () => {
    core.onPresence([player(CORE_X, CORE_Y)]);
    core.onPresence([player(CORE_X, CORE_Y)]);
    core.resetForLoop();
    core.onPresence([player(CORE_X, CORE_Y)]);
    expect(completedCount).toBe(1);
  });

  it('stays collected across resets once the level is complete', () => {
    core.onPresence([player(CORE_X, CORE_Y)]);
    core.resetForLoop();

    expect(core.isCollected).toBe(true);
    expect(restoredCount).toBe(0);
  });

  it('resetLevel wipes both collection and completion', () => {
    core.onPresence([player(CORE_X, CORE_Y)]);
    core.resetLevel();

    expect(core.isCollected).toBe(false);
    expect(core.isLevelComplete).toBe(false);
    expect(restoredCount).toBe(1);

    // ...and it can be collected again.
    core.onPresence([player(CORE_X, CORE_Y)]);
    expect(core.isCollected).toBe(true);
  });
});

describe('TimeCore — per-loop pickup (levels with an extraction point)', () => {
  it('is restored by a timeline reset when collecting does not complete the level', () => {
    const core = new TimeCore(CORE_X, CORE_Y, false, RADIUS);
    let restored = 0;
    core.onRestored = () => {
      restored += 1;
    };

    core.onPresence([player(CORE_X, CORE_Y)]);
    expect(core.isCollected).toBe(true);
    expect(core.isLevelComplete).toBe(false);

    core.resetForLoop();

    expect(core.isCollected).toBe(false);
    expect(restored).toBe(1);
  });

  it('does not fire onRestored when it was never collected', () => {
    const core = new TimeCore(CORE_X, CORE_Y, false, RADIUS);
    let restored = 0;
    core.onRestored = () => {
      restored += 1;
    };

    core.resetForLoop();
    expect(restored).toBe(0);
  });

  it('survives many collect/reset cycles', () => {
    const core = new TimeCore(CORE_X, CORE_Y, false, RADIUS);
    let collected = 0;
    core.onCollected = () => {
      collected += 1;
    };

    for (let loop = 0; loop < 10; loop++) {
      core.onPresence([player(CORE_X, CORE_Y)]);
      core.onPresence([player(CORE_X, CORE_Y)]); // repeat contact, must not double count
      core.resetForLoop();
    }

    expect(collected).toBe(10);
    expect(core.isCollected).toBe(false);
  });
});

describe('TimeCore through the InteractionSystem', () => {
  it('is only collected once the player is actually in range', () => {
    const core = new TimeCore(CORE_X, CORE_Y, true, RADIUS);
    const system = new InteractionSystem();
    system.register(core);

    system.update([player(CORE_X + 200, CORE_Y)]);
    expect(core.isCollected).toBe(false);

    system.update([player(CORE_X + RADIUS - 2, CORE_Y)]);
    expect(core.isCollected).toBe(true);
  });

  it('an Echo standing on the Core does not complete the level', () => {
    const core = new TimeCore(CORE_X, CORE_Y, true, RADIUS);
    const system = new InteractionSystem();
    system.register(core);

    // 30 frames of an Echo sitting right on top of it.
    for (let frame = 0; frame < 30; frame++) {
      system.update([echo(CORE_X, CORE_Y)]);
    }

    expect(core.isCollected).toBe(false);
    expect(core.isLevelComplete).toBe(false);
  });

  it('the player still collects it while Echoes are nearby', () => {
    const core = new TimeCore(CORE_X, CORE_Y, true, RADIUS);
    const system = new InteractionSystem();
    system.register(core);

    system.update([echo(CORE_X, CORE_Y, 1), player(CORE_X + 5, CORE_Y), echo(CORE_X, CORE_Y, 2)]);

    expect(core.isCollected).toBe(true);
  });

  it('resetForLoop through the system restores a per-loop Core', () => {
    const core = new TimeCore(CORE_X, CORE_Y, false, RADIUS);
    const system = new InteractionSystem();
    system.register(core);

    system.update([player(CORE_X, CORE_Y)]);
    expect(core.isCollected).toBe(true);

    system.resetForLoop();
    expect(core.isCollected).toBe(false);
  });
});
