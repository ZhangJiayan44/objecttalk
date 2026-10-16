import confetti from 'canvas-confetti';
import { BookOpen, Eye, EyeOff, LogOut, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getKind } from '@shared/catalog';
import { entityLabel } from '@shared/spatial';
import type { Role } from '@shared/types';
import { RoomScene, type Pointer } from '@/components/three/RoomScene';
import { btn, Kbd, Modal, RoleBadge, Tip } from '@/components/ui';
import { serverNow, useGame, useGameClient } from '@/lib/game-client';
import { sfx } from '@/lib/sfx';
import { ChatDock } from './ChatDock';

const PHRASES: { title: string; items: [string, string][] }[] = [
  {
    title: '📍 Point it out',
    items: [
      ['next to the lamp', '在台灯旁边'],
      ['between the plant and the red book', '在植物和红书之间'],
      ['the small one / the big one', '小的那个 / 大的那个'],
      ['the blue mug', '蓝色的杯子'],
    ],
  },
  {
    title: '🔄 Use YOUR partner’s view',
    items: [
      ['on your left / on your right', '在你的左边 / 右边'],
      ['closer to you / farther from you', '离你更近 / 更远'],
      ['on your side of the table', '在你那一侧'],
      ['from where you are standing', '从你站的位置看'],
    ],
  },
  {
    title: '❓ Clarify',
    items: [
      ['Which one do you mean?', '你说的是哪一个？'],
      ['My left or your left?', '我的左边还是你的左边？'],
      ['Is it this one?', '是这个吗？'],
      ['Can you say that again?', '能再说一遍吗？'],
    ],
  },
  {
    title: '✅ Confirm & correct',
    items: [
      ['Yes, that one!', '对，就是那个！'],
      ['No, the other one.', '不，是另一个。'],
      ['Almost! One more to your right.', '差一点！再往你右边一格。'],
      ['Put it back, please.', '请放回去。'],
    ],
  },
];

function Countdown({ endsAt, offset }: { endsAt: number; offset: number }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    const id = setInterval(() => setN(Math.max(0, Math.ceil((endsAt - serverNow(offset)) / 1000))), 100);
    return () => clearInterval(id);
  }, [endsAt, offset]);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-cream/40">
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
    } else if (last.type === 'pick') sfx.pop();
    else if (last.type === 'place') sfx.place();
    else if (last.type === 'timeup') setShown({ key: last.key, text: "Time's up!", good: false });
    else if (last.type === 'mission') setShown({ key: last.key, text: last.message ?? 'Next!', good: true });
  }, [last]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 1300);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[28%] z-50 flex justify-center">
      <div key={shown.key} className={`clay-card animate-pop px-8 py-4 font-display text-3xl font-bold ${shown.good ? 'bg-mint' : 'bg-coral text-white'}`}>
        {shown.text}
      </div>
    </div>
  );
}

function MissionCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mission = useGame((s) => s.state?.mission);
  const role = useGame((s) => s.state?.yourRole);
  const scene = useGame((s) => s.state?.scene);
  const spectator = useGame((s) => s.state?.spectator);
  const [reveal, setReveal] = useState(false);
  useEffect(() => setReveal(false), [mission?.id]);
  if (!mission || !open) return null;
  const secretId = mission.targetId ?? mission.itemId;
  const obj = secretId ? scene?.objects.find((o) => o.id === secretId) : undefined;
  const kind = obj ? getKind(obj.kind) : undefined;
  const isGuide = role === 'guide' || spectator;
  return (
    <div className="clay-card w-full max-w-sm animate-pop bg-white/95 p-4 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`clay-chip !py-0.5 ${mission.type === 'find' ? 'bg-sun' : 'bg-lavender'}`}>
          {mission.type === 'find' ? '🔎 Find it' : '📦 Place it'} · {mission.index + 1}
        </span>
        <button onClick={onClose} className="rounded-lg px-1 text-xs font-bold text-muted hover:text-ink" aria-label="Hide mission card">
          <span className="hidden sm:inline">
            <Kbd>E</Kbd>{' '}
          </span>
          hide ✕
        </button>
      </div>
      <p className="text-sm font-semibold">{mission.brief}</p>
      {isGuide && obj && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-ink bg-cream p-2">
          {kind?.ref ? <img src={kind.ref} alt="" className="h-12 w-12 object-contain" /> : <span className="text-3xl">{kind?.emoji ?? '☕'}</span>}
          <div className="text-sm">
            <div className="font-display text-base font-semibold">
              Target: {obj.size !== 'regular' ? `${obj.size} ` : ''}
              {kind?.colorVariants ? `${obj.color} ` : ''}
              {kind?.name}
            </div>
            <div className="text-muted">{mission.type === 'find' ? 'Gold ring = the one to pick.' : 'Purple ring = move this. Ghost = where it goes.'}</div>
          </div>
        </div>
      )}
      {isGuide && mission.hint && <p className="mt-3 rounded-xl bg-sky/40 p-2 text-sm font-semibold">💡 {mission.hint}</p>}
      {isGuide && mission.modelAnswer && (
        <button onClick={() => setReveal((r) => !r)} className="mt-2 text-sm font-bold text-grape underline decoration-2 underline-offset-2">
          {reveal ? `“${mission.modelAnswer}”` : 'Stuck? Show a model sentence'}
        </button>
      )}
      {role === 'builder' && (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          <li>• Your guide stands on the other side: their left is your right!</li>
          <li>• Not sure? Ask before you click: “Which one?”</li>
          <li>• {mission.type === 'find' ? 'Click the object to pick it.' : 'Click the object, then click a spot.'}</li>
        </ul>
      )}
    </div>
  );
}

export function GameView({ embedded = false, tts = true, pttKey = true, title }: { embedded?: boolean; tts?: boolean; pttKey?: boolean; title?: string }) {
  const client = useGameClient();
  const navigate = useNavigate();
  const st = useGame((s) => s.state);
  const offset = useGame((s) => s.clockOffset);
  const remoteHover = useGame((s) => s.remoteHover);
  const fx = useGame((s) => s.fx);
  const [hover, setHover] = useState<Pointer | null>(null);
  const [cardOpen, setCardOpen] = useState(() => !embedded && (typeof window === 'undefined' || window.innerWidth >= 640));
  const [phrases, setPhrases] = useState(false);
  const [labels, setLabels] = useState(true);
  const [muted, setMuted] = useState(sfx.muted);

  const role: Role | null = st?.yourRole ?? null;
  const isBuilder = role === 'builder' && st?.phase === 'playing';
  const lastWrong = useMemo(() => [...fx].reverse().find((f) => f.type === 'wrong'), [fx]);

  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'e' || e.key === 'E') setCardOpen((o) => !o);
      if (e.key === 'Tab') {
        e.preventDefault();
        setPhrases((o) => !o);
      }
      if (e.key === 'Escape' && st?.held) client.actions.drop();
      if (e.key === 'l' || e.key === 'L') setLabels((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client, st?.held, embedded]);

  useEffect(() => setHover(null), [st?.mission?.id, st?.held?.objectId]);

  if (!st?.scene) return null;
  const secretId = st.mission?.targetId ?? st.mission?.itemId;
  const secretObj = secretId ? st.scene.objects.find((o) => o.id === secretId) : undefined;
  const secretLabel = secretObj ? entityLabel({ ...secretObj, landmark: false }) : null;
  const names = Object.fromEntries(st.players.filter((p) => p.role).map((p) => [p.role, p.name])) as Partial<Record<Role, string>>;
  const target = st.mission && (st.mission.targetId || st.mission.itemId) ? { findId: st.mission.targetId, itemId: st.mission.itemId, cell: st.mission.targetCell } : null;
  const onHover = (p: Pointer) => {
    setHover(p);
    client.actions.hover(p);
  };

  return (
    <div className={`relative h-full w-full overflow-hidden ${role === 'guide' ? 'bg-gradient-to-b from-[#fff1ec] to-[#ffe2d9]' : 'bg-gradient-to-b from-[#eef8fc] to-[#d9eef6]'}`}>
      <RoomScene
        className="!absolute inset-0"
        scene={st.scene}
        view={role ?? 'overview'}
        heldId={st.held?.objectId ?? null}
        target={target}
        pointer={remoteHover}
        localHover={hover}
        interactive={isBuilder}
        onHover={onHover}
        onPick={(id) => client.actions.pick(id)}
        onPlace={(cell) => client.actions.place(cell)}
        onDrop={() => client.actions.drop()}
        wrong={lastWrong ? { objectId: lastWrong.objectId, key: lastWrong.key } : null}
        names={names}
        labels={labels}
      />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-nowrap items-start justify-between gap-1.5 p-2 sm:gap-2 sm:p-3">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          {title && <span className="clay-chip bg-white">{title}</span>}
          {role ? <RoleBadge role={role} compact className="!px-2.5 sm:!px-4" /> : <span className="clay-chip bg-lavender">👀 Spectating</span>}
          {!embedded && <span className="clay-chip hidden bg-white font-display tracking-widest md:inline-flex">#{st.code}</span>}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Timer endsAt={st.endsAt} offset={offset} />
          <div className="clay-chip bg-white !gap-1.5" aria-label="Missions">
            {Array.from({ length: st.missionsTotal }).map((_, i) => (
              <span
                key={i}
                className={`h-4 w-4 rounded-full border-2 border-ink ${st.completed.includes(i) ? 'bg-cta' : st.mission?.index === i ? 'animate-pulse bg-sun' : 'bg-line'}`}
              />
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <Tip label={<span>Phrasebook <Kbd>Tab</Kbd></span>}>
            <button className={btn('white', 'sm', '!px-2.5')} onClick={() => setPhrases(true)} aria-label="Phrasebook">
              <BookOpen size={18} strokeWidth={3} />
            </button>
          </Tip>
          <Tip label={<span>Object labels <Kbd>L</Kbd></span>}>
            <button className={btn('white', 'sm', 'hidden !px-2.5 sm:inline-flex')} onClick={() => setLabels((v) => !v)} aria-label="Toggle labels">
              {labels ? <Eye size={18} strokeWidth={3} /> : <EyeOff size={18} strokeWidth={3} />}
            </button>
          </Tip>
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

      <div className="pointer-events-none absolute top-14 left-2 z-20 max-h-[45%] w-[min(24rem,calc(100%-1rem))] overflow-y-auto sm:top-16 sm:left-3 sm:max-h-none">
        <div className="pointer-events-auto">
          <MissionCard open={cardOpen} onClose={() => setCardOpen(false)} />
          {!cardOpen && st.mission && (
            <button className={btn(st.mission.type === 'find' ? 'sun' : 'white', 'sm')} onClick={() => setCardOpen(true)}>
              {st.mission.type === 'find' ? '🔎 Find it' : '📦 Place it'} · {st.mission.index + 1}
              {secretLabel && <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs">🎯 {secretLabel}</span>}
              <span className="hidden sm:inline">
                <Kbd>E</Kbd>
              </span>
            </button>
          )}
        </div>
      </div>

      <FeedbackBurst />
      {st.phase === 'countdown' && st.countdownEndsAt && <Countdown endsAt={st.countdownEndsAt} offset={offset} />}

      {/* Bottom: chat dock + builder controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-stretch gap-2 p-2 sm:flex-row sm:items-end sm:justify-between sm:p-3">
        <div className="pointer-events-auto w-full sm:max-w-md">
          <ChatDock compact={embedded} tts={tts} pttKey={pttKey} />
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {isBuilder && st.held && (
            <button className={btn('peach', 'sm')} onClick={() => client.actions.drop()}>
              Put it back <Kbd>Esc</Kbd>
            </button>
          )}
          {!embedded && (
            <div className="clay-chip hidden bg-white !font-semibold text-muted lg:flex">
              <Kbd>Space</Kbd> talk · <Kbd>E</Kbd> mission · <Kbd>Tab</Kbd> phrases · drag to look around
            </div>
          )}
        </div>
      </div>

      <Modal open={phrases} onOpenChange={setPhrases} title="Phrasebook" description="Clear spatial English. Your partner faces you, so always say whose side!" wide>
        <div className="grid gap-4 sm:grid-cols-2">
          {PHRASES.map((g) => (
            <div key={g.title} className="rounded-2xl border-[3px] border-ink bg-cream p-3">
              <h3 className="mb-2 font-display text-lg font-semibold">{g.title}</h3>
              <ul className="space-y-1.5">
                {g.items.map(([en, zh]) => (
                  <li key={en}>
                    <button
                      className="w-full rounded-xl px-2 py-1 text-left hover:bg-sun/60"
                      onClick={() => {
                        client.actions.say(en, 'quick');
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
        <p className="mt-4 text-sm text-muted">Tip: click a phrase to send it to your partner.</p>
      </Modal>
    </div>
  );
}
