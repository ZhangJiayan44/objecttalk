import { LifeBuoy, Mic, Send, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FREE_LIFELINES, hasChinese, LIFELINE_COST, MAX_LIFELINES } from '@shared/lifeline';
import { Kbd, Tip } from '@/components/ui';
import { useGame, useGameClient } from '@/lib/game-client';
import { speak, useSpeechInput } from '@/lib/speech';

/**
 * 中文求助 (Chinese lifeline). Stuck for a word? Say or type it in Chinese:
 * the English comes back privately, you hear it, and then you say it to your
 * partner yourself with the open microphone. Your partner never sees the
 * Chinese; the first lifeline each round is free, later ones cost a few
 * points, and every borrowed phrase shows up after the game to learn.
 */
export function Lifeline({ hotkey = true, open: controlledOpen, onOpenChange }: { hotkey?: boolean; open?: boolean; onOpenChange?(open: boolean): void }) {
  const client = useGameClient();
  const lifelines = useGame((s) => s.state?.lifelines ?? []);
  const playing = useGame((s) => s.state?.phase === 'playing');
  const role = useGame((s) => s.state?.yourRole ?? null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const last = lifelines[lifelines.length - 1];
  const [shown, setShown] = useState<string | null>(null);

  const ask = async (zh: string) => {
    const clean = zh.trim();
    if (!clean || busy) return;
    if (!hasChinese(clean)) {
      toast('用中文说就好 · Just say it in Chinese, I will give you the English.');
      return;
    }
    setBusy(true);
    try {
      const res = await client.actions.assist(clean);
      setShown(res.en);
      speak(res.en, { rate: 0.9 });
      setText('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const zhSpeech = useSpeechInput((said) => void ask(said), 'zh-CN');

  const openBox = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  useEffect(() => {
    if (!open) {
      zhSpeech.stop();
      return;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open, zhSpeech.stop]);

  // H opens the lifeline (not while typing elsewhere).
  useEffect(() => {
    if (!hotkey) return;
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 'h' || e.key === 'H') && playing && role) {
        e.preventDefault();
        openBox();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [hotkey, playing, role]);

  // A new round clears the card.
  useEffect(() => {
    if (!lifelines.length) setShown(null);
  }, [lifelines.length]);

  if (!playing || !role) return null;
  const left = MAX_LIFELINES - lifelines.length;
  const nextCost = lifelines.length < FREE_LIFELINES ? 'free' : `-${LIFELINE_COST} pts`;
  const current = shown && last?.en === shown ? last : null;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {current && (
        <div className="pointer-events-auto flex max-w-[min(36rem,calc(100vw-1rem))] animate-pop items-start gap-2 rounded-2xl border-[3px] border-ink bg-mint px-3 py-2 shadow-[4px_4px_0_#2d3748]">
          <span className="mt-0.5 text-lg">🛟</span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-ink/60">
              {current.zh} → say it to your partner{current.used ? ' ✓ said' : ''}
            </div>
            <div className="font-display text-lg leading-snug font-semibold">{current.en}</div>
            <div className="text-[11px] font-bold text-ink/60">
              Say it with your mic on. Only you can see this card.
            </div>
          </div>
          <div className="ml-auto flex shrink-0 flex-col gap-1">
            <button className="rounded-lg border-2 border-ink bg-white p-1 hover:bg-cream" aria-label="Hear it" onClick={() => speak(current.en, { rate: 0.85 })}>
              <Volume2 size={15} strokeWidth={3} />
            </button>
            <button className="rounded-lg border-2 border-ink bg-white p-1 hover:bg-cream" aria-label="Close" onClick={() => setShown(null)}>
              <X size={15} strokeWidth={3} />
            </button>
          </div>
        </div>
      )}
      {open && (
        <form
          className="pointer-events-auto flex w-[min(34rem,calc(100vw-1rem))] items-center gap-2 rounded-2xl border-[3px] border-ink bg-white p-2 shadow-[4px_4px_0_#2d3748]"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(text).then(() => setOpen(false));
          }}
        >
          <span className="pl-1 text-lg">🛟</span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            placeholder="卡住了？用中文写下你想说的…"
            className="input-clay !rounded-xl !py-1.5 text-sm"
            maxLength={120}
            aria-label="Chinese lifeline"
          />
          {zhSpeech.supported && (
            <Tip label="Hold and say it in Chinese">
              <button
                type="button"
                aria-label="Say it in Chinese"
                onPointerDown={(e) => {
                  e.preventDefault();
                  zhSpeech.start();
                }}
                onPointerUp={() => zhSpeech.stop()}
                onPointerLeave={() => zhSpeech.listening && zhSpeech.stop()}
                className={`btn-clay !rounded-xl !px-2.5 !py-1.5 ${zhSpeech.listening ? 'bg-coral text-white' : 'bg-sun'}`}
              >
                <Mic size={16} strokeWidth={3} />
              </button>
            </Tip>
          )}
          <button type="submit" disabled={busy} className="btn-clay !rounded-xl bg-cta !px-2.5 !py-1.5 text-white" aria-label="Get the English">
            <Send size={16} strokeWidth={3} />
          </button>
          <button type="button" className="btn-clay !rounded-xl bg-white !px-2 !py-1.5" aria-label="Close" onClick={() => setOpen(false)}>
            <X size={16} strokeWidth={3} />
          </button>
        </form>
      )}
      {zhSpeech.listening && <div className="rounded-2xl border-2 border-dashed border-ink bg-sun/80 px-3 py-1 text-sm font-semibold">🎙️ {zhSpeech.interim || '请说中文…'}</div>}
      {!open && controlledOpen === undefined && (
        <Tip label={<span>Stuck? Say it in Chinese, get the English <Kbd>H</Kbd> · {nextCost} · {left} left</span>}>
          <button
            className="pointer-events-auto flex items-center gap-1 rounded-full border-[3px] border-ink bg-white px-2.5 py-1 text-xs font-bold shadow-[2px_2px_0_#2d3748] hover:bg-mint disabled:opacity-50"
            onClick={openBox}
            disabled={left <= 0}
            aria-label="Chinese lifeline"
          >
            <LifeBuoy size={15} strokeWidth={3} /> 中文求助 <span className="text-ink/50">{nextCost}</span>
          </button>
        </Tip>
      )}
    </div>
  );
}
