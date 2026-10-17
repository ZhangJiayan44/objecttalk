import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialRenderQuality, nextRenderQuality, readGraphicsMode, writeGraphicsMode, RENDER_PROFILES } from '../src/lib/graphics';

afterEach(() => vi.unstubAllGlobals());

describe('graphics budget', () => {
  it('allows settings to change a mode selected through the URL without reloading the page', () => {
    let url = new URL('https://example.com/settings?fx=high&from=game#graphics');
    const saved = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      get location() { return url; }, dispatchEvent,
      history: { state: null, replaceState: (_: unknown, __: string, next: string) => { url = new URL(next, url); } },
    });
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => saved.set(key, value), getItem: (key: string) => saved.get(key) });
    expect(readGraphicsMode()).toBe('high');
    expect(writeGraphicsMode('off')).toBe('off');
    expect(readGraphicsMode()).toBe('off');
    expect(url.searchParams.get('from')).toBe('game');
    expect(url.hash).toBe('#graphics');
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });

  it('starts conservatively on touch/low-core devices and respects manual settings', () => {
    expect(initialRenderQuality('auto')).toBe('high');
    expect(initialRenderQuality('auto', true)).toBe('low');
    expect(initialRenderQuality('auto', false, 4)).toBe('low');
    expect(initialRenderQuality('high', true, 2)).toBe('high');
    expect(initialRenderQuality('off')).toBe('off');
  });

  it('requires sustained low FPS and steps down without bouncing back', () => {
    const first = nextRenderQuality('high', 15, 0);
    expect(first).toEqual({ quality: 'high', slowWindows: 1 });
    const second = nextRenderQuality(first.quality, 18, first.slowWindows);
    expect(second).toEqual({ quality: 'low', slowWindows: 0 });
    expect(nextRenderQuality('low', 60, 1)).toEqual({ quality: 'low', slowWindows: 0 });
    expect(nextRenderQuality('low', 24, 1).quality).toBe('off');
    expect(nextRenderQuality('off', 10, 5).quality).toBe('off');
  });

  it('a recovered window clears a transient slow sample', () => {
    expect(nextRenderQuality('high', 60, 1)).toEqual({ quality: 'high', slowWindows: 0 });
    expect(nextRenderQuality('high', 39, 0).quality).toBe('high');
  });

  it('keeps explicit query overrides even when browser storage is blocked', () => {
    vi.stubGlobal('window', { location: { search: '?fx=off' } });
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked'); } });
    expect(readGraphicsMode()).toBe('off');
  });

  it('reads old saved effect preferences and accepts auto', () => {
    vi.stubGlobal('window', { location: { search: '' } });
    vi.stubGlobal('localStorage', { getItem: () => 'low' });
    expect(readGraphicsMode()).toBe('low');
    vi.stubGlobal('localStorage', { getItem: () => 'auto' });
    expect(readGraphicsMode()).toBe('auto');
  });

  it('reduces pixel/shadow budgets progressively', () => {
    expect(RENDER_PROFILES.low.dpr ** 2 / RENDER_PROFILES.high.dpr ** 2).toBeCloseTo(0.4444);
    expect(RENDER_PROFILES.off.shadows).toBe(false);
    expect(RENDER_PROFILES.low.shadowSize).toBeLessThan(RENDER_PROFILES.high.shadowSize);
  });
});
