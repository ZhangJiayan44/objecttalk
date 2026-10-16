import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { Role } from '@shared/types';
import { GameView } from '@/components/game/GameView';
import { Lobby } from '@/components/game/Lobby';
import { Results } from '@/components/game/Results';
import { preloadModels } from '@/components/three/models';
import { btn, Navbar } from '@/components/ui';
import { loadItems } from '@/lib/api';
import { GameContext, useGame, useGameClient } from '@/lib/game-client';
import { getName } from '@/lib/profile';
import { getPrimaryClient } from '@/lib/primary';

function RoomInner({ code, role, spectate }: { code: string; role: Role | null; spectate: boolean }) {
  const client = useGameClient();
  const st = useGame((s) => s.state);
  const connected = useGame((s) => s.connected);
  const [error, setError] = useState<string | null>(null);
  const [itemsReady, setItemsReady] = useState(false);

  useEffect(() => {
    preloadModels();
    loadItems()
      .catch(() => undefined)
      .finally(() => setItemsReady(true));
  }, []);

  useEffect(() => {
    if (client.store.getState().state?.code === code) return;
    client.actions.join(code, getName(), { role, spectate }).catch((err: Error) => setError(err.message));
  }, [client, code, role, spectate]);

  if (error)
    return (
      <div className="min-h-dvh bg-cream">
        <Navbar />
        <div className="mx-auto max-w-md px-4 pt-36 text-center">
          <div className="clay-card bg-peach/60 p-8">
            <div className="text-5xl">🙈</div>
            <h1 className="mt-3 text-2xl font-bold">{error}</h1>
            <Link to="/play" className={btn('primary', 'md', 'mt-6')}>
              Back to play
            </Link>
          </div>
        </div>
      </div>
    );

  if (!st || st.code !== code || !itemsReady)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream">
        <div className="clay-chip animate-pulse bg-white font-display text-lg">{connected ? `Joining room ${code}…` : 'Connecting to the server…'}</div>
      </div>
    );

  if (st.phase === 'countdown' || st.phase === 'playing')
    return (
      <div className="h-dvh w-full">
        <GameView />
      </div>
    );

  return (
    <div className="min-h-dvh bg-cream dot-grid">
      <Navbar />
      {st.phase === 'results' ? <Results /> : <Lobby />}
    </div>
  );
}

export default function RoomPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const role = params.get('role');
  return (
    <GameContext.Provider value={getPrimaryClient()}>
      <RoomInner code={code.toUpperCase()} role={role === 'guide' || role === 'builder' ? role : null} spectate={params.get('spectate') === '1'} />
    </GameContext.Provider>
  );
}
