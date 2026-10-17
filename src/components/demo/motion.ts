import { progress } from './timeline';
import type { MotionKey, Pose2D } from './Kinetic';

export const TRANSITION_SECONDS = 0.52;
const smooth = (p: number) => p * p * (3 - 2 * p);
const cache = new WeakMap<HTMLElement, { source: string; keys: MotionKey[]; layer: HTMLElement | null }>();
const mix = (a: number | undefined, b: number | undefined, fallback: number, p: number) => (a ?? fallback) + ((b ?? fallback) - (a ?? fallback)) * p;
function sample(keys: MotionKey[], time: number, reduced: boolean): Required<Pose2D> {
  let from = keys[0], to = from;
  for (const k of keys) { if (k.t <= time) from = k; else { to = k; break; } to = from; }
  let p = from === to ? 1 : progress(time, from.t, to.t - from.t);
  if (reduced) p = p < 0.5 ? 0 : 1;
  else if (to.ease === 'out') p = 1 - (1 - p) ** 3;
  else if (to.ease === 'back') p = 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
  else if (to.ease !== 'linear') p = smooth(p);
  return { x: mix(from.x, to.x, 0, p), y: mix(from.y, to.y, 0, p), s: mix(from.s, to.s, 1, p),
    r: mix(from.r, to.r, 0, p), o: mix(from.o, to.o, 1, p), sx: mix(from.sx, to.sx, 1, p), sy: mix(from.sy, to.sy, 1, p) };
}

/** Composite flat layers at the display refresh rate, independently of the
 * native 3D scenes' render budget. Seeking/export uses this same clock. */
export function paintFilmMotion(stage: HTMLElement | null, time: number, reduced: boolean) {
  if (!stage) return;
  stage.querySelectorAll<HTMLElement>('[data-film-layer]').forEach((layer) => {
    const phase = layer.dataset.filmLayer;
    layer.style.visibility = phase === 'parked' ? 'hidden' : 'visible';
    if (phase === 'parked') return;
    const boundary = Number(layer.dataset.boundary);
    const p = reduced ? 1 : smooth(progress(time, boundary, TRANSITION_SECONDS));
    const mode = layer.dataset.transition;
    layer.style.clipPath = '';
    layer.style.opacity = phase === 'preload' ? '0.001' : '1';
    if (phase === 'preload') layer.style.transform = 'translate3d(0,0,0)';
    else if (mode === 'cut') layer.style.transform = 'none';
    else if (mode === 'iris' || mode === 'brand') {
      layer.style.transform = `scale(${phase === 'previous' ? 1 + p * 0.07 : 1.08 - p * 0.08})`;
      if (phase === 'active') layer.style.clipPath = `circle(${p * 125}% at ${mode === 'iris' ? '41% 49%' : '50% 48%'})`;
    } else if (mode === 'lift') {
      layer.style.transform = `translate3d(0,${phase === 'previous' ? -p * 9 : (1 - p) * 100}%,0)`;
    } else {
      const x = phase === 'previous' ? -p * 12 : (1 - p) * 12;
      layer.style.transform = boundary > 0 ? `translate3d(${x}%,0,0) scale(${phase === 'previous' ? 1 - p * 0.04 : 0.96 + p * 0.04})` : 'none';
      if (phase === 'active' && boundary > 0) layer.style.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
    }
  });
  stage.querySelectorAll<HTMLElement>('[data-motion]').forEach((el) => {
    const source = el.dataset.motion!;
    let stored = cache.get(el);
    if (stored?.source !== source) { stored = { source, keys: JSON.parse(source), layer: el.closest<HTMLElement>('[data-film-layer]') }; cache.set(el, stored); }
    const layer = stored.layer;
    if (layer?.dataset.filmLayer === 'parked') return;
    const offset = Number(layer?.dataset.clockOffset ?? 0);
    const t = layer?.dataset.filmLayer === 'preload' ? Number(layer.dataset.boundary) - offset + 3 : time - offset;
    const v = sample(stored.keys, t, reduced);
    el.style.transform = `translate3d(${v.x}px,${v.y}px,0) rotate(${reduced ? 0 : v.r}deg) scale(${v.s * v.sx},${v.s * v.sy})`;
    el.style.opacity = String(Math.max(0, Math.min(1, v.o)));
  });
  let openingVoiceIndex = 0, bodyVoiceIndex = 0;
  stage.querySelectorAll<HTMLElement>('[data-voice-bar]').forEach((bar) => {
    const layer = bar.closest<HTMLElement>('[data-film-layer]');
    const i = layer?.dataset.scene === 'how-it-works' ? openingVoiceIndex++ : bodyVoiceIndex++;
    const localTime = time - Number(layer?.dataset.clockOffset ?? 0);
    bar.style.transform = `scaleY(${reduced ? 0.6 : 0.25 + Math.abs(Math.sin(localTime * 9 + i * 1.2)) * 0.75})`;
  });
  stage.querySelectorAll<HTMLElement>('[data-transition-slat]').forEach((slat) => {
    const offset = Number(slat.closest<HTMLElement>('[data-film-layer]')?.dataset.clockOffset ?? 0);
    const start = Number(slat.dataset.start) + offset, delay = Number(slat.dataset.transitionSlat) * 0.045;
    const p = progress(time, start + delay, 0.48);
    slat.style.transform = `translate3d(${(smooth(p) * 220 - 110)}%,0,0) skewX(-12deg)`;
    slat.style.visibility = !reduced && p > 0 && p < 1 ? 'visible' : 'hidden';
  });
}
