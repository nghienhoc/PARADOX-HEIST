import type { Grade, RunResult } from '@/systems/LevelRun';

/**
 * Best-result persistence in LocalStorage.
 *
 * Deliberately minimal — this is not the campaign progression system, just enough to make
 * a result screen worth beating. Storage is injected so it can be unit tested in plain
 * Node, and every access is wrapped: LocalStorage throws in private-browsing modes and can
 * hold corrupt data from an older build, and neither should ever break the game.
 */

const STORAGE_KEY = 'paradox-heist.best.v1';

export interface StoredResult {
  timelinesUsed: number;
  elapsedMs: number;
  manualResets: number;
  echoesCreated: number;
  grade: Grade;
}

/** The slice of the DOM Storage API we use. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Is `candidate` a better run than `incumbent`?
 *
 * Fewer timelines wins; a tie is broken by faster time. Matches the grading priority in
 * `LevelRun.gradeFor`, so the stored best is always the run that would grade highest.
 */
export function isBetter(candidate: StoredResult, incumbent: StoredResult | null): boolean {
  if (incumbent === null) return true;
  if (candidate.timelinesUsed !== incumbent.timelinesUsed) {
    return candidate.timelinesUsed < incumbent.timelinesUsed;
  }
  return candidate.elapsedMs < incumbent.elapsedMs;
}

function toStored(result: RunResult): StoredResult {
  return {
    timelinesUsed: result.timelinesUsed,
    elapsedMs: result.elapsedMs,
    manualResets: result.manualResets,
    echoesCreated: result.echoesCreated,
    grade: result.grade,
  };
}

/** Reject anything that is not a well-formed record, rather than trusting the blob. */
function isValidStored(value: unknown): value is StoredResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.timelinesUsed === 'number' &&
    typeof r.elapsedMs === 'number' &&
    typeof r.manualResets === 'number' &&
    typeof r.echoesCreated === 'number' &&
    typeof r.grade === 'string'
  );
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage can itself throw under strict privacy settings.
    return null;
  }
}

export class SaveManager {
  private readonly storage: StorageLike | null;

  constructor(storage: StorageLike | null = defaultStorage()) {
    this.storage = storage;
  }

  /** True when persistence is actually available. */
  get isAvailable(): boolean {
    return this.storage !== null;
  }

  /** Best recorded result for a level, or `null` if there is none (or it was unreadable). */
  loadBest(levelId: string): StoredResult | null {
    const all = this.readAll();
    const entry = all[levelId];
    return entry !== undefined && isValidStored(entry) ? entry : null;
  }

  /**
   * Record a result if it beats the stored best.
   * @returns true if this became the new best (including the very first result).
   */
  submit(levelId: string, result: RunResult): boolean {
    const candidate = toStored(result);
    if (!isBetter(candidate, this.loadBest(levelId))) return false;

    const all = this.readAll();
    all[levelId] = candidate;
    this.writeAll(all);
    return true;
  }

  private readAll(): Record<string, StoredResult> {
    if (!this.storage) return {};
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return {};
      return parsed as Record<string, StoredResult>;
    } catch {
      // Corrupt or unreadable save: start clean rather than crash.
      return {};
    }
  }

  private writeAll(all: Record<string, StoredResult>): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Quota exceeded or storage disabled — losing a best score is not worth a crash.
    }
  }
}
