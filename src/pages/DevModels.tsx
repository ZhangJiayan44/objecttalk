import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { allKinds } from '@shared/catalog';
import { generatedLevelList } from '@shared/levels';
import { ItemModel } from '@/components/three/models';
import { SoftIBL } from '@/components/three/env';
import { loadItems, loadLevels } from '@/lib/api';

/**
 * Dev-only model QA sheet: every Rodin item kind on its own little table at
 * its in-game size and orientation, labelled, so wrong rotations or odd
 * scales are obvious at a glance. /dev/models
 */

const GAP = 0.62;

/** Frame the whole grid: from above-front, or low from the side to judge how things stand. */
function Fit({ cols, rows, side }: { cols: number; rows: number; side: boolean }) {
  const { camera } = useThree();
  useEffect(() => {
    const w = cols * GAP;
    const d = rows * GAP;
    if (side) camera.position.set(0, 0.35, d / 2 + w * 0.95 + 0.4);
    else camera.position.set(0, Math.max(w, d) * 0.85 + 0.4, d / 2 + Math.max(w, d) * 0.55 + 0.4);
    camera.lookAt(0, side ? 0.12 : 0, 0);
  }, [camera, cols, rows, side]);
  return null;
}

function Grid({ group, side }: { group: string; side: boolean }) {
  const kinds = useMemo(() => allKinds().filter((k) => k.model && (group === 'all' || (k.levels ?? ['study']).includes(group))), [group]);
  const cols = side ? kinds.length : Math.ceil(Math.sqrt(kinds.length * 1.6));
  return (
    <>
      <Fit cols={cols} rows={Math.ceil(kinds.length / cols)} side={side} />
      {kinds.map((k, i) => {
        const x = ((i % cols) - (cols - 1) / 2) * GAP;
        const z = (Math.floor(i / cols) - (Math.ceil(kinds.length / cols) - 1) / 2) * GAP;
        return (
          <group key={k.id} position={[x, 0, z]}>
            <mesh rotation-x={-Math.PI / 2} receiveShadow>
              <circleGeometry args={[0.27, 32]} />
              <meshStandardMaterial color="#f3e2c7" />
            </mesh>
            <ItemModel kind={k.id} color={k.baseColor} size="regular" />
            <Html position={[0, -0.02, 0.3]} center distanceFactor={4} style={{ pointerEvents: 'none' }}>
              <div className="whitespace-nowrap rounded-full border border-ink bg-white px-1.5 text-[10px] font-bold">{k.name}</div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

export default function DevModels() {
  const [ready, setReady] = useState(false);
  const [group, setGroup] = useState('all');
  const [side, setSide] = useState(false);
  useEffect(() => {
    Promise.all([loadItems().catch(() => undefined), loadLevels().catch(() => undefined)]).then(() => setReady(true));
  }, []);
  if (!ready) return <div className="p-8">Loading…</div>;
  const groups = ['all', 'study', 'cafe', 'bedroom', ...generatedLevelList().map((l) => l.id)];
  return (
    <div className="flex h-dvh flex-col bg-cream">
      <div className="flex flex-wrap gap-2 border-b-2 border-ink bg-white p-2">
        {groups.map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${group === g ? 'bg-sun' : 'bg-white'}`}>
            {g}
          </button>
        ))}
        <button onClick={() => setSide((v) => !v)} className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${side ? 'bg-lavender' : 'bg-white'}`}>
          side view
        </button>
      </div>
      <Canvas className="flex-1" shadows camera={{ position: [0, 4.2, 4.6], fov: 45 }}>
        <color attach="background" args={['#fff9f5']} />
        <hemisphereLight args={['#ffffff', '#d9c6b0', 0.8]} />
        <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow />
        <SoftIBL />
        <Suspense fallback={null}>
          <Grid group={group} side={side} />
        </Suspense>
        <OrbitControls makeDefault target={[0, side ? 0.12 : 0, 0]} />
      </Canvas>
    </div>
  );
}
