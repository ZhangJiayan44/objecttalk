import * as Slider from '@radix-ui/react-slider';
import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { moveObject } from '@shared/missions';
import type { Replay } from '@shared/protocol';
import type { SceneState } from '@shared/types';
import { ReviewList, SkillBars, Stars, VERDICT_STYLE } from '@/components/game/Results';
import { RoomScene, type Pointer, type ViewMode } from '@/components/three/RoomScene';
import { btn, Navbar } from '@/components/ui';
import { fetchReplay, loadItems } from '@/lib/api';

interface Frame {
  scene: SceneState;
  heldId: string | null;
  missionIndex: number;
  pointer: Pointer | null;
}

/** Rebuild the table at time t from the initial scene + the event log. */
function frameAt(replay: Replay, t: number): Frame {
  let scene = replay.initialScene;
  let heldId: string | null = null;
  let missionIndex = -1;
  let pointer: Pointer | null = null;
  for (const e of replay.events) {
    if (e.t > t) break;
    const type = replay.missions[missionIndex]?.type;
    if (e.type === 'mission') {
      missionIndex = e.missionIndex ?? missionIndex + 1;
      heldId = null;
      pointer = null;
    } else if (e.type === 'hover') pointer = { objectId: e.objectId ?? null, cell: e.cell ?? null };
    else if (e.type === 'pick' && type === 'place') heldId = e.objectId ?? null;
    else if (e.type === 'place' && e.objectId && e.cell) {
      scene = moveObject(scene, e.objectId, e.cell);
      heldId = null;
    } else if (e.type === 'drop') heldId = null;
  }
  return { scene, heldId, missionIndex, pointer };
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

export default function ReplayPage() {
  const { id = '' } = useParams();
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<ViewMode>('overview');
  const raf = useRef(0);

  useEffect(() => {
    loadItems()
      .catch(() => undefined)
      .then(() => fetchReplay(id))
      .then((r) => {
        setReplay(r);
        setPlaying(true);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!playing || !replay) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= replay.durationMs) {
          setPlaying(false);
          return replay.durationMs;
        }
        return next;
      });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, replay]);

  const frame = useMemo(() => (replay ? frameAt(replay, t) : null), [replay, t]);
  const reviews = useMemo(() => new Map(replay?.report.reviews.map((r) => [r.messageId, r]) ?? []), [replay]);

  if (error)
    return (
      <div className="min-h-dvh bg-cream">
        <Navbar />
        <div className="mx-auto max-w-md px-4 pt-36 text-center">
          <div className="clay-card p-8">
            <div className="text-5xl">📼</div>
            <h1 className="mt-3 text-2xl font-bold">{error}</h1>
            <Link to="/play" className={btn('primary', 'md', 'mt-6')}>
              Play a round
            </Link>
          </div>
        </div>
      </div>
    );
  if (!replay || !frame)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream">
        <div className="clay-chip animate-pulse bg-white">Loading replay…</div>
      </div>
    );

  const mission = replay.missions[frame.missionIndex];
  const target = mission ? { findId: mission.targetId, itemId: mission.itemId, cell: mission.targetCell } : null;
  const names = Object.fromEntries(replay.players.map((p) => [p.role, p.name]));
  const visibleMsgs = replay.messages.filter((m) => m.t <= t);
  const markers = [
    ...replay.events.filter((e) => e.type === 'wrong' || e.type === 'success' || e.type === 'mission').map((e) => ({ t: e.t, cls: e.type === 'wrong' ? 'bg-coral' : e.type === 'success' ? 'bg-cta' : 'bg-grape', label: e.type })),
    ...replay.messages.map((m) => ({ t: m.t, cls: 'bg-ink h-2 w-1 rounded-none', label: m.text })),
  ];

  return (
    <div className="min-h-dvh bg-cream">
      <Navbar />
      <main className="mx-auto max-w-7xl px-3 pt-24 pb-12 sm:px-4 sm:pt-28">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="clay-chip bg-lavender">📼 Replay · room {replay.code}</span>
            <h1 className="mt-2 text-3xl font-bold">
              {replay.players.map((p) => `${p.isAI ? '🤖 ' : ''}${p.name}`).join(' & ')}
            </h1>
            <p className="text-muted">
              {new Date(replay.createdAt).toLocaleString()} · {replay.settings.difficulty} · {replay.report.missionsDone}/{replay.report.missionsTotal} missions
            </p>
          </div>
          <div className="flex rounded-2xl border-[3px] border-ink bg-white p-1" role="radiogroup" aria-label="Camera">
            {(['guide', 'builder', 'overview'] as ViewMode[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-xl px-3 py-1.5 text-sm font-bold ${view === v ? 'bg-sun shadow-[2px_2px_0_#2d3748]' : 'text-muted'}`} aria-pressed={view === v}>
                {v === 'guide' ? '🧭 Guide view' : v === 'builder' ? '🛠️ Builder view' : '👀 Both sides'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <div className="clay-card relative aspect-[16/10] overflow-hidden bg-gradient-to-b from-[#fff4ef] to-[#e9f6fb]">
              <RoomScene className="!absolute inset-0" scene={frame.scene} view={view} heldId={frame.heldId} target={target} pointer={frame.pointer} names={names} />
              {mission && (
                <div className="absolute top-3 left-3 clay-chip bg-white">
                  {mission.type === 'find' ? '🔎' : '📦'} Mission {mission.index + 1} · {mission.success ? '✅' : '…'}
                </div>
              )}
              {visibleMsgs.length > 0 && (
                <div className="absolute inset-x-3 bottom-3 flex justify-center">
                  {(() => {
                    const m = visibleMsgs[visibleMsgs.length - 1];
                    const fresh = t - m.t < 3500;
                    return fresh ? (
                      <div key={m.id} className={`animate-pop rounded-2xl border-[3px] border-ink px-4 py-2 text-center font-bold shadow-[3px_3px_0_#2d3748] ${m.role === 'guide' ? 'bg-peach' : 'bg-sky'}`}>
                        {m.role === 'guide' ? '🧭' : '🛠️'} {m.text}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            <div className="clay-card p-4">
              <div className="flex items-center gap-3">
                <button className={btn('primary', 'sm', '!px-2.5')} onClick={() => (t >= replay.durationMs ? (setT(0), setPlaying(true)) : setPlaying((p) => !p))} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={18} strokeWidth={3} /> : <Play size={18} strokeWidth={3} />}
                </button>
                <span className="w-24 font-display font-semibold tabular-nums">
                  {fmt(t)} / {fmt(replay.durationMs)}
                </span>
                <div className="relative flex-1">
                  <div className="pointer-events-none absolute inset-x-0 -top-3 h-2">
                    {markers.map((mk, i) => (
                      <span key={i} title={mk.label} className={`absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full ${mk.cls}`} style={{ left: `${(mk.t / Math.max(1, replay.durationMs)) * 100}%` }} />
                    ))}
                  </div>
                  <Slider.Root className="relative flex h-6 touch-none items-center select-none" value={[t]} max={replay.durationMs} step={50} onValueChange={([v]) => setT(v)} aria-label="Timeline">
                    <Slider.Track className="relative h-3 grow rounded-full border-2 border-ink bg-line">
                      <Slider.Range className="absolute h-full rounded-full bg-sun" />
                    </Slider.Track>
                    <Slider.Thumb className="block h-6 w-6 rounded-full border-[3px] border-ink bg-white shadow-[2px_2px_0_#2d3748] focus:outline-none" />
                  </Slider.Root>
                </div>
                <button className={btn('white', 'sm')} onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1))}>
                  {speed}×
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-muted">
                <span className="flex items-center gap-1">
                  <i className="h-2 w-2 rounded-full bg-grape" /> mission start
                </span>
                <span className="flex items-center gap-1">
                  <i className="h-2 w-2 rounded-full bg-coral" /> wrong pick
                </span>
                <span className="flex items-center gap-1">
                  <i className="h-2 w-2 rounded-full bg-cta" /> success
                </span>
                <span className="flex items-center gap-1">
                  <i className="h-2 w-1 bg-ink" /> someone spoke
                </span>
              </div>
            </div>

            <div className="clay-card p-4">
              <h2 className="mb-2 font-display text-xl font-semibold">Transcript</h2>
              <ol className="space-y-1.5">
                {replay.messages.map((m) => {
                  const r = reviews.get(m.id);
                  const past = m.t <= t;
                  return (
                    <li key={m.id}>
                      <button onClick={() => setT(Math.max(0, m.t - 300))} className={`flex w-full items-start gap-2 rounded-xl px-2 py-1 text-left hover:bg-cream ${past ? '' : 'opacity-40'}`}>
                        <span className="w-12 shrink-0 font-display text-sm text-muted tabular-nums">{fmt(m.t)}</span>
                        <span className="shrink-0">{m.role === 'guide' ? '🧭' : '🛠️'}</span>
                        <span className="flex-1 font-semibold">{m.text}</span>
                        {r && <span className={`shrink-0 rounded-full border-2 border-ink px-2 text-xs font-bold ${VERDICT_STYLE[r.verdict].cls}`}>{VERDICT_STYLE[r.verdict].label}</span>}
                      </button>
                    </li>
                  );
                })}
                {replay.messages.length === 0 && <li className="text-muted">No transcript recorded for this round.</li>}
              </ol>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="clay-card bg-sun/30 p-5">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-sm font-bold text-muted">Clarity score</div>
                  <div className="font-display text-6xl font-bold">{replay.report.clarity}</div>
                </div>
                <Stars n={replay.report.stars} />
              </div>
              <div className="mt-4">
                <SkillBars skills={replay.report.skills} />
              </div>
              <ul className="mt-4 space-y-1.5 text-sm font-semibold">
                {replay.report.tips.map((tip) => (
                  <li key={tip}>💡 {tip}</li>
                ))}
              </ul>
            </div>
            <div className="clay-card p-5">
              <h2 className="mb-3 font-display text-xl font-semibold">Coach review</h2>
              <ReviewList report={replay.report} coaching={replay.coaching} />
            </div>
            <Link to="/play" className={btn('primary', 'md', 'w-full')}>
              Play another round
            </Link>
          </aside>
        </div>
      </main>
    </div>
  );
}
