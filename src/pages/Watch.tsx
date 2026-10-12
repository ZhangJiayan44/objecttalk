import { useEffect } from 'react';
import { useParams } from 'react-router';
import { RoomScene } from '@/components/three/RoomScene';
import { preloadModels } from '@/components/three/models';
import { RoleBadge } from '@/components/ui';
import { loadItems } from '@/lib/api';
import { GameContext, useGame, useGameClient } from '@/lib/game-client';
import { getPrimaryClient } from '@/lib/primary';
import type { Role } from '@shared/types';

/**
 * Big-screen spectator view for the booth: both players' views side by side,
 * plus the live transcript, so bystanders can see *why* a sentence failed.
 */
function WatchInner({ code }: { code: string }) {
  const client = useGameClient();
  const st = useGame((s) => s.state);
  const chat = useGame((s) => s.chat);
  const hover = useGame((s) => s.remoteHover);
  useEffect(() => {
    preloadModels();
    void loadItems().catch(() => undefined);
    if (client.store.getState().state?.code !== code) void client.actions.join(code, 'Audience', { spectate: true }).catch(() => undefined);
  }, [client, code]);

  if (!st?.scene)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream">
        <div className="clay-chip bg-white font-display text-lg">Room {code}: waiting for the next round…</div>
        <p className="text-muted">This screen updates automatically.</p>
      </div>
    );
  const names = Object.fromEntries(st.players.filter((p) => p.role).map((p) => [p.role, p.name])) as Partial<Record<Role, string>>;
  const target = st.mission ? { findId: st.mission.targetId, itemId: st.mission.itemId, cell: st.mission.targetCell } : null;
  return (
    <div className="flex h-dvh flex-col bg-cream">
      <header className="flex items-center justify-between border-b-[3px] border-ink bg-white px-4 py-2">
        <div className="font-display text-xl font-bold">Live · Room {st.code}</div>
        <div className="font-semibold text-muted">{st.mission ? `Mission ${st.mission.index + 1}: ${st.mission.type === 'find' ? 'Find it' : 'Place it'}` : st.phase}</div>
      </header>
      <div className="grid flex-1 grid-cols-1 gap-2 p-2 md:grid-cols-[1fr_1fr_22rem]">
        {(['guide', 'builder'] as Role[]).map((r) => (
          <div key={r} className="clay-card relative overflow-hidden">
            <RoomScene className="!absolute inset-0" scene={st.scene!} view={r} heldId={st.held?.objectId} target={r === 'guide' ? target : null} pointer={hover} names={names} />
            <div className="absolute top-2 left-2 flex items-center gap-2">
              <RoleBadge role={r} />
              <span className="clay-chip bg-white">{names[r] ?? '…'}</span>
            </div>
            <div className="absolute bottom-2 left-2 clay-chip bg-white/90 !text-xs">{r === 'guide' ? 'Sees the gold target' : 'Sees no target: must listen'}</div>
          </div>
        ))}
        <aside className="clay-card flex flex-col overflow-hidden">
          <h2 className="border-b-2 border-line px-4 py-2 font-display text-lg font-semibold">What they say</h2>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {chat.slice(-30).map((m) => (
              <div key={m.id} className={`rounded-xl border-2 border-ink px-3 py-1.5 text-sm ${m.role === 'guide' ? 'bg-peach/60' : 'bg-sky/60'}`}>
                <b>{m.name}:</b> {m.text}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function Watch() {
  const { code = '' } = useParams();
  return (
    <GameContext.Provider value={getPrimaryClient()}>
      <WatchInner code={code.toUpperCase()} />
    </GameContext.Provider>
  );
}
