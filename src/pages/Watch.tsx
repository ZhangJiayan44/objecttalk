import { useEffect } from 'react';
import { useParams } from 'react-router';
import { levelOf } from '@shared/levels';
import type { Role } from '@shared/types';
import { AgentPanel } from '@/components/game/AgentPanel';
import { GameView } from '@/components/game/GameView';
import { preloadModels } from '@/components/three/models';
import { loadItems, loadLevels } from '@/lib/api';
import { GameContext, useGame, useGameClient } from '@/lib/game-client';
import { getPrimaryClient } from '@/lib/primary';

/**
 * Big-screen spectator view for the booth: both players' views side by side,
 * plus the live transcript and the AI partner's reasoning, so bystanders can
 * see *why* a sentence worked or failed.
 */
function WatchInner({ code }: { code: string }) {
  const client = useGameClient();
  const st = useGame((s) => s.state);
  const chat = useGame((s) => s.chat);
  const traces = useGame((s) => s.traces);
  useEffect(() => {
    void loadItems().catch(() => undefined);
    void loadLevels().catch(() => undefined);
    if (client.store.getState().state?.code !== code) void client.actions.join(code, 'Audience', { spectate: true, viewAs: 'guide' }).catch(() => undefined);
  }, [client, code]);
  useEffect(() => {
    if (st?.settings.level) preloadModels(st.settings.level);
  }, [st?.settings.level]);

  const level = levelOf(st?.settings.level);
  if (!st || (st.phase !== 'playing' && st.phase !== 'countdown'))
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream">
        <div className="clay-chip bg-white font-display text-lg">
          {level.emoji} Room {code}: waiting for the next round…
        </div>
        <p className="text-muted">This screen updates automatically.</p>
      </div>
    );
  return (
    <div className="flex h-dvh flex-col bg-cream">
      <header className="flex items-center justify-between border-b-[3px] border-ink bg-white px-4 py-2">
        <div className="font-display text-xl font-bold">
          Live · {level.emoji} {level.title} · Room {st.code}
        </div>
        <div className="font-semibold text-muted">{st.mission ? `Mission ${st.mission.index + 1}: ${st.mission.title}` : st.phase}</div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 md:grid-cols-[1fr_1fr_22rem]">
        {(['guide', 'builder'] as Role[]).map((r) => (
          <div key={r} className="clay-card relative min-h-[40vh] overflow-hidden">
            <GameView embedded pttKey={false} tts={false} viewOverride={r} />
          </div>
        ))}
        <aside className="flex min-h-0 flex-col gap-2">
          <div className="clay-card flex min-h-0 flex-1 flex-col overflow-hidden">
            <h2 className="border-b-2 border-line px-4 py-2 font-display text-lg font-semibold">What they say</h2>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {chat.slice(-30).map((m) => (
                <div key={m.id} className={`rounded-xl border-2 border-ink px-3 py-1.5 text-sm ${m.role === 'guide' ? 'bg-peach/60' : 'bg-sky/60'}`}>
                  <b>{m.name}:</b> {m.text}
                </div>
              ))}
            </div>
          </div>
          {traces.length > 0 && <AgentPanel onClose={() => undefined} />}
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
