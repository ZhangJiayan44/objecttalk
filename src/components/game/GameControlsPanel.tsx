import { ArrowLeft, ChevronRight, Settings2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SettingsControls } from '@/components/ui/SettingsControls';

/** Secondary tools and settings share one drawer, keeping the game HUD quiet. */
export function GameControlsPanel({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const [settings, setSettings] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const wasSettings = useRef(false);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    settingsButton.current?.focus({ preventScroll: true });
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (wasSettings.current && !settings) settingsButton.current?.focus({ preventScroll: true });
    wasSettings.current = settings;
  }, [settings]);
  return (
    <aside id="game-controls" aria-labelledby="game-controls-title" className="clay-card absolute top-16 right-2 bottom-24 z-40 flex w-[min(21rem,calc(100%-1rem))] flex-col overflow-hidden bg-white/95 p-4 backdrop-blur sm:right-3" onKeyDown={(e) => {
      // Keep form keys and Tab away from gameplay shortcuts; Escape closes only this drawer.
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    }}>
      <div className="mb-4 flex shrink-0 items-center gap-2">
        {settings && <button type="button" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta" aria-label="Back to controls" onClick={() => setSettings(false)}><ArrowLeft size={19} aria-hidden="true" /></button>}
        <h2 id="game-controls-title" className="flex-1 font-display text-xl font-semibold">{settings ? 'Settings' : 'Controls'}</h2>
        <button type="button" className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta" aria-label={settings ? 'Close settings' : 'Close controls'} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {settings ? <SettingsControls autoFocus /> : <>
          <button ref={settingsButton} type="button" className="mb-4 flex min-h-16 w-full shrink-0 cursor-pointer items-center gap-3 rounded-2xl bg-cream px-3 py-2 text-left transition-colors hover:bg-sky/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta" aria-label="Settings" onClick={() => setSettings(true)}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white"><Settings2 size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold">Settings</span><span className="block text-xs text-muted">Sensitivity &amp; graphics</span></span>
            <ChevronRight size={17} className="shrink-0 text-muted" aria-hidden="true" />
          </button>
          {children}
        </>}
      </div>
    </aside>
  );
}
