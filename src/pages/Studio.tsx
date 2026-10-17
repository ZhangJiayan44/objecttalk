import { Check, ImagePlus, Loader2, Sparkles, Volume2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { allKinds, INTERESTS } from '@shared/catalog';
import type { ServerInfo } from '@shared/protocol';
import type { ItemKind } from '@shared/types';
import { btn, Footer, Modal, Navbar } from '@/components/ui';
import { fetchInfo, fetchStudioJob, identifyStudioPhoto, loadItems, myObjectIds, rememberMyObject, submitStudioJob, type IdentifiedObject } from '@/lib/api';
import { getName } from '@/lib/profile';
import { asset } from '@/lib/asset';
import { getPrimaryClient } from '@/lib/primary';
import { speak, useSpeechInput } from '@/lib/speech';
import { addWord } from '@/lib/words';

const Showcase = lazy(() => import('@/components/three/Showcase').then((m) => ({ default: m.Showcase })));

const STAGES = ['submitting', 'queued', 'generating', 'downloading', 'optimizing', 'done'] as const;
const STAGE_LABEL: Record<string, string> = {
  submitting: 'Uploading photo',
  queued: 'Queued at Rodin',
  generating: 'Rodin is sculpting',
  downloading: 'Downloading GLB',
  optimizing: 'Optimizing for the web',
  done: 'Ready to play!',
};

const PIPELINE = [
  { tag: 'Reference', text: 'Single object, clean background, whole object visible. We checked every image before generation.', emoji: '🖼️' },
  { tag: 'Rodin Gen-2.5', text: 'Image-to-3D, Gen-2.5-High, Raw mesh ≤ 20k faces (fast mode), PBR textures.', emoji: '🪄' },
  { tag: 'Optimize', text: 'Centre + normalize, WebP textures, meshopt geometry: about 8 MB down to about 300 KB (-96%).', emoji: '🗜️' },
  { tag: 'Validate', text: 'The playability simulator plays 300 rounds with the new object: every mission must have one clear answer.', emoji: '✅' },
];

const PLAY_WITH = [
  { level: 'study', emoji: '📚', title: 'On the desk', text: 'Your partner must find it by your words: "the panda mug next to the lamp".' },
  { level: 'bedroom', emoji: '🛏️', title: 'Lost in the bedroom', text: 'It is hidden somewhere. Describe where: "under the bed", "inside the toy box".' },
  { level: 'cafe', emoji: '☕', title: 'Today’s special', text: 'It is on the café menu. Order it: "Could I have two panda mugs, please?"' },
] as const;

/** Say the new word until the browser hears it: the 1-3 minutes of generation become practice. */
function SayIt({ word, example }: { word: string; example: string }) {
  const [heard, setHeard] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const speech = useSpeechInput((said) => {
    setHeard(said);
    setTries((t) => t + 1);
  });
  const ok = !!heard && heard.toLowerCase().includes(word.toLowerCase().split(' ').pop() ?? word);
  return (
    <div className="mt-3 rounded-2xl border-2 border-ink bg-white p-3">
      <div className="text-sm font-bold text-muted">While Rodin builds it: say it out loud</div>
      <div className="mt-1 flex items-center gap-2">
        <button className="rounded-lg border-2 border-ink bg-sun p-1" aria-label="Hear the word" onClick={() => speak(word, { rate: 0.85 })}>
          <Volume2 size={16} strokeWidth={3} />
        </button>
        <span className="font-display text-2xl font-semibold">{word}</span>
      </div>
      <button className="mt-1 text-left text-sm font-semibold text-ink/80 hover:underline" onClick={() => speak(example, { rate: 0.9 })}>
        🔊 {example}
      </button>
      {speech.supported ? (
        <button
          className={btn(ok ? 'sun' : speech.listening ? 'peach' : 'secondary', 'sm', 'mt-2')}
          onPointerDown={(e) => {
            e.preventDefault();
            speech.start();
          }}
          onPointerUp={() => speech.stop()}
          onPointerLeave={() => speech.listening && speech.stop()}
        >
          {speech.listening ? '🎙️ Listening… (release to stop)' : ok ? `✓ Great! (${tries} ${tries > 1 ? 'tries' : 'try'})` : '🎙️ Hold and say the sentence'}
        </button>
      ) : null}
      {heard && <p className="mt-1 text-xs text-muted">I heard: “{heard}”{ok ? '' : ` · try again, say “${word}” clearly`}</p>}
    </div>
  );
}

function KindCard({ kind, onOpen }: { kind: ItemKind; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="clay-card clay-card-hover flex flex-col items-center p-4 text-center">
      {kind.ref ? <img src={asset(kind.ref)} alt="" className="h-20 w-20 object-contain" /> : <span className="text-5xl">{kind.emoji}</span>}
      <span className="mt-2 font-display text-lg font-semibold capitalize">{kind.name}</span>
      <span className={`mt-1 rounded-full border-2 border-ink px-2 text-xs font-bold ${kind.source === 'rodin' ? 'bg-lavender' : 'bg-line'}`}>{kind.source === 'rodin' ? 'Rodin 3D' : 'Procedural'}</span>
      {kind.rodin && <span className="mt-1 font-mono text-[10px] text-muted">{kind.rodin.generationId.slice(0, 8)} · {kind.rodin.tier}</span>}
    </button>
  );
}

export default function Studio() {
  const navigate = useNavigate();
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [kinds, setKinds] = useState<ItemKind[]>(allKinds());
  const [preview, setPreview] = useState<ItemKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [synonyms, setSynonyms] = useState('');
  const [interest, setInterest] = useState('everyday');
  const [color, setColor] = useState('white');
  const [job, setJob] = useState<{ id: string; stage: string; error?: string; kind?: ItemKind } | null>(null);
  const [seen, setSeen] = useState<IdentifiedObject | null>(null);
  const [looking, setLooking] = useState(false);
  const [mine, setMine] = useState<string[]>(() => myObjectIds());

  useEffect(() => {
    fetchInfo().then(setInfo).catch(() => undefined);
    loadItems()
      .then((r) => setKinds(r.kinds))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!file) return setImgUrl(null);
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setSeen(null);
    setLooking(true);
    identifyStudioPhoto(file)
      .then((r) => {
        if (cancelled || !r) return;
        setSeen(r);
        if (r.ok) {
          setName((n) => n || r.name);
          setSynonyms((s) => s || r.synonyms.join(', '));
          if (['white', 'red', 'blue', 'yellow', 'green', 'pink', 'purple', 'orange', 'brown'].includes(r.color)) setColor(r.color);
          speak(r.name, { rate: 0.85 });
        }
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLooking(false));
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (!job || job.stage === 'done' || job.stage === 'failed') return;
    const id = setInterval(async () => {
      try {
        const j = await fetchStudioJob(job.id);
        setJob(j);
        if (j.stage === 'done') {
          toast.success(`${j.name} is ready!`);
          const r = await loadItems(true);
          setKinds(r.kinds);
          if (j.kind) {
            rememberMyObject(j.kind.id);
            setMine(myObjectIds());
            addWord({ en: j.kind.name, zh: j.kind.zh?.split('/')[0] ?? seen?.zh ?? '', source: 'studio', img: j.kind.ref });
          }
        }
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [job]);

  const submit = async () => {
    if (!file || !name.trim()) return toast.error('Add a photo and a name first.');
    const form = new FormData();
    form.append('image', file);
    form.append('name', name.trim());
    form.append('synonyms', synonyms);
    form.append('interest', interest);
    form.append('color', color);
    if (seen?.ok && seen.name === name.trim().toLowerCase()) {
      form.append('zh', seen.zh);
      form.append('plural', seen.plural);
    }
    try {
      const id = await submitStudioJob(form);
      setJob({ id, stage: 'submitting' });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const playWith = async (kind: ItemKind, level = 'study') => {
    try {
      // The player describes / orders / hides their own thing: they are the guide, the AI plays the other role.
      const code = await getPrimaryClient().actions.create(getName(), { settings: { mode: 'ai', aiRole: 'builder', level, customKinds: [kind.id] }, role: 'guide' });
      navigate(`/room/${code}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const live = info?.features.rodin;
  const stageIdx = job ? STAGES.indexOf(job.stage as (typeof STAGES)[number]) : -1;

  return (
    <div className="min-h-dvh bg-cream">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pt-28 pb-16">
        <div className="mb-10 text-center">
          <span className="clay-chip bg-lavender">✨ Object Studio · Hyper3D Rodin Gen-2.5</span>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Bring your own things into the game</h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-muted">Snap a photo of your favourite mug, toy or shoe. Rodin turns it into a 3D object, and your partner has to find it by your words.</p>
        </div>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="clay-card p-6">
            <h2 className="text-2xl font-bold">1 · Your photo</h2>
            {!live && info && (
              <p className="mt-3 rounded-2xl border-2 border-dashed border-ink bg-sun/40 p-3 text-sm font-semibold">
                {import.meta.env.VITE_STATIC ? (
                  <>Photo-to-3D needs the ObjectTalk server with a Rodin key (this GitHub Pages demo has no backend). Every object in the library below was generated with Hyper3D Rodin.</>
                ) : (
                  <>
                    Live generation is off on this server. Set <code className="rounded bg-white px-1">RODIN_API_KEY</code> to enable it. Every object in the library below was generated with Rodin already.
                  </>
                )}
              </p>
            )}
            <label className="mt-4 flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-3xl border-[3px] border-dashed border-ink bg-cream text-center hover:bg-sun/20">
              {imgUrl ? (
                <img src={imgUrl} alt="Your object" className="max-h-full max-w-full rounded-2xl object-contain p-2" />
              ) : (
                <>
                  <ImagePlus size={40} strokeWidth={2.5} />
                  <span className="mt-2 font-bold">Drop or choose a photo</span>
                  <span className="text-sm text-muted">One object, plain background, fully in frame</span>
                </>
              )}
              <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {looking && (
              <p className="mt-3 flex items-center gap-2 text-sm font-bold text-muted">
                <Loader2 size={16} className="animate-spin" /> The AI is looking at your photo…
              </p>
            )}
            {seen && !seen.ok && <p className="mt-3 rounded-2xl border-2 border-ink bg-peach/50 p-3 text-sm font-semibold">📷 {seen.tip || 'Try one object on a plain background, fully in the frame.'}</p>}
            {seen?.ok && (
              <div className="mt-3 rounded-2xl border-2 border-ink bg-mint/40 p-3">
                <div className="text-xs font-bold text-muted">The AI sees:</div>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <button className="font-display text-2xl font-semibold hover:underline" onClick={() => speak(seen.name, { rate: 0.85 })}>
                    🔊 {seen.name}
                  </button>
                  <span className="font-bold text-ink/70">{seen.zh}</span>
                  <span className="text-sm text-muted">two {seen.plural}</span>
                </div>
                <p className="text-sm font-semibold">“{seen.example}”</p>
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input className="input-clay" placeholder="Name, e.g. panda mug" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
              <input className="input-clay" placeholder="Other words, e.g. cup, panda" value={synonyms} onChange={(e) => setSynonyms(e.target.value)} />
              <select className="input-clay" value={interest} onChange={(e) => setInterest(e.target.value)} aria-label="Interest">
                <option value="everyday">Everyday</option>
                {INTERESTS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.emoji} {i.label}
                  </option>
                ))}
              </select>
              <select className="input-clay" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Main colour">
                {['white', 'red', 'blue', 'yellow', 'green', 'pink', 'purple', 'orange', 'brown'].map((c) => (
                  <option key={c} value={c}>
                    Main colour: {c}
                  </option>
                ))}
              </select>
            </div>
            <button className={btn('primary', 'lg', 'mt-5 w-full')} disabled={!live || !file || !name.trim() || (!!job && stageIdx >= 0 && stageIdx < 5)} onClick={submit}>
              <Sparkles size={20} strokeWidth={3} /> Generate my 3D object
            </button>
          </div>

          <div className="clay-card flex flex-col p-6">
            <h2 className="text-2xl font-bold">2 · Rodin does the magic</h2>
            <ol className="mt-4 space-y-2">
              {STAGES.map((s, i) => {
                const done = stageIdx > i || job?.stage === 'done';
                const active = stageIdx === i && job?.stage !== 'done';
                return (
                  <li key={s} className={`flex items-center gap-3 rounded-2xl border-2 border-ink px-3 py-2 ${done ? 'bg-mint' : active ? 'bg-sun' : 'bg-white opacity-60'}`}>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink bg-white">{done ? <Check size={16} strokeWidth={3} /> : active ? <Loader2 size={16} className="animate-spin" /> : i + 1}</span>
                    <span className="font-bold">{STAGE_LABEL[s]}</span>
                  </li>
                );
              })}
            </ol>
            {job?.stage === 'failed' && <p className="mt-3 rounded-xl bg-coral/20 p-2 text-sm font-bold">Generation failed: {job.error}</p>}
            {job && !job.kind && job.stage !== 'failed' && <SayIt word={name.trim().toLowerCase() || 'my thing'} example={seen?.ok && seen.name === name.trim().toLowerCase() ? seen.example : `Could I have a ${name.trim().toLowerCase() || 'thing'}, please?`} />}
            {job?.kind ? (
              <div className="mt-4 flex flex-1 flex-col">
                <div className="relative min-h-56 flex-1 overflow-hidden rounded-3xl border-[3px] border-ink bg-lavender/40">
                  <Suspense fallback={null}>
                    <Showcase className="!absolute inset-0" kinds={[job.kind.id]} labels={false} />
                  </Suspense>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">3 · Where should it go?</h3>
                <div className="mt-2 grid gap-2">
                  {PLAY_WITH.map((p) => (
                    <button key={p.level} className="clay-sm flex items-start gap-3 bg-white p-3 text-left hover:bg-sun/40" onClick={() => playWith(job.kind!, p.level)}>
                      <span className="text-2xl">{p.emoji}</span>
                      <span>
                        <span className="block font-bold">{p.title} →</span>
                        <span className="text-sm text-muted">{p.text.replaceAll('panda mug', job.kind!.name)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">Generation usually takes 1–3 minutes. The model is optimized automatically and joins your objects: it can hide in the bedroom, sit on the desk or be the café’s special.</p>
            )}
          </div>
        </section>

        <section className="mt-14">
          {kinds.some((k) => mine.includes(k.id)) && (
            <div className="mb-10">
              <h2 className="mb-2 text-3xl font-bold">Your objects</h2>
              <p className="mb-4 text-muted">Made from your photos. Pick one and a place to play with it.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {kinds
                  .filter((k) => mine.includes(k.id))
                  .map((k) => (
                    <div key={k.id} className="clay-card flex items-center gap-3 p-3">
                      {k.ref ? <img src={asset(k.ref)} alt="" className="h-16 w-16 rounded-xl border-2 border-ink object-cover" /> : <span className="text-4xl">✨</span>}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-lg font-semibold">{k.name}</div>
                        <div className="text-xs font-bold text-muted">{k.zh?.split('/')[0]}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {PLAY_WITH.map((p) => (
                            <button key={p.level} className="rounded-full border-2 border-ink bg-cream px-2 text-xs font-bold hover:bg-sun" onClick={() => playWith(k, p.level)} title={p.title}>
                              {p.emoji} {p.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <h2 className="mb-2 text-3xl font-bold">Object library</h2>
          <p className="mb-6 text-muted">Click any object for a 3D preview. All {kinds.filter((k) => k.source === 'rodin').length} were generated with Hyper3D Rodin Gen-2.5 (MCP, REST API and the Scene Agent).</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {kinds.map((k) => (
              <KindCard key={k.id} kind={k} onOpen={() => setPreview(k)} />
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="mb-6 text-3xl font-bold">How an object gets into the game</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {PIPELINE.map((p, i) => (
              <div key={p.tag} className="clay-card p-5">
                <div className="text-3xl">{p.emoji}</div>
                <div className="mt-2 font-display text-sm font-semibold text-muted">STEP {i + 1}</div>
                <h3 className="text-lg font-bold">{p.tag}</h3>
                <p className="mt-1 text-sm font-semibold text-ink/80">{p.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Modal open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={preview?.name ?? ''} description={preview?.rodin ? `Rodin generation ${preview.rodin.generationId} · ${preview.rodin.tier}` : 'Procedural object'}>
        {preview && (
          <>
            <div className="relative aspect-square overflow-hidden rounded-3xl border-[3px] border-ink bg-lavender/40">
              <Suspense fallback={null}>
                <Showcase className="!absolute inset-0" kinds={[preview.id]} labels={false} />
              </Suspense>
            </div>
            <p className="mt-3 text-sm text-muted">Players can call it: {preview.synonyms.join(', ')}</p>
            {preview.rodin && <p className="mt-1 text-sm text-muted">Reference: {preview.rodin.reference}</p>}
          </>
        )}
      </Modal>
      <Footer />
    </div>
  );
}
