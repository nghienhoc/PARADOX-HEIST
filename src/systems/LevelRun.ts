/**
 * The state of one playthrough of a level: objective progression, run statistics and
 * the final grade.
 *
 * Phaser-free, so the whole scoring and objective-phase model is unit testable.
 */

/** Where the player is in the level's objective chain. */
export enum ObjectivePhase {
  FindRoute = 0,
  HoldSwitch = 1,
  StealCore = 2,
  Extract = 3,
  Complete = 4,
}

/** Short contextual HUD text per phase. Deliberately terse — no tutorial walls. */
export const OBJECTIVE_LABELS: Readonly<Record<ObjectivePhase, string>> = {
  [ObjectivePhase.FindRoute]: 'FIND A WAY THROUGH THE VAULT',
  [ObjectivePhase.HoldSwitch]: 'HOLD THE PRESSURE SWITCH',
  [ObjectivePhase.StealCore]: 'STEAL THE TIME CORE',
  [ObjectivePhase.Extract]: 'REACH EXTRACTION',
  [ObjectivePhase.Complete]: 'PARADOX COMPLETE',
};

/** Everything the phase derivation needs. Pure input, no behaviour. */
export interface WorldSnapshot {
  loopNumber: number;
  switchHeld: boolean;
  doorOpen: boolean;
  coreCollected: boolean;
  complete: boolean;
}

/**
 * Derive the current objective from world state.
 *
 * Ordered most-advanced-first, so the HUD always shows the furthest thing the player has
 * reached rather than flickering back when a door closes behind them.
 *
 * The `HoldSwitch` hint appears once the player has either touched the switch or lived
 * through a first timeline — enough of a nudge to make the mechanic click without a
 * tutorial box.
 */
export function currentPhase(snapshot: WorldSnapshot): ObjectivePhase {
  if (snapshot.complete) return ObjectivePhase.Complete;
  if (snapshot.coreCollected) return ObjectivePhase.Extract;
  if (snapshot.doorOpen) return ObjectivePhase.StealCore;
  if (snapshot.switchHeld || snapshot.loopNumber >= 2) return ObjectivePhase.HoldSwitch;
  return ObjectivePhase.FindRoute;
}

export function objectiveLabel(snapshot: WorldSnapshot): string {
  return OBJECTIVE_LABELS[currentPhase(snapshot)];
}

export type Grade = 'C' | 'B' | 'A' | 'S';

/**
 * Per-level grading targets. Kept in level data so a tight level and a sprawling one can
 * be graded on their own terms.
 */
export interface ScoringConfig {
  /** Timelines the intended solution needs. Level 01: 2. */
  parTimelines: number;
  /** Total play time the intended solution needs, in milliseconds. */
  parTimeMs: number;
}

export interface RunResult {
  levelId: string;
  levelName: string;
  /** Timelines the player used, including the one they finished on. */
  timelinesUsed: number;
  /** Total elapsed play time across every timeline, excluding pauses. */
  elapsedMs: number;
  manualResets: number;
  /** Timelines archived as Echoes over the whole run, not the live Echo count. */
  echoesCreated: number;
  grade: Grade;
}

/**
 * Grade a finished run.
 *
 * Timelines used is the primary axis, because that is what the game is actually about.
 * Time only separates S from A, so a careful player is never punished for thinking.
 * Manual resets are deliberately **not** penalised — resetting is the core verb.
 */
export function gradeFor(
  timelinesUsed: number,
  elapsedMs: number,
  scoring: ScoringConfig,
): Grade {
  if (timelinesUsed <= scoring.parTimelines) {
    return elapsedMs <= scoring.parTimeMs ? 'S' : 'A';
  }
  if (timelinesUsed <= scoring.parTimelines + 2) return 'B';
  return 'C';
}

/** Tracks a single attempt at a level. */
export class LevelRun {
  private elapsed = 0;
  private manual = 0;
  private result: RunResult | null = null;

  constructor(
    private readonly levelId: string,
    private readonly levelName: string,
    private readonly scoring: ScoringConfig,
  ) {}

  /** Accumulate play time. Not called while paused, transitioning or complete. */
  tick(deltaMs: number): void {
    if (this.result !== null) return;
    this.elapsed += deltaMs;
  }

  recordManualReset(): void {
    if (this.result !== null) return;
    this.manual += 1;
  }

  get elapsedMs(): number {
    return this.elapsed;
  }

  get manualResets(): number {
    return this.manual;
  }

  get isComplete(): boolean {
    return this.result !== null;
  }

  /** The finished result, or `null` while the run is still in progress. */
  get finalResult(): RunResult | null {
    return this.result;
  }

  /**
   * Finish the run.
   *
   * @returns The result, or `null` if the run was already complete — so completion can
   *   never fire twice no matter how many times the extraction zone is entered.
   */
  complete(timelinesUsed: number, echoesCreated: number): RunResult | null {
    if (this.result !== null) return null;

    this.result = {
      levelId: this.levelId,
      levelName: this.levelName,
      timelinesUsed,
      elapsedMs: this.elapsed,
      manualResets: this.manual,
      echoesCreated,
      grade: gradeFor(timelinesUsed, this.elapsed, this.scoring),
    };
    return this.result;
  }

  /** Start a fresh attempt at the same level. */
  reset(): void {
    this.elapsed = 0;
    this.manual = 0;
    this.result = null;
  }
}
