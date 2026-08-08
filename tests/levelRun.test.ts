import { describe, expect, it } from 'vitest';
import {
  currentPhase,
  gradeFor,
  LevelRun,
  objectiveLabel,
  ObjectivePhase,
  type ScoringConfig,
  type WorldSnapshot,
} from '@/systems/LevelRun';

const world = (overrides: Partial<WorldSnapshot> = {}): WorldSnapshot => ({
  loopNumber: 1,
  switchHeld: false,
  doorOpen: false,
  coreCollected: false,
  complete: false,
  ...overrides,
});

const SCORING: ScoringConfig = { parTimelines: 2, parTimeMs: 50_000 };

describe('objective phases', () => {
  it('starts by telling the player to find a route', () => {
    expect(currentPhase(world())).toBe(ObjectivePhase.FindRoute);
  });

  it('nudges toward the switch once the player touches it', () => {
    expect(currentPhase(world({ switchHeld: true }))).toBe(ObjectivePhase.HoldSwitch);
  });

  it('nudges toward the switch from the second timeline onward', () => {
    expect(currentPhase(world({ loopNumber: 2 }))).toBe(ObjectivePhase.HoldSwitch);
  });

  it('points at the Core once the door is open', () => {
    expect(currentPhase(world({ loopNumber: 2, switchHeld: true, doorOpen: true }))).toBe(
      ObjectivePhase.StealCore,
    );
  });

  it('points at extraction once the Core is taken', () => {
    // Note the door has closed again here — the objective must not regress.
    expect(currentPhase(world({ loopNumber: 3, doorOpen: false, coreCollected: true }))).toBe(
      ObjectivePhase.Extract,
    );
  });

  it('reports completion above everything else', () => {
    expect(currentPhase(world({ complete: true, coreCollected: true, doorOpen: true }))).toBe(
      ObjectivePhase.Complete,
    );
  });

  it('has a short label for every phase', () => {
    expect(objectiveLabel(world())).toBe('FIND A WAY THROUGH THE VAULT');
    expect(objectiveLabel(world({ switchHeld: true }))).toBe('HOLD THE PRESSURE SWITCH');
    expect(objectiveLabel(world({ doorOpen: true }))).toBe('STEAL THE TIME CORE');
    expect(objectiveLabel(world({ coreCollected: true }))).toBe('REACH EXTRACTION');
    expect(objectiveLabel(world({ complete: true }))).toBe('PARADOX COMPLETE');
  });
});

describe('gradeFor', () => {
  it('awards S for par timelines within par time', () => {
    expect(gradeFor(2, 40_000, SCORING)).toBe('S');
    expect(gradeFor(1, 10_000, SCORING)).toBe('S');
  });

  it('awards A for par timelines but a slow run', () => {
    expect(gradeFor(2, 50_001, SCORING)).toBe('A');
  });

  it('treats exactly par time as still S', () => {
    expect(gradeFor(2, 50_000, SCORING)).toBe('S');
  });

  it('awards B up to two timelines over par', () => {
    expect(gradeFor(3, 10_000, SCORING)).toBe('B');
    expect(gradeFor(4, 10_000, SCORING)).toBe('B');
  });

  it('awards C beyond that', () => {
    expect(gradeFor(5, 10_000, SCORING)).toBe('C');
    expect(gradeFor(20, 1_000, SCORING)).toBe('C');
  });

  it('does not penalise manual resets — resetting is the core verb', () => {
    // Grade depends only on timelines and time; manual resets are not an input at all.
    expect(gradeFor(2, 40_000, SCORING)).toBe('S');
  });
});

describe('LevelRun', () => {
  const makeRun = (): LevelRun => new LevelRun('level01', 'FIRST ECHO', SCORING);

  it('accumulates play time', () => {
    const run = makeRun();
    run.tick(1_000);
    run.tick(500);
    expect(run.elapsedMs).toBe(1_500);
  });

  it('counts manual resets', () => {
    const run = makeRun();
    run.recordManualReset();
    run.recordManualReset();
    expect(run.manualResets).toBe(2);
  });

  it('builds a result on completion', () => {
    const run = makeRun();
    run.tick(30_000);
    run.recordManualReset();

    const result = run.complete(2, 1);

    expect(result).not.toBeNull();
    expect(result!.levelId).toBe('level01');
    expect(result!.levelName).toBe('FIRST ECHO');
    expect(result!.timelinesUsed).toBe(2);
    expect(result!.elapsedMs).toBe(30_000);
    expect(result!.manualResets).toBe(1);
    expect(result!.echoesCreated).toBe(1);
    expect(result!.grade).toBe('S');
  });

  it('completes exactly once', () => {
    const run = makeRun();
    expect(run.complete(2, 1)).not.toBeNull();
    expect(run.complete(2, 1)).toBeNull();
    expect(run.complete(99, 99)).toBeNull();
    expect(run.isComplete).toBe(true);
  });

  it('freezes its stats once complete', () => {
    const run = makeRun();
    run.tick(10_000);
    run.complete(2, 1);

    run.tick(60_000);
    run.recordManualReset();

    expect(run.elapsedMs).toBe(10_000);
    expect(run.manualResets).toBe(0);
    expect(run.finalResult!.elapsedMs).toBe(10_000);
  });

  it('reset() allows a fresh attempt', () => {
    const run = makeRun();
    run.tick(10_000);
    run.recordManualReset();
    run.complete(5, 4);

    run.reset();

    expect(run.isComplete).toBe(false);
    expect(run.finalResult).toBeNull();
    expect(run.elapsedMs).toBe(0);
    expect(run.manualResets).toBe(0);

    run.tick(20_000);
    expect(run.complete(2, 1)!.grade).toBe('S');
  });
});
