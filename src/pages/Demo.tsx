import { BrainCircuit, Play, RefreshCw, Tv, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { generatedLevelList, LEVEL_ORDER, LEVELS, levelOf } from '@shared/levels';
import type { Difficulty, Role } from '@shared/types';
import { AgentPanel } from '@/components/game/AgentPanel';
import { GameView } from '@/components/game/GameView';
import { CefrCard, ReviewList, RoundOutcome, SkillBars, Stars } from '@/components/game/Results';
import { useCommsPrefs, useReadAloud } from '@/components/game/VoiceBar';
import { preloadModels } from '@/components/three/models';
import { btn, Logo } from '@/components/ui';
import { loadItems, loadLevels } from '@/lib/api';
import { createGameClient, GameContext, useGame, type GameClient } from '@/lib/game-client';

/**
 * One-screen demo for the booth and the video: two AI partners play any
 * level live (real server, real agents, real coach) while the screen shows
 * both points of view side by side and the agents' reasoning. "Play both
 * seats" switches to a manual duo where you control each side yourself.
 */

function Pane({ role }: { role: Role }) {
  const st = useGame((s) => s.state);
  if (!st) return <div className="flex h-full items-center justify-center font-display text-muted">Connecting…</div>;
  const level = levelOf(st.settings.level);
  if (st.phase === 'countdown' || st.phase === 'playing') return <GameView embedded pttKey={false} tts={false} viewOverride={st.yourRole ? undefined : role} />;
  if (st.phase === 'results' && st.results) {
    const r = st.results.report;
    return (
      <div className="h-full overflow-y-auto p-4">
        <RoundOutcome report={r} />
        <div className="flex items-center justify-between">
          <span className={`clay-chip ${role === 'guide' ? 'bg-peach' : 'bg-sky'}`}>
            {level.roles[role].icon} {level.roles[role].name}
          </span>
          <Stars n={r.stars} />
        </div>
        <div className="mt-2 font-display text-5xl font-bold">
          {r.clarity}
          <span className="ml-2 text-base text-muted">clarity</span>
        </div>
        <div className="mt-4">
          <SkillBars skills={r.skills} names={r.skillNames} />
        </div>
        {role === 'guide' && (
          <div className="mt-4">
            <CefrCard report={r} coaching={st.results.coaching} />
          </div>
        )}
        <h3 className="mt-5 mb-2 font-display text-lg font-semibold">Coach review</h3>
        <ReviewList report={{ ...r, reviews: r.reviews.filter((x) => x.role === role) }} coaching={role === 'guide' ? st.results.coaching : undefined} />
        <Link to={`/replay/${st.results.replayId}`} className={btn('primary', 'sm', 'mt-4')}>
          ▶ Open replay
        </Link>
      </div>
    );
  }
  const copy = level.roles[role];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="text-5xl">{level.emoji}</span>
      <span className={`clay-chip ${role === 'guide' ? 'bg-peach' : 'bg-sky'}`}>
        {copy.icon} {copy.name}
      </span>
      <p className="max-w-xs font-semibold text-muted">
        This screen sees {copy.sees} and {copy.does}.
      </p>
      <span className="clay-chip bg-white">✔ {st.players.find((p) => p.role === role)?.name ?? '…'} is ready</span>
    </div>
  );
}

type Pair = { guide: GameClient; builder: GameClient };
type DemoMode = 'sim' | 'duo';

function DemoVoice({ enabled }: { enabled: boolean }) {
  useReadAloud(enabled, false, true);
  return null;
}

async function setupRoom(c: Pair, mode: DemoMode, level: string, difficulty: Difficulty) {
  const durationSec = levelOf(level).durationSec;
  if (mode === 'sim') {
    const code = await c.guide.actions.create('Booth', { settings: { mode: 'sim', level, difficulty, durationSec }, role: 'guide' });
    await c.builder.actions.join(code, 'Booth 2', { viewAs: 'builder' });
    return code;
  }
  const code = await c.guide.actions.create('Mia', { settings: { mode: 'duo', level, difficulty, durationSec, interests: ['space', 'animals', 'food'] }, role: 'guide' });
  await c.builder.actions.join(code, 'Leo', { role: 'builder' });
  return code;
}

export default function Demo() {
  const [clients, setClients] = useState<Pair | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [mode, setMode] = useState<DemoMode>('sim');
  const [level, setLevel] = useState<string>('study');
  const [difficulty, setDifficulty] = useState<Difficulty>('tricky');
  const [brain, setBrain] = useState(true);
  const prefs = useCommsPrefs();
  const [nonce, setNonce] = useState(0);
  const [, setVersion] = useState(0);
  const guideState = useGameStoreState(clients?.guide ?? null);

  useEffect(() => {
    void loadItems().catch(() => undefined);
    void loadLevels()
      .then(() => setVersion((v) => v + 1))
      .catch(() => undefined);
  }, []);
  useEffect(() => preloadModels(level), [level]);

  // Clients are created inside the effect so each (StrictMode) mount owns and disposes its own sockets.
  useEffect(() => {
    const pair: Pair = { guide: createGameClient({ persistIdentity: false }), builder: createGameClient({ persistIdentity: false }) };
    let live = true;
    setClients(pair);
    setupRoom(pair, mode, level, difficulty)
      .then((c) => live && setCode(c))
      .catch((err: Error) => live && toast.error(err.message));
    return () => {
      live = false;
      pair.guide.dispose();
      pair.builder.dispose();
    };
  }, [mode, level, difficulty, nonce]);

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

  const phase = guideState?.phase ?? 'lobby';
  const levels = [...LEVEL_ORDER.map((id) => LEVELS[id]), ...generatedLevelList()];
  return (
    <div className="flex h-dvh flex-col bg-cream">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-[3px] border-ink bg-white px-3 py-2">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Logo size={32} />
          </Link>
          <span className="hidden font-display text-lg font-semibold xl:inline">{mode === 'sim' ? 'Live demo · two AI partners' : 'Duo demo · you play both seats'}</span>
          {code && <span className="clay-chip bg-cream !py-0.5 font-display tracking-widest">#{code}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input-clay !w-auto !rounded-xl !py-1.5 text-sm" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level" disabled={phase === 'playing'}>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.emoji} {l.title}
              </option>
            ))}
          </select>
          <select className="input-clay !w-auto !rounded-xl !py-1.5 text-sm" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} aria-label="Difficulty" disabled={phase === 'playing'}>
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="tricky">Tricky</option>
          </select>
          <div className="flex rounded-xl border-[3px] border-ink bg-cream p-0.5">
            {(['sim', 'duo'] as DemoMode[]).map((m) => (
              <button key={m} className={`rounded-lg px-2.5 py-1 text-sm font-bold ${mode === m ? 'bg-white shadow-[2px_2px_0_#2d3748]' : 'text-muted'}`} onClick={() => setMode(m)} disabled={phase === 'playing'}>
                {m === 'sim' ? '🤖 AI vs AI' : '🧑‍🤝‍🧑 Play both'}
              </button>
            ))}
          </div>
          <button className={btn('primary', 'sm')} onClick={start} disabled={!code || phase === 'playing' || phase === 'countdown'}>
            <Play size={16} strokeWidth={3} /> {phase === 'results' ? 'Play again' : 'Start round'}
          </button>
          <button className={btn(brain ? 'grape' : 'white', 'sm')} onClick={() => setBrain((b) => !b)} aria-pressed={brain}>
            <BrainCircuit size={16} strokeWidth={3} /> AI brain
          </button>
          {mode === 'sim' && (
            <button className={btn('white', 'sm', '!px-2')} onClick={prefs.toggleVoiceOut} aria-label={prefs.voiceOut ? 'Mute AI voices' : 'Enable AI voices'} title={prefs.voiceOut ? 'Mute AI voices' : 'Enable AI voices'}>
              {prefs.voiceOut ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}
          {code && (
            <a href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/watch/${code}`} target="_blank" rel="noreferrer" className={btn('white', 'sm')}>
              <Tv size={16} strokeWidth={3} /> Spectator screen
            </a>
          )}
          <button className={btn('white', 'sm', '!px-2')} aria-label="New room" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw size={16} strokeWidth={3} />
          </button>
        </div>
      </header>
      {clients && mode === 'sim' && <GameContext.Provider value={clients.guide}><DemoVoice enabled={prefs.voiceOut} /></GameContext.Provider>}
      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 ${brain ? 'xl:grid-cols-[1fr_1fr_24rem]' : 'lg:grid-cols-2'}`}>
        {clients &&
          (['guide', 'builder'] as const).map((role) => (
            <GameContext.Provider key={role} value={clients[role]}>
              <div className="clay-card relative min-h-[45vh] overflow-hidden">
                <Pane role={role} />
              </div>
            </GameContext.Provider>
          ))}
        {clients && brain && (
          <GameContext.Provider value={clients.guide}>
            <div className="hidden min-h-0 xl:block [&>div]:!max-h-full [&>div]:!w-full">
              <AgentPanel onClose={() => setBrain(false)} />
            </div>
          </GameContext.Provider>
        )}
      </div>
      <p className="border-t-2 border-line bg-white px-3 py-1.5 text-center text-xs font-semibold text-muted">
        {mode === 'sim'
          ? 'Both partners are live AI agents on the real game server: they only know what their role knows, and only talk through the chat. On Tricky they make the classic learner mistakes on purpose, then repair them.'
          : 'You control both seats. Talk to yourself, or ask a friend to take the other half of the screen.'}
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
