import { describe, expect, it, vi } from 'vitest';
import { isModuleLoadError, recoverModuleLoad } from '../src/lib/module-recovery';

describe('deployment module recovery', () => {
  it('refreshes once, preserves saved progress, and stops retrying if the module stays unavailable', () => {
    const data = new Map([['objecttalk:sessions', '[{"replayId":"saved-game"}]']]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const reload = vi.fn();
    expect(recoverModuleLoad(storage, reload, 100_000)).toBe(true);
    expect(recoverModuleLoad(storage, reload, 101_000)).toBe(false);
    expect(recoverModuleLoad(storage, reload, 159_999)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(data.get('objecttalk:sessions')).toBe('[{"replayId":"saved-game"}]');
    expect(recoverModuleLoad(storage, reload, 160_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('offers manual recovery instead of an unbounded refresh when storage is blocked', () => {
    const reload = vi.fn();
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: vi.fn() };
    expect(recoverModuleLoad(blocked, reload, 100_000)).toBe(false);
    const full = { getItem: () => null, setItem: () => { throw new Error('full'); } };
    expect(recoverModuleLoad(full, reload, 100_000)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('recognizes browser module load errors without mistaking application errors for a stale deployment', () => {
    for (const message of ['Failed to fetch dynamically imported module: /assets/Replay-old.js', 'Importing a module script failed.', 'error loading dynamically imported module: /assets/Replay-old.js', 'Unable to preload CSS for /assets/Replay-old.css', 'Loading chunk 10 failed.']) {
      expect(isModuleLoadError(new TypeError(message))).toBe(true);
    }
    expect(isModuleLoadError(new Error('Cannot read properties of null'))).toBe(false);
    expect(isModuleLoadError(new Error('Failed to fetch'))).toBe(false);
    expect(isModuleLoadError(null)).toBe(false);
  });
});
