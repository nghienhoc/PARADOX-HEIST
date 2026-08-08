import { describe, expect, it } from 'vitest';
import type { RunResult } from '@/systems/LevelRun';
import { isBetter, SaveManager, type StorageLike, type StoredResult } from '@/systems/SaveManager';

/** In-memory stand-in for LocalStorage. */
class FakeStorage implements StorageLike {
  readonly data = new Map<string, string>();
  throwOnSet = false;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }
}

function result(overrides: Partial<RunResult> = {}): RunResult {
  return {
    levelId: 'level01',
    levelName: 'FIRST ECHO',
    timelinesUsed: 2,
    elapsedMs: 30_000,
    manualResets: 1,
    echoesCreated: 1,
    grade: 'S',
    ...overrides,
  };
}

const stored = (timelinesUsed: number, elapsedMs: number): StoredResult => ({
  timelinesUsed,
  elapsedMs,
  manualResets: 0,
  echoesCreated: 0,
  grade: 'A',
});

describe('isBetter', () => {
  it('any result beats no result', () => {
    expect(isBetter(stored(9, 99_000), null)).toBe(true);
  });

  it('fewer timelines wins', () => {
    expect(isBetter(stored(2, 90_000), stored(3, 10_000))).toBe(true);
    expect(isBetter(stored(4, 1_000), stored(3, 90_000))).toBe(false);
  });

  it('a tie on timelines is broken by time', () => {
    expect(isBetter(stored(2, 20_000), stored(2, 30_000))).toBe(true);
    expect(isBetter(stored(2, 30_000), stored(2, 20_000))).toBe(false);
  });

  it('an identical run is not an improvement', () => {
    expect(isBetter(stored(2, 20_000), stored(2, 20_000))).toBe(false);
  });
});

describe('SaveManager', () => {
  it('returns null when nothing is stored', () => {
    const save = new SaveManager(new FakeStorage());
    expect(save.loadBest('level01')).toBeNull();
  });

  it('stores the first result as the best', () => {
    const save = new SaveManager(new FakeStorage());
    expect(save.submit('level01', result())).toBe(true);
    expect(save.loadBest('level01')).toEqual({
      timelinesUsed: 2,
      elapsedMs: 30_000,
      manualResets: 1,
      echoesCreated: 1,
      grade: 'S',
    });
  });

  it('keeps the better of two results', () => {
    const save = new SaveManager(new FakeStorage());
    save.submit('level01', result({ timelinesUsed: 4, elapsedMs: 60_000 }));

    expect(save.submit('level01', result({ timelinesUsed: 2, elapsedMs: 30_000 }))).toBe(true);
    expect(save.loadBest('level01')!.timelinesUsed).toBe(2);

    expect(save.submit('level01', result({ timelinesUsed: 7, elapsedMs: 5_000 }))).toBe(false);
    expect(save.loadBest('level01')!.timelinesUsed).toBe(2);
  });

  it('keeps levels independent', () => {
    const save = new SaveManager(new FakeStorage());
    save.submit('level01', result({ timelinesUsed: 2 }));
    save.submit('level02', result({ timelinesUsed: 5 }));

    expect(save.loadBest('level01')!.timelinesUsed).toBe(2);
    expect(save.loadBest('level02')!.timelinesUsed).toBe(5);
    expect(save.loadBest('level03')).toBeNull();
  });

  it('persists across manager instances sharing storage', () => {
    const storage = new FakeStorage();
    new SaveManager(storage).submit('level01', result({ timelinesUsed: 3 }));
    expect(new SaveManager(storage).loadBest('level01')!.timelinesUsed).toBe(3);
  });

  it('survives corrupt stored data', () => {
    const storage = new FakeStorage();
    storage.data.set('paradox-heist.best.v1', '{not json');

    const save = new SaveManager(storage);
    expect(save.loadBest('level01')).toBeNull();
    // ...and can still write a fresh best over the garbage.
    expect(save.submit('level01', result())).toBe(true);
    expect(save.loadBest('level01')).not.toBeNull();
  });

  it('rejects a stored entry with the wrong shape', () => {
    const storage = new FakeStorage();
    storage.data.set('paradox-heist.best.v1', JSON.stringify({ level01: { nonsense: true } }));
    expect(new SaveManager(storage).loadBest('level01')).toBeNull();
  });

  it('does not throw when storage rejects writes', () => {
    const storage = new FakeStorage();
    storage.throwOnSet = true;

    const save = new SaveManager(storage);
    // Reports "new best" because it was, then silently fails to persist it.
    expect(() => save.submit('level01', result())).not.toThrow();
    expect(save.loadBest('level01')).toBeNull();
  });

  it('degrades gracefully with no storage at all', () => {
    const save = new SaveManager(null);
    expect(save.isAvailable).toBe(false);
    expect(save.loadBest('level01')).toBeNull();
    expect(() => save.submit('level01', result())).not.toThrow();
  });
});
