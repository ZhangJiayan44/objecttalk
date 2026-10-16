import { QRCodeSVG } from 'qrcode.react';
import { Bot, Clapperboard, Copy, Sparkles, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { allKinds, INTERESTS, kindsFor } from '@shared/catalog';
import { generatedLevelList, LEVEL_ORDER, LEVELS, levelOf, type LevelMeta } from '@shared/levels';
import type { Mode, ServerInfo } from '@shared/protocol';
import type { Difficulty, InterestId, Role } from '@shared/types';
import { btn } from '@/components/ui';
import { fetchInfo, loadItems, loadLevels, shareUrl } from '@/lib/api';
import { useGame, useGameClient } from '@/lib/game-client';

const DIFFS: Record<string, { id: Difficulty; label: string; desc: string; color: string }[]> = {
  tabletop: [
    { id: 'easy', label: 'Easy', desc: 'Landmarks only, no left/right traps', color: 'bg-mint' },
    { id: 'normal', label: 'Normal', desc: '“your left”, “closer to you”', color: 'bg-sun' },
    { id: 'tricky', label: 'Tricky', desc: 'Perspective traps everywhere', color: 'bg-coral text-white' },
  ],
  order: [
    { id: 'easy', label: 'Easy', desc: 'Two things, one of each', color: 'bg-mint' },
    { id: 'normal', label: 'Normal', desc: 'Numbers and drink sizes', color: 'bg-sun' },
    { id: 'tricky', label: 'Tricky', desc: 'Three lines, forgotten items', color: 'bg-coral text-white' },
  ],
  walknav: [
    { id: 'easy', label: 'Easy', desc: 'The route is drawn on the map', color: 'bg-mint' },
    { id: 'normal', label: 'Normal', desc: 'Read the map yourself', color: 'bg-sun' },
    { id: 'tricky', label: 'Tricky', desc: 'The AI slips into “go north”', color: 'bg-coral text-white' },
  ],
  walksearch: [
    { id: 'easy', label: 'Easy', desc: 'Things lie in the open', color: 'bg-mint' },
    { id: 'normal', label: 'Normal', desc: 'Some are tucked away', color: 'bg-sun' },
    { id: 'tricky', label: 'Tricky', desc: 'Under, inside, on top of…', color: 'bg-coral text-white' },
  ],
};

function LevelCard({ level, active, disabled, onPick }: { level: LevelMeta; active: boolean; disabled: boolean; onPick(): void }) {
  const kinds = level.generated ? kindsFor(level.id) : [];
  return (
    <button
      disabled={disabled}
      onClick={onPick}
      aria-pressed={active}
      className={`clay-sm relative flex flex-col p-3 text-left transition ${active ? `${level.color} -translate-y-0.5` : 'bg-white opacity-80 hover:opacity-100'} disabled:cursor-default`}
    >
      {level.generated && <span className="absolute -top-2.5 right-2 clay-chip bg-grape !px-2 !py-0 !text-[10px] text-white">✨ AI-made</span>}
      <div className="flex items-center gap-2">
        <span className="text-3xl">{level.emoji}</span>
        <div className="min-w-0">
          <div className="truncate font-display text-lg leading-tight font-semibold">{level.title}</div>
          <div className="truncate text-xs font-bold text-ink/70">{level.tagline}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {level.skills.slice(0, 3).map((s) => (
          <span key={s} className="rounded-full border-2 border-ink bg-white/70 px-1.5 text-[11px] font-bold">
            {s}
          </span>
        ))}
      </div>
      {kinds.length > 0 && (
        <div className="mt-2 flex -space-x-1">
          {kinds.slice(0, 6).map((k) => (
            <span key={k.id} className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-ink bg-white text-sm">
              {k.ref ? <img src={k.ref} alt="" className="h-full w-full object-contain" /> : k.emoji}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 text-[11px] font-bold text-ink/60">
        {level.controls === 'walk' ? '🚶 walk around (WASD)' : '🧍 stand & look'} · {level.durationSec}s
      </div>
    </button>
  );
}

export function Lobby() {
  const client = useGameClient();
  const st = useGame((s) => s.state)!;
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [, setVersion] = useState(0);
  useEffect(() => {
    fetchInfo().then(setInfo).catch(() => undefined);
    Promise.all([loadItems().catch(() => undefined), loadLevels().catch(() => undefined)]).then(() => setVersion((v) => v + 1));
  }, []);

  const me = st.players.find((p) => p.id === st.you);
  const host = !!me?.isHost;
  const s = st.settings;
  const level = levelOf(s.level);
  const seat = (r: Role) => st.players.find((p) => p.role === r);
  const sim = s.mode === 'sim';
  const ready = !!seat('guide') && !!seat('builder');
  const joinUrl = shareUrl(info, `/join/${st.code}`);
  const myObjects = allKinds().filter((k) => k.id.startsWith('my-'));
  const generated = generatedLevelList();

  const toggleInterest = (id: InterestId) => {
    const has = s.interests.includes(id);
    const next = has ? s.interests.filter((x) => x !== id) : [...s.interests, id].slice(-3);
    if (next.length) client.actions.updateSettings({ interests: next });
  };

  const start = async () => {
    try {
      await client.actions.start();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const modes: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: 'duo', label: 'Friend', icon: <Users size={16} strokeWidth={3} /> },
    { id: 'ai', label: 'AI partner', icon: <Bot size={16} strokeWidth={3} /> },
    { id: 'sim', label: 'Watch AI vs AI', icon: <Clapperboard size={16} strokeWidth={3} /> },
  ];

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-28 pb-16 lg:grid-cols-[1.3fr_1fr]">
      <section className="clay-card p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Room {st.code}</h1>
            <p className="text-muted">Pick a place, pick your seat. Two different views, one shared goal.</p>
          </div>
          {host && (
            <div className="flex flex-wrap rounded-2xl border-[3px] border-ink bg-cream p-1" role="radiogroup" aria-label="Partner">
              {modes.map((m) => (
                <button key={m.id} className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold ${s.mode === m.id ? 'bg-white shadow-[2px_2px_0_#2d3748]' : 'text-muted'}`} onClick={() => client.actions.updateSettings({ mode: m.id })} aria-pressed={s.mode === m.id}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <h2 className="mb-2 text-xl font-bold">Where are you?</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LEVEL_ORDER.map((id) => (
            <LevelCard key={id} level={LEVELS[id]} active={s.level === id} disabled={!host} onPick={() => client.actions.updateSettings({ level: id })} />
          ))}
        </div>
        {generated.length > 0 && (
          <>
            <h3 className="mt-4 mb-2 flex items-center gap-1.5 text-base font-bold">
              <Sparkles size={16} strokeWidth={3} /> Made by the Scene Agent (Hyper3D Rodin)
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {generated.map((l) => (
                <LevelCard key={l.id} level={l} active={s.level === l.id} disabled={!host} onPick={() => client.actions.updateSettings({ level: l.id })} />
              ))}
            </div>
          </>
        )}

        <h2 className="mt-7 mb-2 text-xl font-bold">{sim ? 'Who watches what' : 'Seats'}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(['guide', 'builder'] as Role[]).map((r) => {
            const p = seat(r);
            const mine = p?.id === st.you || (sim && st.viewAs === r);
            const copy = level.roles[r];
            return (
              <div key={r} className={`clay-sm flex flex-col p-4 ${r === 'guide' ? 'bg-peach' : 'bg-sky'}`}>
                <div className="flex items-center justify-between">
                  <span className="clay-chip bg-white">
                    {copy.icon} {copy.name}
                  </span>
                  {mine && <span className="clay-chip bg-sun !py-0.5 !text-xs">{sim ? 'YOUR VIEW' : 'YOU'}</span>}
                </div>
                <p className="mt-2 flex-1 text-sm font-semibold">
                  Sees {copy.sees}; {copy.does}.
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-white/80 px-3 py-2">
                  <span className="truncate font-display font-semibold">{p ? `${p.isAI ? '🤖 ' : ''}${p.name}${p.connected ? '' : ' (away)'}` : 'Empty seat'}</span>
                  {sim
                    ? st.viewAs !== r && (
                        <button className={btn('white', 'sm')} onClick={() => client.actions.setRole(r)}>
                          Watch this view
                        </button>
                      )
                    : !mine &&
                      (!p || p.isAI || !p.connected) && (
                        <button className={btn('white', 'sm')} onClick={() => client.actions.setRole(r)}>
                          Sit here
                        </button>
                      )}
                </div>
              </div>
            );
          })}
        </div>

        {level.engine === 'tabletop' && !level.generated && (
          <>
            <h2 className="mt-7 mb-2 text-xl font-bold">Your interests → your objects</h2>
            <p className="mb-3 text-sm text-muted">The desk is filled with Rodin-generated 3D objects from what you like (pick up to 3).</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {INTERESTS.map((i) => {
                const on = s.interests.includes(i.id);
                const kind = allKinds().find((k) => k.id === i.kind);
                return (
                  <button key={i.id} disabled={!host} onClick={() => toggleInterest(i.id)} className={`clay-sm flex flex-col items-center p-2 transition ${on ? 'bg-mint' : 'bg-white opacity-70 hover:opacity-100'} disabled:cursor-default`} aria-pressed={on}>
                    <img src={kind?.ref} alt="" className="h-14 w-14 object-contain" />
                    <span className="mt-1 text-sm font-bold">{i.label}</span>
                  </button>
                );
              })}
            </div>
            {myObjects.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 font-bold">✨ My objects (from Object Studio)</h3>
                <div className="flex flex-wrap gap-2">
                  {myObjects.map((k) => {
                    const on = s.customKinds.includes(k.id);
                    return (
                      <button key={k.id} disabled={!host} onClick={() => client.actions.updateSettings({ customKinds: on ? s.customKinds.filter((x) => x !== k.id) : [...s.customKinds, k.id].slice(-2) })} className={`clay-chip ${on ? 'bg-mint' : 'bg-white'}`}>
                        {k.ref && <img src={k.ref} alt="" className="h-6 w-6 rounded object-cover" />} {k.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <h2 className="mt-7 mb-2 text-xl font-bold">Difficulty</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(DIFFS[level.engine] ?? DIFFS.tabletop).map((d) => (
            <button key={d.id} disabled={!host} onClick={() => client.actions.updateSettings({ difficulty: d.id })} className={`clay-sm p-3 text-left ${s.difficulty === d.id ? d.color : 'bg-white'} disabled:cursor-default`} aria-pressed={s.difficulty === d.id}>
              <div className="font-display text-lg font-semibold">{d.label}</div>
              <div className="text-sm font-semibold opacity-80">{d.desc}</div>
            </button>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          {host ? (
            <button className={btn('primary', 'lg')} disabled={!ready} onClick={start}>
              {sim ? 'Start the AI match →' : `Start the ${s.durationSec}s challenge →`}
            </button>
          ) : (
            <span className="clay-chip bg-lavender">Waiting for the host to start…</span>
          )}
          {!ready && <span className="text-sm font-bold text-muted">{s.mode === 'duo' ? 'Invite a friend to the empty seat →' : 'Getting your AI partner ready…'}</span>}
        </div>
      </section>

      <aside className="flex flex-col gap-6">
        {s.mode === 'duo' ? (
          <section className="clay-card bg-sun/40 p-6 text-center">
            <h2 className="text-2xl font-bold">Scan to join</h2>
            <p className="mb-4 text-sm text-muted">Your friend scans this with their phone (same Wi-Fi).</p>
            <div className="mx-auto w-fit rounded-3xl border-[3px] border-ink bg-white p-4 shadow-[6px_6px_0_#2d3748]">
              <QRCodeSVG value={joinUrl} size={196} fgColor="#2d3748" level="M" />
            </div>
            <div className="mt-4 font-display text-5xl font-bold tracking-[0.3em]">{st.code}</div>
            <button className={btn('white', 'sm', 'mt-3')} onClick={() => void navigator.clipboard?.writeText(joinUrl).then(() => toast.success('Link copied!'))}>
              <Copy size={16} strokeWidth={3} /> Copy invite link
            </button>
            <p className="mt-2 text-xs break-all text-muted">{joinUrl}</p>
          </section>
        ) : s.mode === 'ai' ? (
          <section className="clay-card bg-lavender p-6">
            <div className="text-5xl">🤖</div>
            <h2 className="mt-2 text-2xl font-bold">
              {s.aiRole === 'guide' ? `Nova is your ${level.roles.guide.name.toLowerCase()}` : `Pixel is your ${level.roles.builder.name.toLowerCase()}`}
            </h2>
            <p className="mt-2 text-sm font-semibold text-muted">
              The AI partner only knows what its role knows and talks with you in natural English. It answers what you actually ask, asks when you are vague, and on Tricky it makes the classic mistakes on purpose so you practise catching them.
              {info?.features.llm ? ` Its replies come from an LLM agent (${info.features.llmModel ?? 'LLM'}) with grounded game tools: open the AI brain with G.` : ' (Offline rule brain: set LLM_API_KEY for the LLM agent.)'}
            </p>
            {host && (
              <button className={btn('white', 'sm', 'mt-4')} onClick={() => client.actions.updateSettings({ aiRole: s.aiRole === 'guide' ? 'builder' : 'guide' })}>
                Swap: I want to be the {level.roles[s.aiRole].name}
              </button>
            )}
          </section>
        ) : (
          <section className="clay-card bg-mint/60 p-6">
            <div className="text-5xl">🎬</div>
            <h2 className="mt-2 text-2xl font-bold">AI vs AI</h2>
            <p className="mt-2 text-sm font-semibold text-muted">Two AI partners play the level while you watch from one side. Great for a booth screen, or to hear how the conversation should sound before you try it yourself.</p>
          </section>
        )}
        <section className="clay-card p-6">
          <h2 className="text-xl font-bold">
            {level.emoji} {level.title}
          </h2>
          <ol className="mt-3 space-y-2 text-sm font-semibold">
            <li>
              1. {level.roles.guide.icon} The {level.roles.guide.name} sees {level.roles.guide.sees} and {level.roles.guide.does}.
            </li>
            <li>
              2. {level.roles.builder.icon} The {level.roles.builder.name} sees {level.roles.builder.sees} and {level.roles.builder.does}.
            </li>
            <li>3. Talk! Hold Space for the mic. Captions are off: listen, ask, repeat (C shows them).</li>
            <li>4. {level.controls === 'walk' ? 'Click the view, then mouse to look and WASD to walk.' : 'Click the view, then just move the mouse to look around.'}</li>
            <li>5. Afterwards: replay, coach report and your CEFR estimate.</li>
          </ol>
          {level.generated && (
            <p className="mt-3 rounded-xl bg-lavender/60 p-2 text-xs font-bold">
              ✨ Generated from the theme “{level.generated.theme}” by the Scene Agent: {level.generated.agent.generations} Rodin models via {level.generated.agent.backend}. Review: {level.generated.agent.review}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
