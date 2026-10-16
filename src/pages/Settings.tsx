import { RotateCcw, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { btn, Footer, Navbar } from '@/components/ui';
import { clampMouseSensitivity, MOUSE_SENSITIVITY_DEFAULT, MOUSE_SENSITIVITY_MAX, MOUSE_SENSITIVITY_MIN, readMouseSensitivity, writeMouseSensitivity } from '@/lib/settings';

export default function Settings() {
  const [sensitivity, setSensitivity] = useState(readMouseSensitivity);
  const change = (value: number) => setSensitivity(writeMouseSensitivity(value));
  return (
    <div className="min-h-dvh bg-cream">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-16">
        <div className="mb-8">
          <span className="clay-chip bg-lavender"><Settings2 size={16} strokeWidth={3} /> Settings</span>
          <h1 className="mt-3 text-4xl font-bold">Game settings</h1>
          <p className="text-muted">These controls are saved in this browser and apply to first-person scenes.</p>
        </div>
        <section className="clay-card bg-white/90 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Mouse sensitivity</h2>
              <p className="mt-1 max-w-xl text-sm font-semibold text-muted">Adjust how quickly the camera turns when you move the mouse or drag on a touch screen.</p>
            </div>
            <output className="clay-chip bg-sun font-display text-xl" aria-live="polite">{sensitivity.toFixed(1)}×</output>
          </div>
          <input
            className="mt-6 h-3 w-full cursor-pointer accent-cta"
            type="range"
            min={MOUSE_SENSITIVITY_MIN}
            max={MOUSE_SENSITIVITY_MAX}
            step="0.1"
            value={sensitivity}
            onChange={(e) => change(clampMouseSensitivity(Number(e.target.value)))}
            aria-label="Mouse sensitivity"
          />
          <div className="mt-2 flex justify-between text-xs font-bold text-muted"><span>{MOUSE_SENSITIVITY_MIN.toFixed(1)}×</span><span>Default {MOUSE_SENSITIVITY_DEFAULT.toFixed(1)}×</span><span>{MOUSE_SENSITIVITY_MAX.toFixed(1)}×</span></div>
          <button className={btn('white', 'sm', 'mt-6')} onClick={() => change(MOUSE_SENSITIVITY_DEFAULT)} disabled={sensitivity === MOUSE_SENSITIVITY_DEFAULT}>
            <RotateCcw size={16} strokeWidth={3} /> Restore default
          </button>
        </section>
      </main>
      <Footer />
    </div>
  );
}
