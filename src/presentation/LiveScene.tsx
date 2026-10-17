import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { buildCafe } from '@shared/cafe';
import { registerKinds } from '@shared/catalog';
import type { LevelBundle } from '@shared/levels';
import { buildScene } from '@shared/missions';
import { createRng } from '@shared/rng';
import type { Role } from '@shared/types';
import { DemoQualityContext, NativeDemoScene, studyShot, warmNativeScenes } from '@/components/demo/NativeDemoScene';
import { CafeScene } from '@/components/three/CafeScene';
import { RoomScene } from '@/components/three/RoomScene';
import { Showcase } from '@/components/three/Showcase';
import { preloadModels } from '@/components/three/models';
import musicBundle from '../../content/levels/music-room.json';
import fruitBundle from '../../content/levels/fruit-market.json';

// Actual published agent-made levels, using the same catalog and scene builders as gameplay.
const music = musicBundle as LevelBundle;
const fruit = fruitBundle as LevelBundle;
registerKinds([...music.kinds, ...fruit.kinds]);
const musicScene = buildScene({ seed: 8, interests: [], difficulty: 'easy', pool: music.level.id, kinds: music.level.generated?.kinds });
const fruitScene = buildCafe(createRng(0), fruit.level.id);

export type PitchWorld = 'study' | 'cafe' | 'town' | 'night' | 'music' | 'fruit';
export const PitchMotionContext = createContext(true);

export function SceneMotion({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = useContext(PitchMotionContext);
  return <PitchMotionContext.Provider value={parentActive && active}>{children}</PitchMotionContext.Provider>;
}

export function preloadPitchScenes() {
  warmNativeScenes();
  preloadModels('cafe');
  const timer = window.setTimeout(() => {
    preloadModels(music.level.id);
    preloadModels(fruit.level.id);
    preloadModels('nightmarket');
  }, 1000);
  return () => window.clearTimeout(timer);
}

function useSceneClock() {
  const active = useContext(PitchMotionContext);
  const [time, setTime] = useState(0);
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const elapsed = useRef(0);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduced.current = media.matches; };
    media.addEventListener('change', update);
    let frame: number;
    let previous = performance.now();
    let committed = previous;
    const tick = (now: number) => {
      if (active && !document.hidden && !reduced.current) elapsed.current += Math.min(0.1, (now - previous) / 1000);
      previous = now;
      if (now - committed >= 50) { setTime(elapsed.current); committed = now; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); media.removeEventListener('change', update); };
  }, [active]);
  return time;
}

function GeneratedScene({ world, time }: { world: 'music' | 'fruit'; time: number }) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const p = (1 - Math.cos(time * 0.18)) / 2;
  return <div className="native-demo-scene" data-native-component={world === 'music' ? 'RoomScene' : 'CafeScene'} data-native-ready={ready} data-generated-level={world === 'music' ? music.level.id : fruit.level.id}>
    {world === 'music'
      ? <RoomScene scene={musicScene} view="overview" labels={false} palette={music.level.generated?.palette} sign={music.level.generated?.sign} presentation={{ ...studyShot(p * 5), time, quality: 'low', onReady }} names={{ guide: 'Mia', builder: 'Leo' }} />
      : <CafeScene scene={fruitScene.scene} tray={[]} view="overview" interactive={false} look="market" palette={fruit.level.generated?.palette} sign={fruit.level.generated?.sign} presentation={{ time, quality: 'low', position: [4 - p, 2.6 - p * 0.3, 4.2], target: [0.3, 1.15, 0], fov: 58, onReady }} names={{ guide: 'Mia', builder: 'Leo' }} />}
  </div>;
}

export function LiveScene({ world = 'study', role, className = '', label }: { world?: PitchWorld; role?: Role; className?: string; label?: string }) {
  const elapsed = useSceneClock();
  // Reuse the film's native camera tracks at a quieter, continuous pace.
  const p = (1 - Math.cos(elapsed * 0.18)) / 2;
  const time = world === 'study' ? (role ? 5 + p * 5 : p * 5) : world === 'cafe' ? 20 + p * 3 : world === 'town' ? 23.2 + p * 3.4 : 30 + p * 2.5;
  return <div className={`pitch-live-scene ${className}`} role="img" aria-label={label || `ObjectTalk ${world} live 3D scene`} data-pitch-world={world} data-scene-clock={elapsed.toFixed(2)}>
    <Suspense fallback={<div className="pitch-scene-loading">Loading scene…</div>}>
      <DemoQualityContext.Provider value="low">
        {world === 'music' || world === 'fruit' ? <GeneratedScene world={world} time={elapsed} /> : <NativeDemoScene kind={world} time={time} role={role} />}
      </DemoQualityContext.Provider>
    </Suspense>
  </div>;
}

export function LiveAssets() {
  const time = useSceneClock();
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return <div className="pitch-live-scene pitch-live-assets" role="img" aria-label="ObjectTalk 3D assets generated with Rodin" data-scene-clock={time.toFixed(2)}><div className="native-demo-scene" data-native-component="Showcase" data-native-ready={ready}><Showcase labels={false} presentationTime={time} onPresentationReady={onReady} /></div></div>;
}
