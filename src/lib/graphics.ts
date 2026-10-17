export type RenderQuality = 'high' | 'low' | 'off';
export type GraphicsMode = 'auto' | RenderQuality;

const KEY = 'objecttalk:fx';
export const GRAPHICS_EVENT = 'objecttalk:graphics';
export const RENDER_PROFILES = {
  high: { dpr: 1.5, shadowSize: 2048, shadows: true },
  low: { dpr: 1, shadowSize: 1024, shadows: true },
  off: { dpr: 0.75, shadowSize: 512, shadows: false },
} as const;

const isMode = (value: unknown): value is GraphicsMode => value === 'auto' || value === 'high' || value === 'low' || value === 'off';

export function readGraphicsMode(): GraphicsMode {
  if (typeof window === 'undefined') return 'auto';
  const query = new URLSearchParams(window.location.search).get('fx');
  try {
    if (isMode(query)) {
      localStorage.setItem(KEY, query);
      return query;
    }
    const saved = localStorage.getItem(KEY);
    return isMode(saved) ? saved : 'auto';
  } catch {
    return isMode(query) ? query : 'auto';
  }
}

export function writeGraphicsMode(mode: GraphicsMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  // A URL override must follow the user's new choice instead of restoring the old mode.
  const query = new URLSearchParams(window.location.search);
  if (query.has('fx')) {
    query.set('fx', mode);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${query}${window.location.hash}`);
  }
  window.dispatchEvent(new Event(GRAPHICS_EVENT));
  return mode;
}

export function initialRenderQuality(mode: GraphicsMode, coarse = false, cores = 8): RenderQuality {
  return mode === 'auto' ? (coarse || cores <= 4 ? 'low' : 'high') : mode;
}

/** Require two slow windows; isolated loading/GC pauses must not lower quality. */
export function nextRenderQuality(quality: RenderQuality, fps: number, slowWindows: number): { quality: RenderQuality; slowWindows: number } {
  const slow = fps < 40 ? slowWindows + 1 : 0;
  if (slow < 2 || quality === 'off') return { quality, slowWindows: slow };
  return { quality: quality === 'high' ? 'low' : 'off', slowWindows: 0 };
}
