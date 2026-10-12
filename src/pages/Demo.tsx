import { Pause, Play, RefreshCw, Tv } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { Role } from '@shared/types';
import { GameView } from '@/components/game/GameView';
import { ReviewList, SkillBars, Stars } from '@/components/game/Results';
import { preloadModels } from '@/components/three/models';
import { btn, Logo, RoleBadge } from '@/components/ui';
import { loadItems } from '@/lib/api';
import { startAutoplay } from '@/lib/autoplay';
import { createGameClient, GameContext, useGame, type GameClient } from '@/lib/game-client';

function Pane({ role }: { role: Role }) {
  const st = useGame((s) => s.state);
  if (!st) return <div className="flex h-full items-center justify-center font-display text-muted">Connecting…</div>;
  if (st.phase === 'countdown' || st.phase === 'playing') return <GameView embedded pttKey={false} tts={false} />;
  if (st.phase === 'results' && st.results) {
    const r = st.results.report;
    return (
      <div className="h-full overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <RoleBadge role={role} />
          <Stars n={r.stars} />
        </div>
        <div className="mt-2 font-display text-5xl font-bold">
          {r.clarity}
          <span className="ml-2 text-base text-muted">clarity</span>
        </div>
        <div className="mt-4">
          <SkillBars skills={r.skills} />
        </div>
        <h3 className="mt-5 mb-2 font-display text-lg font-semibold">Coach review</h3>
        <ReviewList report={{ ...r, reviews: r.reviews.filter((x) => x.role === role || role === 'guide') }} coaching={st.results.coaching} />
        <Link to={`/replay/${st.results.replayId}`} className={btn('primary', 'sm', 'mt-4')}>
          ▶ Open replay
        </Link>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <RoleBadge role={role} />
      <p className="max-w-xs font-semibold text-muted">
        {role === 'guide' ? 'This screen sees the target (gold ring) but cannot touch anything.' : 'This screen can move objects but never sees the target.'}
      </p>
      <span className="clay-chip bg-white">✔ {st.players.find((p) => p.role === role)?.name ?? '…'} is ready</span>
    </div>
  );
}

type Pair = { guide: GameClient; builder: GameClient };

async function setupRoom(c: Pair) {
  const code = await c.guide.actions.create('Mia', { settings: { mode: 'duo', difficulty: 'normal', interests: ['space', 'animals', 'food'] }, role: 'guide' });
  await c.builder.actions.join(code, 'Leo', { role: 'builder' });
  return code;
}

export default function Demo() {
  const [clients, setClients] = useState<Pair | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [voice, setVoice] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const guideState = useGameStoreState(clients?.guide ?? null);

  // Clients are created inside the effect so each (StrictMode) mount owns and disposes its own sockets.
  useEffect(() => {
    preloadModels();
    void loadItems().catch(() => undefined);
    const pair: Pair = { guide: createGameClient({ persistIdentity: false }), builder: createGameClient({ persistIdentity: false }) };
    let live = true;
    setClients(pair);
    setupRoom(pair)
      .then((c) => live && setCode(c))
      .catch((err: Error) => live && toast.error(err.message));
    return () => {
      live = false;
      pair.guide.dispose();
      pair.builder.dispose();
    };
  }, []);

  useEffect(() => {
    stopRef.current?.();
    stopRef.current = auto && clients ? startAutoplay(clients.guide, clients.builder, { voice }) : null;
    return () => stopRef.current?.();
  }, [auto, voice, clients]);

  const start = async () => {
    if (!clients) return;
    try {
      if (guideState?.phase === 'results') clients.guide.actions.again();
      await new Promise((r) => setTimeout(r, 150));
      await clients.guide.actions.start();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const newRoom = () => {
    if (!clients) return;
    clients.guide.actions.leave();
    clients.builder.actions.leave();
    setupRoom(clients)
      .then(setCode)
      .catch((err: Error) => toast.error(err.message));
  };

  const phase = guideState?.phase ?? 'lobby';
  return (
    <div className="flex h-dvh flex-col bg-cream">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-[3px] border-ink bg-white px-3 py-2">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Logo size={32} />
          </Link>
          <span className="hidden font-display text-lg font-semibold sm:inline">Duo demo · two players, one screen</span>
          {code && <span className="clay-chip bg-cream !py-0.5 font-display tracking-widest">#{code}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn('primary', 'sm')} onClick={start} disabled={!code || phase === 'playing' || phase === 'countdown'}>
            <Play size={16} strokeWidth={3} /> {phase === 'results' ? 'Play again' : 'Start round'}
          </button>
          <button className={btn(auto ? 'sun' : 'white', 'sm')} onClick={() => setAuto((a) => !a)} aria-pressed={auto}>
            {auto ? <Pause size={16} strokeWidth={3} /> : <Play size={16} strokeWidth={3} />} Autoplay {auto ? 'on' : 'off'}
          </button>
          <button className={btn(voice ? 'grape' : 'white', 'sm')} onClick={() => setVoice((v) => !v)} aria-pressed={voice}>
            🔊 Voices {voice ? 'on' : 'off'}
          </button>
          {code && (
            <a href={`/watch/${code}`} target="_blank" rel="noreferrer" className={btn('white', 'sm')}>
              <Tv size={16} strokeWidth={3} /> Spectator screen
            </a>
          )}
          <button className={btn('white', 'sm', '!px-2')} aria-label="New room" onClick={newRoom}>
            <RefreshCw size={16} strokeWidth={3} />
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-2">
        {clients &&
          (['guide', 'builder'] as const).map((role) => (
            <GameContext.Provider key={role} value={clients[role]}>
              <div className="clay-card relative min-h-[45vh] overflow-hidden">
                <Pane role={role} />
              </div>
            </GameContext.Provider>
          ))}
      </div>
      <p className="border-t-2 border-line bg-white px-3 py-1.5 text-center text-xs font-semibold text-muted">
        Autoplay shows the core lesson: the guide first describes things from <b>their own</b> side, the builder asks “my left or your left?”, then the clear sentence wins. Turn autoplay off to play both sides yourself.
      </p>
    </div>
  );
}

/** Subscribe to a client store outside of its context provider. */
function useGameStoreState(client: GameClient | null) {
  const [st, setSt] = useState(client?.store.getState().state ?? null);
  useEffect(() => {
    if (!client) return;
    setSt(client.store.getState().state);
    return client.store.subscribe((s) => setSt(s.state));
  }, [client]);
  return st;
}
