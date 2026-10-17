import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type Dispatch, type SetStateAction } from 'react';
import type * as THREE from 'three';
import { GRAPHICS_EVENT, initialRenderQuality, nextRenderQuality, readGraphicsMode, RENDER_PROFILES, type GraphicsMode, type RenderQuality } from '@/lib/graphics';

const QualityContext = createContext<{ mode: GraphicsMode; quality: RenderQuality; setQuality: Dispatch<SetStateAction<RenderQuality>> } | null>(null);
const initialQuality = (mode: GraphicsMode) => initialRenderQuality(mode, window.matchMedia('(pointer: coarse)').matches, navigator.hardwareConcurrency ?? 8);

/** Keep DPR controlled by Canvas so movement/state updates cannot reset adaptation. */
export function SceneCanvas({ renderQuality, ...props }: Omit<ComponentProps<typeof Canvas>, 'dpr' | 'shadows'> & { renderQuality?: GraphicsMode }) {
  const [mode, setMode] = useState<GraphicsMode>(() => renderQuality ?? readGraphicsMode());
  const [quality, setQuality] = useState(() => initialQuality(mode));
  useEffect(() => {
    const update = () => {
      const next = renderQuality ?? readGraphicsMode();
      setMode(next);
      setQuality(initialQuality(next));
    };
    update();
    window.addEventListener(GRAPHICS_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(GRAPHICS_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, [renderQuality]);
  const profile = RENDER_PROFILES[quality];
  const value = useMemo(() => ({ mode, quality, setQuality }), [mode, quality]);
  return <QualityContext.Provider value={value}><Canvas {...props} dpr={Math.min(window.devicePixelRatio || 1, profile.dpr)} shadows={profile.shadows ? 'percentage' : false} /></QualityContext.Provider>;
}

export function useRenderQuality() {
  const context = useContext(QualityContext);
  if (!context) throw new Error('PostFx must be rendered inside SceneCanvas');
  const { quality, mode, setQuality } = context;
  const { scene, invalidate } = useThree();
  const sample = useRef({ warmup: 4, frames: 0, elapsed: 0, slowWindows: 0 });
  useEffect(() => {
    sample.current = { warmup: 4, frames: 0, elapsed: 0, slowWindows: 0 };
  }, [mode, quality]);
  useEffect(() => {
    const profile = RENDER_PROFILES[quality];
    const lights: { light: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight; size: THREE.Vector2 }[] = [];
    scene.traverse((object) => {
      if (!('shadow' in object) || !object.castShadow) return;
      const light = object as THREE.DirectionalLight;
      const size = light.shadow.mapSize.clone();
      lights.push({ light, size });
      light.shadow.mapSize.set(Math.min(size.x, profile.shadowSize), Math.min(size.y, profile.shadowSize));
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.shadow.needsUpdate = true;
    });
    invalidate();
    return () => {
      lights.forEach(({ light, size }) => {
        light.shadow.mapSize.copy(size);
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.needsUpdate = true;
      });
    };
  }, [quality, scene, invalidate]);
  useFrame((_, dt) => {
    const s = sample.current;
    if (mode !== 'auto') return;
    if (document.hidden || dt > 1) {
      s.frames = s.elapsed = s.slowWindows = 0;
      s.warmup = 4;
      return;
    }
    if (s.warmup > 0) { s.warmup -= dt; return; }
    s.frames++;
    s.elapsed += dt;
    if (s.elapsed < 3) return;
    const next = nextRenderQuality(quality, s.frames / s.elapsed, s.slowWindows);
    s.slowWindows = next.slowWindows;
    s.frames = s.elapsed = 0;
    if (next.quality !== quality) {
      s.warmup = 4;
      setQuality(next.quality);
    }
  });
  return quality;
}
