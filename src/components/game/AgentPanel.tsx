import { BrainCircuit, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Kbd } from '@/components/ui';
import { useGame } from '@/lib/game-client';

/**
 * "How the AI partner thinks": every turn of the AI partner as a trace,
 * which brain answered (the LLM tool-use agent, e.g. DeepSeek, or the offline rule brain),
 * the grounded tools it called, what they returned, and what it said.
 */
export function AgentPanel({ onClose }: { onClose(): void }) {
  const traces = useGame((s) => s.traces);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [traces.length]);
  return (
    <div className="clay-card flex max-h-[70vh] w-[min(26rem,calc(100vw-1rem))] animate-pop flex-col overflow-hidden bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between border-b-2 border-line px-3 py-2">
        <span className="flex items-center gap-2 font-display font-semibold">
          <BrainCircuit size={18} strokeWidth={2.5} /> AI partner brain
        </span>
        <button className="rounded-lg px-1 text-xs font-bold text-muted hover:text-ink" onClick={onClose} aria-label="Close agent panel">
          <Kbd>G</Kbd> <X size={12} className="inline" strokeWidth={3} />
        </button>
      </div>
      <div ref={listRef} className="space-y-2 overflow-y-auto p-3 text-xs">
        {traces.length === 0 && <p className="text-center text-sm text-muted">The AI partner’s reasoning appears here: what it heard, which tools it used, what it decided.</p>}
        {traces.map((t) => (
          <div key={t.id} className="rounded-xl border-2 border-ink bg-cream p-2">
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded-full border-2 border-ink px-2 py-0.5 font-bold ${t.brain === 'llm' ? 'bg-lavender' : 'bg-mint'}`}>{t.brain === 'llm' ? `🧠 ${t.model ?? 'LLM'} agent` : '⚙️ rule brain'}</span>
              <span className="font-bold text-muted">
                {t.role} · {(t.t / 1000).toFixed(1)}s · {t.ms} ms
              </span>
            </div>
            <div className="mt-1 font-semibold">
              heard: <span className="text-muted">“{t.input}”</span>
            </div>
            {t.steps.length > 0 && (
              <ol className="mt-1 space-y-0.5 border-l-2 border-ink/30 pl-2">
                {t.steps.map((s, i) => (
                  <li key={i} className="break-words">
                    <span className="font-bold text-grape">{s.tool}</span>
                    {s.args && s.args !== '{}' && <span className="text-muted"> {s.args}</span>}
                    <span className={s.result.startsWith('NOT SAID') ? 'font-bold text-coral' : ''}> → {s.result}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-1 font-semibold text-cta-deep">said: {t.output}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
