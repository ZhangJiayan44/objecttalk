import { RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';
import { readGraphicsMode, writeGraphicsMode, type GraphicsMode } from '@/lib/graphics';
import { MOUSE_SENSITIVITY_DEFAULT, MOUSE_SENSITIVITY_MAX, MOUSE_SENSITIVITY_MIN, readMouseSensitivity, writeMouseSensitivity } from '@/lib/settings';

const GRAPHICS_HELP: Record<GraphicsMode, string> = {
  auto: 'Adjusts automatically to keep play smooth.',
  high: 'Full visual detail.',
  low: 'A balance of detail and smoother play.',
  off: 'Favors smoother play on slower devices.',
};

/** Shared by the in-game drawer and the settings page; changes apply as you adjust. */
export function SettingsControls({ autoFocus = false }: { autoFocus?: boolean }) {
  const id = useId();
  const [sensitivity, setSensitivity] = useState(readMouseSensitivity);
  const [graphics, setGraphics] = useState(readGraphicsMode);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-cream p-4" aria-labelledby={`${id}-look`}>
        <div className="flex items-center justify-between gap-3">
          <label id={`${id}-look`} htmlFor={`${id}-sensitivity`} className="text-sm font-bold">Mouse sensitivity</label>
          <output htmlFor={`${id}-sensitivity`} className="rounded-lg bg-sun/60 px-2 py-1 font-display text-base font-semibold tabular-nums">{sensitivity.toFixed(1)}×</output>
        </div>
        <input
          id={`${id}-sensitivity`} type="range"
          min={MOUSE_SENSITIVITY_MIN} max={MOUSE_SENSITIVITY_MAX} step="0.1" value={sensitivity}
          onChange={(e) => setSensitivity(writeMouseSensitivity(Number(e.target.value)))}
          autoFocus={autoFocus}
          className="mt-2 h-11 w-full cursor-pointer accent-cta focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
          aria-describedby={`${id}-look-help`} aria-valuetext={`${sensitivity.toFixed(1)} times`}
        />
        <div className="flex justify-between text-xs font-semibold text-muted"><span>Slower</span><span>Faster</span></div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p id={`${id}-look-help`} className="text-xs leading-relaxed text-muted">Mouse and touch look speed.</p>
          <button type="button" aria-label="Reset mouse sensitivity" title="Reset to 1.0×" disabled={sensitivity === MOUSE_SENSITIVITY_DEFAULT} onClick={() => setSensitivity(writeMouseSensitivity(MOUSE_SENSITIVITY_DEFAULT))} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta disabled:cursor-default disabled:opacity-40">
            <RotateCcw size={17} aria-hidden="true" />
          </button>
        </div>
      </section>
      <section className="rounded-2xl bg-cream p-4">
        <label htmlFor={`${id}-graphics`} className="text-sm font-bold">Graphics quality</label>
        <select id={`${id}-graphics`} className="mt-3 min-h-11 w-full cursor-pointer rounded-xl border-2 border-line bg-white px-3 text-base font-semibold focus-visible:border-cta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta" value={graphics} onChange={(e) => setGraphics(writeGraphicsMode(e.target.value as GraphicsMode))} aria-describedby={`${id}-graphics-help`}>
          <option value="auto">Auto</option>
          <option value="high">High</option>
          <option value="low">Balanced</option>
          <option value="off">Performance</option>
        </select>
        <p id={`${id}-graphics-help`} className="mt-3 min-h-9 text-xs leading-relaxed text-muted">{GRAPHICS_HELP[graphics]}</p>
      </section>
      <p className="px-1 text-xs leading-relaxed text-muted">Applied instantly. Saved in this browser.</p>
    </div>
  );
}
