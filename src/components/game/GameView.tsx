import confetti from 'canvas-confetti';
import { BookOpen, BrainCircuit, Eye, EyeOff, Headphones, LogOut, ShoppingBag, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { START_POSE } from '@shared/bedroom';
import { levelOf, sceneOf, type LevelMeta } from '@shared/levels';
import type { HoverEvent, Pose, ServerInfo } from '@shared/protocol';
import type { Role } from '@shared/types';
import { BedroomScene } from '@/components/three/BedroomScene';
import { CafeScene } from '@/components/three/CafeScene';
import { CityScene } from '@/components/three/CityScene';
import { MarketMenu, NightMarketScene } from '@/components/three/NightMarketScene';
import { atMeeting, closestShop, MARKET_SHOPS, MARKET_START } from '@shared/nightmarket';
import { getKind } from '@shared/catalog';
import { lineText } from '@shared/cafe';
import { input } from '@/components/three/controls';
import { RoomScene, type Pointer } from '@/components/three/RoomScene';
import { btn, Kbd, Modal, Tip } from '@/components/ui';
import { fetchInfo } from '@/lib/api';
import { serverNow, useGame, useGameClient } from '@/lib/game-client';
import { sfx } from '@/lib/sfx';
import { useVoiceLink } from '@/lib/voice';
import { AgentPanel } from './AgentPanel';
import { MissionCard, missionChip } from './MissionCard';
import { Lifeline } from './Lifeline';
import { Transcript, useCommsPrefs, VoiceBar } from './VoiceBar';

/** Which place surrounds the shop counter. */
export const orderLook = (level: LevelMeta): 'cafe' | 'market' | 'night' => {
  const s = sceneOf(level);
  return s === 'night' ? 'night' : s === 'market' ? 'market' : 'cafe';
};

function Countdown({ endsAt, offset }: { endsAt: number; offset: number }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(0, Math.ceil((endsAt - serverNow(offset)) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt, offset]);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-cream/60 backdrop-blur-sm">
      <div key={n} className="clay-card animate-pop bg-sun px-14 py-8 font-display text-8xl font-bold">{n || 'Go!'}</div>
    </div>
  );
}

function Timer({ endsAt, offset }: { endsAt: number | null; offset: number }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) return;
    let last = -1;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((endsAt - serverNow(offset)) / 1000));
      if (s !== last && s <= 10 && s > 0) sfx.tick();
      last = s;
      setLeft(s);
    }, 200);
    return () => clearInterval(id);
  }, [endsAt, offset]);
  const urgent = left <= 15;
  return (
    <div className={`clay-chip !px-3 !py-1 font-display text-xl tabular-nums sm:!px-4 sm:text-2xl ${urgent ? 'animate-pulse bg-coral text-white' : 'bg-white'}`} aria-label="Time left">
      ⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
    </div>
  );
}

function FeedbackBurst() {
  const fx = useGame((s) => s.fx);
  const [shown, setShown] = useState<{ key: number; text: string; good: boolean } | null>(null);
  const last = fx[fx.length - 1];
  useEffect(() => {
    if (!last) return;
    if (last.type === 'wrong') {
      sfx.wrong();
      setShown({ key: last.key, text: last.message ?? 'Not that one!', good: false });
    } else if (last.type === 'success' || last.type === 'complete') {
      sfx.success();
      setShown({ key: last.key, text: last.message ?? 'Nice!', good: true });
      void confetti({ particleCount: 90, spread: 75, origin: { y: 0.55 }, colors: ['#22c55e', '#ffd166', '#fdbcb4', '#add8e6', '#9b7bf2'] });
    } else if (last.type === 'pick' || last.type === 'tray' || last.type === 'reveal') sfx.pop();
    else if (last.type === 'place') sfx.place();
    else if (last.type === 'timeup') setShown({ key: last.key, text: "Time's up!", good: false });
    else if (last.type === 'mission') setShown({ key: last.key, text: last.message ?? 'Next!', good: true });
  }, [last]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 1400);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[24%] z-50 flex justify-center px-4">
      <div key={shown.key} className={`clay-card max-w-xl animate-pop px-8 py-4 text-center font-display text-3xl font-bold ${shown.good ? 'bg-mint' : 'bg-coral text-white'}`}>
        {shown.text}
      </div>
    </div>
  );
}

/** Centre crosshair while the mouse is captured, and a "click to look around" hint while it is not. */
function AimOverlay({ locked, walk, hint }: { locked: boolean; walk: boolean; hint: string }) {
  if (locked)
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="relative h-7 w-7">
          <div className="absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_2px_#2d3748]" />
          <div className="absolute top-0 left-1/2 h-full w-[3px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_2px_#2d3748]" />
          <div className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-sun" />
        </div>
      </div>
    );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[42%] z-10 hidden justify-center md:flex">
      <div className="clay-chip animate-pulse bg-white/90 !text-base">
        🖱️ Click the view to look around{walk ? ' · then WASD to walk' : ''} · <Kbd>Esc</Kbd> frees the mouse · {hint}
      </div>
    </div>
  );
}

/** On-screen joystick for walking on touch screens. */
function Joystick() {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const R = 46;
  const update = (cx: number, cy: number) => {
    const o = origin.current;
    if (!o) return;
    let dx = cx - o.x;
    let dy = cy - o.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    input.joystick = { x: dx / R, y: dy / R };
  };
  const end = () => {
    origin.current = null;
    setKnob({ x: 0, y: 0 });
    input.joystick = { x: 0, y: 0 };
  };
  return (
    <div
      className="pointer-events-auto absolute bottom-28 left-5 z-30 flex h-32 w-32 touch-none items-center justify-center rounded-full border-[3px] border-ink bg-white/60 backdrop-blur md:hidden"
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => origin.current?.id === e.pointerId && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="h-14 w-14 rounded-full border-[3px] border-ink bg-sun shadow-[2px_2px_0_#2d3748]" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

export function GameView({ embedded = false, tts = true, pttKey = true, title, viewOverride }: { embedded?: boolean; tts?: boolean; pttKey?: boolean; title?: string; viewOverride?: Role }) {
  const client = useGameClient();
  const navigate = useNavigate();
  const st = useGame((s) => s.state);
  const offset = useGame((s) => s.clockOffset);
  const remoteHover = useGame((s) => s.remoteHover);
  const remotePose = useGame((s) => s.remotePose);
  const fx = useGame((s) => s.fx);
  const prefs = useCommsPrefs();
  const [hover, setHover] = useState<Pointer | null>(null);
  const [cardOpen, setCardOpen] = useState(() => !embedded && (typeof window === 'undefined' || window.innerWidth >= 640));
  const [phrases, setPhrases] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [labels, setLabels] = useState(true);
  const [muted, setMuted] = useState(sfx.muted);
  const [voiceOn, setVoiceOn] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ice, setIce] = useState<ServerInfo['iceServers']>([]);
  const [localPose, setLocalPose] = useState<Pose | null>(null);
  const [marketShop, setMarketShop] = useState<string | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const lastPoseAt = useRef(0);
  const partner = st?.players.find((p) => p.role && p.role !== st.yourRole && !p.isAI && p.connected) ?? null;
  const voice = useVoiceLink(client, voiceOn && !!partner && !embedded, partner?.id ?? null, ice);
  useEffect(() => {
    if (!embedded) fetchInfo().then((i) => setIce(i.iceServers)).catch(() => undefined);
  }, [embedded]);
  useEffect(() => {
    if (voice.error) toast.error(voice.error);
  }, [voice.error]);

  const level = levelOf(st?.settings.level);
  const role: Role | null = st?.yourRole ?? null;
  const view: Role | 'overview' = viewOverride ?? role ?? st?.viewAs ?? 'overview';
  const playing = st?.phase === 'playing';
  const interactive = !!role && playing && !embedded;
  const isBuilder = role === 'builder' && playing;
  const lastWrong = useMemo(() => [...fx].reverse().find((f) => f.type === 'wrong'), [fx]);
  const walkLevel = level.controls === 'walk' && view === 'builder';

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'e' || e.key === 'E') setCardOpen((o) => !o);
      if (e.key === 'g' || e.key === 'G') setAgentOpen((o) => !o);
      if (e.key === 'Tab') {
        e.preventDefault();
        if (document.pointerLockElement) document.exitPointerLock();
        setPhrases((o) => !o);
      }
      if (e.key === 'Escape' && st?.held) client.actions.drop();
      if (e.key === 'l' || e.key === 'L') setLabels((v) => !v);
      if ((e.key === 'f' || e.key === 'F') && isBuilder && level.engine === 'order') client.actions.serve();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client, st?.held, embedded, isBuilder, level.engine]);

  useEffect(() => setHover(null), [st?.mission?.id, st?.held?.objectId]);
  useEffect(() => { setMarketShop(null); setLocalPose(null); }, [st?.code, st?.startedAt]);
  useEffect(() => { if (!playing) setMarketShop(null); }, [playing]);
  const openMarket = useCallback((id: string) => {
    if (document.pointerLockElement) document.exitPointerLock();
    setMarketShop(id);
  }, []);

  const onMove = useCallback(
    (p: Pose) => {
      client.actions.move(p);
      const now = performance.now();
      if (now - lastPoseAt.current > 110) {
        lastPoseAt.current = now;
        setLocalPose(p);
      }
    },
    [client],
  );
  const onHover = useCallback(
    (p: HoverEvent) => {
      setHover(p);
      client.actions.hover(p);
    },
    [client],
  );

  if (!st) return null;
  const names = Object.fromEntries(st.players.filter((p) => p.role).map((p) => [p.role, p.name])) as Partial<Record<Role, string>>;
  const world = st.world;
  const sharedPose = remotePose ?? (world?.kind === 'cafe' ? world.market?.pose ?? null : world && 'pose' in world ? world.pose : null);
  // The walker predicts their own pose; everyone else follows the stream.
  const pose: Pose | null = view === 'builder' && interactive ? (localPose ?? sharedPose) : sharedPose;
  const missionKey = st.mission?.id;

  let sceneEl: React.ReactNode = null;
  if (level.engine === 'tabletop' && st.scene) {
    const target = view === 'guide' && st.mission && (st.mission.targetId || st.mission.itemId) ? { findId: st.mission.targetId, itemId: st.mission.itemId, cell: st.mission.targetCell } : null;
    sceneEl = (
      <RoomScene
        className="!absolute inset-0"
        scene={st.scene}
        view={view}
        heldId={st.held?.objectId ?? null}
        target={target}
        pointer={remoteHover}
        localHover={hover}
        interactive={isBuilder && !embedded}
        onHover={onHover}
        onPick={(id) => client.actions.pick(id)}
        onPlace={(cell) => client.actions.place(cell)}
        onDrop={() => client.actions.drop()}
        wrong={lastWrong ? { objectId: lastWrong.objectId, key: lastWrong.key } : null}
        names={names}
        labels={labels}
        firstPerson={view !== 'overview'}
        capture={interactive}
        missionKey={missionKey}
        onLockChange={setLocked}
        palette={level.generated?.palette}
        sign={level.generated?.sign}
        set={sceneOf(level) === 'petshop' ? 'petshop' : 'study'}
      />
    );
  } else if (level.engine === 'order' && st.scene && world?.kind === 'cafe') {
    sceneEl = level.id === 'nightmarket' ? <NightMarketScene className="!absolute inset-0" scene={st.scene} tray={world.tray} pose={pose ?? MARKET_START} view={view} interactive={isBuilder && !embedded} capture={interactive} paused={!!marketShop || bagOpen} onMove={onMove} onShop={openMarket} onServe={() => client.actions.serve()} onLockChange={setLocked} shopperName={names.builder} /> : (
      <CafeScene
        className="!absolute inset-0"
        scene={st.scene}
        tray={world.tray}
        view={view}
        interactive={isBuilder && !embedded}
        capture={interactive}
        pointer={isBuilder ? hover : remoteHover}
        onHover={onHover}
        onTray={(id, add) => client.actions.tray(id, add)}
        onServe={() => client.actions.serve()}
        names={names}
        missionKey={missionKey}
        shakeId={lastWrong ? { id: lastWrong.objectId, key: lastWrong.key } : null}
        onLockChange={setLocked}
        level={st.settings.level}
        palette={level.generated?.palette}
        sign={level.generated?.sign ?? (level.id === 'nightmarket' ? 'Lantern Street Night Market' : undefined)}
        look={orderLook(level)}
      />
    );
  } else if (level.engine === 'walknav' && world?.kind === 'city' && pose) {
    sceneEl = (
      <CityScene
        className="!absolute inset-0"
        town={world.town}
        pose={pose}
        view={view}
        interactive={isBuilder && !embedded}
        destination={st.mission?.destination ?? null}
        showRoute={view === 'guide' && st.settings.difficulty === 'easy'}
        walkerName={names.builder}
        onMove={onMove}
        onLockChange={setLocked}
      />
    );
  } else if (level.engine === 'walksearch' && world?.kind === 'bedroom') {
    sceneEl = (
      <BedroomScene
        className="!absolute inset-0"
        items={world.items}
        found={world.found}
        open={world.open}
        pose={pose ?? START_POSE}
        view={view}
        interactive={isBuilder && !embedded}
        targetId={view === 'guide' ? (st.mission?.targetId ?? null) : null}
        names={names}
        onMove={onMove}
        onPick={(id) => client.actions.pick(id)}
        onOpen={(id, open) => client.actions.open(id, open)}
        onLockChange={setLocked}
      />
    );
  }

  const copy = role && !viewOverride ? level.roles[role] : null;
  const capturing = interactive && (view === 'builder' || level.guideView === 'stand');
  const keyHint = level.id === 'nightmarket' ? 'B = shop · F = deliver at gate' : level.engine === 'order' ? 'F = serve' : level.engine === 'tabletop' ? 'click = pick / place' : level.engine === 'walksearch' ? 'click = pick up / open' : 'find the door';
  const nearbyShop = level.id === 'nightmarket' && pose ? closestShop(pose) : undefined;
  const marketWorld = world?.kind === 'cafe' && !!world.market;

  return (
    <div className="relative h-full w-full overflow-hidden bg-cream">
      {sceneEl}
      {!sceneEl && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#fff1ec] to-[#e6e6fa]">
          <div className="clay-chip animate-pulse bg-white font-display text-lg">
            {level.emoji} {level.title}
          </div>
        </div>
      )}
      {capturing && sceneEl && <AimOverlay locked={locked} walk={walkLevel} hint={keyHint} />}
      {interactive && walkLevel && <Joystick />}
      {marketWorld && isBuilder && !embedded && (
        <div className="absolute right-3 bottom-52 z-30 flex flex-col items-end gap-2 sm:top-16 sm:bottom-auto">
          <Tip label="Shopping bag"><button className={btn('white', 'sm')} aria-label="Shopping bag" onClick={() => { if (document.pointerLockElement) document.exitPointerLock(); setBagOpen(true); }}><ShoppingBag size={18} /> {world.tray.length}/6</button></Tip>
          {nearbyShop && <button className={btn('sun', 'sm', 'max-w-56 !whitespace-normal text-right')} onClick={() => openMarket(nearbyShop.id)}><ShoppingBag size={16} className="shrink-0" />{nearbyShop.zh}<Kbd>B</Kbd></button>}
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-nowrap items-start justify-between gap-1.5 p-2 sm:gap-2 sm:p-3">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          {title && <span className="clay-chip bg-white">{title}</span>}
          {copy ? (
            <span className={`clay-chip ${role === 'guide' ? 'bg-peach' : 'bg-sky'}`}>
              {copy.icon} <span className="hidden sm:inline">{copy.name}</span>
            </span>
          ) : (
            <span className="clay-chip bg-lavender">👀 {view !== 'overview' ? `${level.roles[view].name}'s view` : 'Watching'}</span>
          )}
          {!embedded && (
            <span className="clay-chip hidden bg-white md:inline-flex">
              {level.emoji} {level.title}
            </span>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Timer endsAt={st.endsAt} offset={offset} />
          <div className="clay-chip bg-white !gap-1.5" aria-label="Missions">
            {Array.from({ length: st.missionsTotal }).map((_, i) => (
              <span key={i} className={`h-4 w-4 rounded-full border-2 border-ink ${st.completed.includes(i) ? 'bg-cta' : st.mission?.index === i ? 'animate-pulse bg-sun' : 'bg-line'}`} />
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Tip label={<span>Phrasebook <Kbd>Tab</Kbd></span>}>
            <button className={btn('white', 'sm', '!px-2.5')} onClick={() => setPhrases(true)} aria-label="Phrasebook">
              <BookOpen size={18} strokeWidth={3} />
            </button>
          </Tip>
          <Tip label={<span>AI partner brain <Kbd>G</Kbd></span>}>
            <button className={btn(agentOpen ? 'grape' : 'white', 'sm', 'hidden !px-2.5 sm:inline-flex')} onClick={() => setAgentOpen((o) => !o)} aria-label="Agent panel" aria-pressed={agentOpen}>
              <BrainCircuit size={18} strokeWidth={3} />
            </button>
          </Tip>
          {!embedded && partner && (
            <Tip label={voiceOn ? `Voice link: ${voice.status}. Click to hang up` : 'Talk to your partner over the internet (both click this)'}>
              <button className={btn(voice.status === 'live' ? 'primary' : voiceOn ? 'sun' : 'white', 'sm', '!px-2.5')} onClick={() => setVoiceOn((v) => !v)} aria-label="Voice link" aria-pressed={voiceOn}>
                <Headphones size={18} strokeWidth={3} />
              </button>
            </Tip>
          )}
          {level.engine === 'tabletop' && (
            <Tip label={<span>Object labels <Kbd>L</Kbd></span>}>
              <button className={btn('white', 'sm', 'hidden !px-2.5 sm:inline-flex')} onClick={() => setLabels((v) => !v)} aria-label="Toggle labels">
                {labels ? <Eye size={18} strokeWidth={3} /> : <EyeOff size={18} strokeWidth={3} />}
              </button>
            </Tip>
          )}
          <Tip label="Sound effects">
            <button
              className={btn('white', 'sm', 'hidden !px-2.5 sm:inline-flex')}
              aria-label="Toggle sound"
              onClick={() => {
                sfx.setMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? <VolumeX size={18} strokeWidth={3} /> : <Volume2 size={18} strokeWidth={3} />}
            </button>
          </Tip>
          {!embedded && (
            <Tip label="Leave room">
              <button
                className={btn('white', 'sm', '!px-2.5')}
                aria-label="Leave"
                onClick={() => {
                  client.actions.leave();
                  navigate('/play');
                }}
              >
                <LogOut size={18} strokeWidth={3} />
              </button>
            </Tip>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute top-14 left-2 z-20 max-h-[45%] w-[min(24rem,calc(100%-1rem))] overflow-y-auto sm:top-16 sm:left-3 sm:max-h-[calc(100%-12rem)]">
        <div className="pointer-events-auto">
          {cardOpen && <MissionCard st={st} pose={pose} view={view === 'overview' ? 'guide' : view} onClose={() => setCardOpen(false)} />}
          {!cardOpen && st.mission && (
            <button className={btn('sun', 'sm')} onClick={() => setCardOpen(true)}>
              {missionChip(st)}
              <span className="hidden sm:inline">
                <Kbd>E</Kbd>
              </span>
            </button>
          )}
        </div>
      </div>

      {agentOpen && (
        <div className="pointer-events-auto absolute top-14 right-2 z-30 sm:top-16 sm:right-3">
          <AgentPanel onClose={() => setAgentOpen(false)} />
        </div>
      )}

      <FeedbackBurst />
      {st.phase === 'countdown' && st.countdownEndsAt && <Countdown endsAt={st.countdownEndsAt} offset={offset} />}

      {/* Bottom: transcript (left, hidden by default) + voice-first comms bar (centre) */}
      {prefs.transcript && (
        <div className="pointer-events-auto absolute bottom-24 left-2 z-20 w-[min(24rem,calc(100%-1rem))] sm:left-3">
          <Transcript onClose={() => prefs.setTranscript(false)} compact={embedded} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-2 sm:p-3">
        {isBuilder && st.held && (
          <button className={btn('peach', 'sm', 'pointer-events-auto')} onClick={() => client.actions.drop()}>
            Put it back <Kbd>Esc</Kbd>
          </button>
        )}
        {isBuilder && level.engine === 'order' && world?.kind === 'cafe' && world.tray.length > 0 && (
          <button className={btn('sun', 'sm', 'pointer-events-auto')} disabled={marketWorld && !atMeeting(pose ?? MARKET_START)} onClick={() => client.actions.serve()}>
            {marketWorld ? 'Deliver shopping bag' : '🔔 Serve the tray'} <Kbd>F</Kbd>
          </button>
        )}
        {!embedded && <Lifeline hotkey={pttKey} />}
        <VoiceBar prefs={prefs} compact={embedded} pttKey={pttKey && !embedded} tts={tts} liveVoice={voice.status === 'live'} />
        {!embedded && (
          <div className="hidden text-xs font-bold text-ink/70 lg:block">
            <Kbd>Space</Kbd> talk · <Kbd>H</Kbd> 中文求助 · <Kbd>Enter</Kbd> type · <Kbd>C</Kbd> captions · <Kbd>T</Kbd> transcript · <Kbd>1</Kbd>-<Kbd>6</Kbd> phrases · <Kbd>E</Kbd> mission · <Kbd>Tab</Kbd> phrasebook · <Kbd>G</Kbd> AI brain
          </div>
        )}
      </div>

      {marketWorld && st.scene && world?.kind === 'cafe' && <>
        <Modal open={!!marketShop} onOpenChange={(open) => { if (!open) setMarketShop(null); }} title={MARKET_SHOPS.find((s) => s.id === marketShop)?.name ?? 'Shop'} description={MARKET_SHOPS.find((s) => s.id === marketShop)?.zh ?? ''}>
          {marketShop && <MarketMenu shopId={marketShop} scene={st.scene} tray={world.tray} onBuy={(id) => client.actions.tray(id, true)} />}
        </Modal>
        <Modal open={bagOpen} onOpenChange={setBagOpen} title="Shopping bag" description={`${world.tray.length}/6`}>
          {world.tray.length ? <ul className="divide-y-2 divide-line">{world.tray.map((id) => {
            const o = st.scene!.objects.find((x) => x.id === id);
            if (!o) return null;
            return <li key={id} className="flex items-center justify-between gap-3 py-3"><span className="font-semibold">{getKind(o.kind)?.emoji} {lineText({ kind: o.kind, qty: 1, size: o.size === 'regular' ? null : o.size })}</span><Tip label="Return item"><button className={btn('white', 'sm', '!px-2')} aria-label={`Return ${getKind(o.kind)?.name}`} onClick={() => client.actions.tray(id, false)}><X size={16} /></button></Tip></li>;
          })}</ul> : <p className="py-4 text-sm text-muted">Your shopping bag is empty.</p>}
        </Modal>
      </>}
      <Modal open={phrases} onOpenChange={setPhrases} title={`Phrasebook · ${level.title}`} description={`${level.tagline}. Click a phrase to send it, or better: say it out loud!`} wide>
        <div className="grid gap-4 sm:grid-cols-2">
          {level.phrases.map((g) => (
            <div key={g.title} className="rounded-2xl border-[3px] border-ink bg-cream p-3">
              <h3 className="mb-2 font-display text-lg font-semibold">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.items.map(([en, zh]) => (
                  <li key={en}>
                    <button
                      className="w-full rounded-xl px-2 py-1 text-left hover:bg-sun/60"
                      onClick={() => {
                        if (role) client.actions.say(en, 'quick');
                        setPhrases(false);
                      }}
                    >
                      <span className="font-bold">{en}</span> <span className="text-sm text-muted">{zh}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
