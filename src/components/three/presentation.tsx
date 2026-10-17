import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Vector2, type Clock, type PerspectiveCamera } from 'three';
import type { GraphicsMode } from '@/lib/graphics';

const presentationTimes = new WeakMap<Clock, number>();
export const readPresentationTime = (clock: Clock) => presentationTimes.get(clock);
function usePresentationTime(time: number, staticShadows = false, sample?: () => PresentationShot) {
  const clock = useThree((state) => state.clock);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const rendererSize = useRef(new Vector2());
  const warmFrames = useRef(0);
  useEffect(() => {
    if (!staticShadows) return;
    const previous = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    warmFrames.current = 0;
    return () => { gl.shadowMap.autoUpdate = previous; gl.shadowMap.needsUpdate = true; };
  }, [gl, staticShadows]);
  useLayoutEffect(() => { invalidate(); }, [time, invalidate]);
  useEffect(
    () => () => {
      presentationTimes.delete(clock);
    },
    [clock],
  );
  useFrame(({ gl, size }) => {
    // Concurrent EffectComposer mounts share a temporary size vector in the
    // dependency. A late passive mount can resize another renderer's canvas
    // while R3F's own size is still correct. Restore this root's dimensions
    // before its compositor renders; the steady-state path allocates nothing.
    gl.getSize(rendererSize.current);
    if (rendererSize.current.x !== size.width || rendererSize.current.y !== size.height) {
      gl.setSize(size.width, size.height, true);
    }
    const frameTime = sample?.().time ?? time;
    clock.elapsedTime = frameTime;
    presentationTimes.set(clock, frameTime);
    gl.domElement.dataset.presentationTime = String(frameTime);
    // The market tour moves the camera through an otherwise fixed set. Reuse
    // its shadow map instead of redrawing every building for each camera frame.
    if (staticShadows && warmFrames.current++ < 8) gl.shadowMap.needsUpdate = true;
  }, -101);
}

/** Optional scripted camera for the film. Gameplay keeps its normal controls. */
export interface PresentationShot {
  time: number;
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
  objectProgress?: number;
  objectProgressById?: Record<string, number>;
  objectId?: string;
  objectLift?: number;
  staticShadows?: boolean;
  /** Read the film clock directly for camera-only tours, without React cadence. */
  sample?: () => PresentationShot;
  quality?: GraphicsMode;
  onReady?: () => void;
}
export function PresentationCamera({ shot }: { shot: PresentationShot }) {
  usePresentationTime(shot.time, shot.staticShadows, shot.sample);
  const frames = useRef(0);
  const previousTime = useRef<number | undefined>(undefined);
  useFrame(({ camera, invalidate, gl }) => {
    const current = shot.sample?.() ?? shot;
    if (shot.sample && current.time !== previousTime.current) invalidate();
    previousTime.current = current.time;
    camera.position.set(...current.position);
    camera.lookAt(...current.target);
    const perspective = camera as PerspectiveCamera;
    if (current.fov && perspective.fov !== current.fov) {
      perspective.fov = current.fov;
      perspective.updateProjectionMatrix();
    }
    const warmup = shot.staticShadows ? 8 : 4;
    if (++frames.current < warmup) invalidate();
    else if (frames.current === warmup) {
      // Startup preparation must include GPU uploads, not just queued draws.
      gl.getContext().finish();
      shot.onReady?.();
    }
  }, -100);
  return null;
}

export function PresentationClock({ time, onReady }: { time: number; onReady?: () => void }) {
  usePresentationTime(time);
  const frames = useRef(0);
  useFrame(({ invalidate }) => {
    if (++frames.current < 4) invalidate();
    else if (frames.current === 4) onReady?.();
  }, -100);
  return null;
}
