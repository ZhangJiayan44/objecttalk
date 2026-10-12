import { QRCodeSVG } from 'qrcode.react';
import { Bot, Copy, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { allKinds, INTERESTS } from '@shared/catalog';
import type { ServerInfo } from '@shared/protocol';
import type { Difficulty, InterestId, Role } from '@shared/types';
import { btn, RoleBadge } from '@/components/ui';
import { fetchInfo, loadItems, shareUrl } from '@/lib/api';
import { useGame, useGameClient } from '@/lib/game-client';

const DIFFS: { id: Difficulty; label: string; desc: string; color: string }[] = [
  { id: 'easy', label: 'Easy', desc: 'Landmarks only, no left/right traps', color: 'bg-mint' },
  { id: 'normal', label: 'Normal', desc: '“your left”, “closer to you”', color: 'bg-sun' },
  { id: 'tricky', label: 'Tricky', desc: 'Perspective traps everywhere', color: 'bg-coral text-white' },
];

const SEAT_INFO: Record<Role, { title: string; desc: string; color: string }> = {
  guide: { title: 'Guide', desc: 'Sees the target and the goal. Can’t touch anything. Explains in English.', color: 'bg-peach' },
  builder: { title: 'Builder', desc: 'Moves the objects. Can’t see the goal. Listens, asks, acts.', color: 'bg-sky' },
};

export function Lobby() {
  const client = useGameClient();
  const st = useGame((s) => s.state)!;
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [, setVersion] = useState(0);
  useEffect(() => {
    fetchInfo().then(setInfo).catch(() => undefined);
    loadItems()
      .then(() => setVersion((v) => v + 1))
      .catch(() => undefined);
  }, []);

  const me = st.players.find((p) => p.id === st.you);
  const host = !!me?.isHost;
  const s = st.settings;
  const seat = (r: Role) => st.players.find((p) => p.role === r);
  const ready = !!seat('guide') && !!seat('builder');
  const joinUrl = shareUrl(info, `/join/${st.code}`);
  const myObjects = allKinds().filter((k) => k.id.startsWith('my-'));

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

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-28 pb-16 lg:grid-cols-[1.25fr_1fr]">
      <section className="clay-card p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Room {st.code}</h1>
            <p className="text-muted">Pick your seat. Two different views, one shared goal.</p>
          </div>
          {host && (
            <div className="flex rounded-2xl border-[3px] border-ink bg-cream p-1" role="radiogroup" aria-label="Partner">
              <button className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold ${s.mode === 'duo' ? 'bg-white shadow-[2px_2px_0_#2d3748]' : 'text-muted'}`} onClick={() => client.actions.updateSettings({ mode: 'duo' })}>
                <Users size={16} strokeWidth={3} /> Friend
              </button>
              <button className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold ${s.mode === 'ai' ? 'bg-white shadow-[2px_2px_0_#2d3748]' : 'text-muted'}`} onClick={() => client.actions.updateSettings({ mode: 'ai' })}>
                <Bot size={16} strokeWidth={3} /> AI partner
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(['guide', 'builder'] as Role[]).map((r) => {
            const p = seat(r);
            const mine = p?.id === st.you;
            return (
              <div key={r} className={`clay-sm flex flex-col p-4 ${SEAT_INFO[r].color}`}>
                <div className="flex items-center justify-between">
                  <RoleBadge role={r} className="bg-white" />
                  {mine && <span className="clay-chip bg-sun !py-0.5 !text-xs">YOU</span>}
                </div>
                <p className="mt-2 flex-1 text-sm font-semibold">{SEAT_INFO[r].desc}</p>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border-2 border-ink bg-white/80 px-3 py-2">
                  <span className="truncate font-display font-semibold">{p ? `${p.isAI ? '🤖 ' : ''}${p.name}${p.connected ? '' : ' (away)'}` : 'Empty seat'}</span>
                  {!mine && (!p || p.isAI || !p.connected) && (
                    <button className={btn('white', 'sm')} onClick={() => client.actions.setRole(r)}>
                      Sit here
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <h2 className="mt-7 mb-2 text-xl font-bold">Your interests → your objects</h2>
        <p className="mb-3 text-sm text-muted">The table is filled with Rodin-generated 3D objects from what you like (pick up to 3).</p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {INTERESTS.map((i) => {
            const on = s.interests.includes(i.id);
            const kind = allKinds().find((k) => k.id === i.kind);
            return (
              <button
                key={i.id}
                disabled={!host}
                onClick={() => toggleInterest(i.id)}
                className={`clay-sm flex flex-col items-center p-2 transition ${on ? 'bg-mint' : 'bg-white opacity-70 hover:opacity-100'} disabled:cursor-default`}
                aria-pressed={on}
              >
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
                  <button
                    key={k.id}
                    disabled={!host}
                    onClick={() => client.actions.updateSettings({ customKinds: on ? s.customKinds.filter((x) => x !== k.id) : [...s.customKinds, k.id].slice(-2) })}
                    className={`clay-chip ${on ? 'bg-mint' : 'bg-white'}`}
                  >
                    {k.ref && <img src={k.ref} alt="" className="h-6 w-6 rounded object-cover" />} {k.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="mt-7 mb-2 text-xl font-bold">Difficulty</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {DIFFS.map((d) => (
            <button
              key={d.id}
              disabled={!host}
              onClick={() => client.actions.updateSettings({ difficulty: d.id })}
              className={`clay-sm p-3 text-left ${s.difficulty === d.id ? d.color : 'bg-white'} disabled:cursor-default`}
              aria-pressed={s.difficulty === d.id}
            >
              <div className="font-display text-lg font-semibold">{d.label}</div>
              <div className="text-sm font-semibold opacity-80">{d.desc}</div>
            </button>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          {host ? (
            <button className={btn('primary', 'lg')} disabled={!ready} onClick={start}>
              Start the {s.durationSec}s challenge →
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
            <button
              className={btn('white', 'sm', 'mt-3')}
              onClick={() => {
                void navigator.clipboard?.writeText(joinUrl).then(() => toast.success('Link copied!'));
              }}
            >
              <Copy size={16} strokeWidth={3} /> Copy invite link
            </button>
            <p className="mt-2 text-xs break-all text-muted">{joinUrl}</p>
          </section>
        ) : (
          <section className="clay-card bg-lavender p-6">
            <div className="text-5xl">🤖</div>
            <h2 className="mt-2 text-2xl font-bold">{s.aiRole === 'guide' ? 'Nova will guide you' : 'Pixel will build for you'}</h2>
            <p className="mt-2 text-sm font-semibold text-muted">
              {s.aiRole === 'guide'
                ? 'Nova sees the target and talks you through it. On Tricky she sometimes describes things from HER side. Catch it: “My left or your left?”'
                : 'Pixel follows your instructions literally, asks “which one?” when you are vague and assumes HIS own left unless you say whose.'}
            </p>
            {host && (
              <button className={btn('white', 'sm', 'mt-4')} onClick={() => client.actions.updateSettings({ aiRole: s.aiRole === 'guide' ? 'builder' : 'guide' })}>
                Swap: I want to be the {s.aiRole === 'guide' ? 'Guide' : 'Builder'}
              </button>
            )}
          </section>
        )}
        <section className="clay-card p-6">
          <h2 className="text-xl font-bold">How a round works</h2>
          <ol className="mt-3 space-y-2 text-sm font-semibold">
            <li>1. {s.durationSec} seconds, 3 missions: find it, place it, then one more.</li>
            <li>2. Talk out loud (hold Space for the mic) or type in the chat.</li>
            <li>3. The builder clicks objects; wrong picks cost points.</li>
            <li>4. Afterwards: replay + a coach report on every sentence.</li>
          </ol>
        </section>
      </aside>
    </div>
  );
}
