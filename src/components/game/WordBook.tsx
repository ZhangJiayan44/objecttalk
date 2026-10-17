import { Check, RotateCcw, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { btn } from '@/components/ui';
import { asset } from '@/lib/asset';
import { speak } from '@/lib/speech';
import { getWords, removeWord, setKnown, type WordEntry } from '@/lib/words';

const SOURCE: Record<WordEntry['source'], { label: string; cls: string }> = {
  lifeline: { label: '🛟 borrowed', cls: 'bg-mint' },
  scene: { label: '👆 looked up', cls: 'bg-sky' },
  studio: { label: '📷 my photo', cls: 'bg-lavender' },
};

/**
 * The word book: phrases borrowed with the Chinese lifeline, objects looked up
 * in the scenes, the player's own photo objects. A quick flip-card review
 * (English hidden until you try) keeps it a speaking exercise, not a list.
 */
export function WordBook() {
  const [words, setWords] = useState<WordEntry[]>(() => getWords());
  const [filter, setFilter] = useState<'all' | WordEntry['source']>('all');
  const [review, setReview] = useState<WordEntry[] | null>(null);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => setWords(getWords());
    window.addEventListener('objecttalk:words', on);
    return () => window.removeEventListener('objecttalk:words', on);
  }, []);
  const list = useMemo(() => words.filter((w) => filter === 'all' || w.source === filter), [words, filter]);
  const toLearn = words.filter((w) => !w.known);

  const startReview = () => {
    // Weakest first: most often borrowed or looked up, then the oldest.
    const deck = [...toLearn].sort((a, b) => b.count - a.count || a.last - b.last).slice(0, 12);
    if (!deck.length) return;
    setReview(deck);
    setI(0);
    setShown(false);
  };

  if (!words.length)
    return (
      <div className="clay-card p-6">
        <h2 className="text-xl font-bold">📒 Word book</h2>
        <p className="mt-2 text-sm text-muted">
          Empty for now. It fills up as you play: point at things in a scene and click them, use 🛟 中文求助 when you are stuck, or turn your own photos into 3D objects in the Object Studio.
        </p>
      </div>
    );

  const card = review?.[i];
  return (
    <div className="clay-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">📒 Word book</h2>
          <p className="text-sm text-muted">
            {words.length} words · {toLearn.length} to learn · saved on this device
          </p>
        </div>
        <button className={btn('primary', 'sm')} disabled={!toLearn.length} onClick={startReview}>
          Review {Math.min(12, toLearn.length)} words
        </button>
      </div>

      {card && (
        <div className="mt-4 rounded-3xl border-[3px] border-ink bg-sun/40 p-5 text-center">
          <div className="text-xs font-bold text-muted">
            {i + 1} / {review!.length} · say it in English, then check
          </div>
          {card.img && <img src={asset(card.img)} alt="" className="mx-auto mt-2 h-20 w-20 object-contain" />}
          <div className="mt-2 font-display text-2xl font-semibold">{card.zh || '…'}</div>
          {shown ? (
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="font-display text-3xl font-bold">{card.en}</span>
              <button className="rounded-lg border-2 border-ink bg-white p-1" aria-label="Hear it" onClick={() => speak(card.en, { rate: 0.85 })}>
                <Volume2 size={16} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button
              className={btn('white', 'sm', 'mt-3')}
              onClick={() => {
                setShown(true);
                speak(card.en, { rate: 0.85 });
              }}
            >
              Show the English
            </button>
          )}
          {shown && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                className={btn('secondary', 'sm')}
                onClick={() => {
                  setKnown(card.en, true);
                  next();
                }}
              >
                <Check size={16} strokeWidth={3} /> I knew it
              </button>
              <button className={btn('peach', 'sm')} onClick={next}>
                <RotateCcw size={16} strokeWidth={3} /> Again later
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'lifeline', 'scene', 'studio'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${filter === f ? 'bg-sun' : 'bg-white'}`}>
            {f === 'all' ? 'All' : SOURCE[f].label}
          </button>
        ))}
      </div>
      <ul className="mt-3 grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {list.map((w) => (
          <li key={w.en} className={`flex items-center gap-2 rounded-2xl border-2 border-ink px-3 py-2 ${w.known ? 'bg-cream opacity-70' : 'bg-white'}`}>
            <button className="shrink-0 rounded-lg border-2 border-ink bg-sun p-1" aria-label={`Hear ${w.en}`} onClick={() => speak(w.en, { rate: 0.85 })}>
              <Volume2 size={14} strokeWidth={3} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{w.en}</div>
              <div className="truncate text-xs text-muted">
                {w.zh} · <span className={`rounded-full px-1.5 ${SOURCE[w.source].cls}`}>{SOURCE[w.source].label}</span>
                {w.count > 1 ? ` · ×${w.count}` : ''}
              </div>
            </div>
            <button className="shrink-0 text-muted hover:text-ink" aria-label={w.known ? 'Mark as not learned' : 'Mark as learned'} title={w.known ? 'Learned (click to undo)' : 'Mark as learned'} onClick={() => setKnown(w.en, !w.known)}>
              <Check size={16} strokeWidth={3} className={w.known ? 'text-cta' : ''} />
            </button>
            <button className="shrink-0 text-muted hover:text-coral" aria-label="Remove" onClick={() => removeWord(w.en)}>
              <Trash2 size={15} strokeWidth={2.5} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  function next() {
    if (!review) return;
    if (i + 1 >= review.length) {
      setReview(null);
      setWords(getWords());
      return;
    }
    setI(i + 1);
    setShown(false);
  }
}
