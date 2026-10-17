import { Center, Environment, Html, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { INTERESTS } from '@shared/catalog';
import { ItemModel } from './models';
import { PresentationClock } from './presentation';

/** Turntable of the five Rodin-generated objects (landing page + Object Studio). */

function Fit({ count, gap }: { count: number; gap: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const halfFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov / 2);
    // Distance that fits the whole row (plus a pedestal of margin) horizontally and ~1.4 units vertically.
    const halfWidth = ((count - 1) * gap) / 2 + 0.6;
    const z = Math.max(halfWidth / (Math.tan(halfFov) * aspect), 0.9 / Math.tan(halfFov)) + 0.3;
    camera.position.set(0, 1.1, z);
    camera.lookAt(0, 0.38, 0);
  }, [camera, size.width, size.height, count, gap]);
  return null;
}

function Spinner({ children, speed, phase }: { children: React.ReactNode; speed: number; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = phase + clock.elapsedTime * speed;
    ref.current.position.y = 0.16 + Math.sin(clock.elapsedTime * 1.6 + phase) * 0.03;
  });
  return <group ref={ref}>{children}</group>;
}

/** Single-object previews frame the actual model, independent of its in-game footprint. */
function ObjectPreview({ kind }: { kind: string }) {
  const { camera, size } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const fit = useCallback(({ boundingSphere }: { boundingSphere: THREE.Sphere }) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const halfVertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * size.width / Math.max(1, size.height));
    // A sphere stays inside the frame at every turntable angle, including portrait layouts.
    const distance = Math.max(boundingSphere.radius, 0.01) * 1.15 / Math.sin(Math.min(halfVertical, halfHorizontal));
    camera.position.set(0, 0.25, 1).normalize().multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [camera, size.width, size.height]);

  return (
    <>
      <Center key={kind} precise onCentered={fit}>
        <ItemModel kind={kind} color="red" size="regular" />
      </Center>
      <OrbitControls ref={controls} makeDefault target={[0, 0, 0]} autoRotate autoRotateSpeed={1.2} enablePan={false} enableZoom={false} />
    </>
  );
}

function InterestLabel({ interest }: { interest: (typeof INTERESTS)[number] }) {
  const height = useThree((state) => state.size.height);
  return (
    <Html position={[0, -0.18, 0.3]} center distanceFactor={height / 100} style={{ pointerEvents: 'none' }}>
      <div className="inline-flex max-w-[88px] items-center gap-1 whitespace-nowrap rounded-full border border-ink bg-white px-2 py-0.5 font-display text-[13px] leading-tight font-semibold text-ink shadow-[1px_1px_0_#2d3748]">
        <span className="shrink-0" aria-hidden="true">{interest.emoji}</span>
        <span className="truncate">{interest.label}</span>
      </div>
    </Html>
  );
}

export function Showcase({ kinds = INTERESTS.map((i) => i.kind), labels = true, className, presentationTime, onPresentationReady }: { kinds?: string[]; labels?: boolean; className?: string; presentationTime?: number; onPresentationReady?: () => void }) {
  const gap = 0.95;
  const single = kinds.length === 1;
  return (
    <Canvas frameloop={presentationTime !== undefined ? 'demand' : undefined} resize={presentationTime !== undefined ? { offsetSize: true } : undefined} className={className} dpr={[1, 2]} camera={{ fov: 38, position: [0, 1.2, 4] }} gl={{ alpha: true, antialias: true }} shadows>
      {!single && <Fit count={kinds.length} gap={gap} />}
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 5, 4]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer intensity={1.2} position={[-4, 2, 3]} rotation-y={Math.PI / 3} scale={[5, 3, 1]} color="#ffe0d6" />
        <Lightformer intensity={1.2} position={[4, 2, 3]} rotation-y={-Math.PI / 3} scale={[5, 3, 1]} color="#d6ecff" />
      </Environment>
      <Suspense
        fallback={
          <Html center>
            <div className="clay-chip animate-pulse bg-white">Loading 3D…</div>
          </Html>
        }
      >
        {presentationTime !== undefined && <PresentationClock time={presentationTime} onReady={onPresentationReady} />}
        {single ? <ObjectPreview kind={kinds[0]} /> : kinds.map((kind, i) => {
          const x = (i - (kinds.length - 1) / 2) * gap;
          const interest = INTERESTS.find((it) => it.kind === kind);
          return (
            <group key={kind} position={[x, 0, 0]}>
              <mesh position={[0, 0.04, 0]} receiveShadow castShadow>
                <cylinderGeometry args={[0.36, 0.4, 0.08, 40]} />
                <meshStandardMaterial color={['#fdbcb4', '#add8e6', '#e6e6fa', '#98ff98', '#ffd166'][i % 5]} roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.0, 0]}>
                <cylinderGeometry args={[0.42, 0.42, 0.03, 40]} />
                <meshStandardMaterial color="#2d3748" />
              </mesh>
              <Spinner speed={0.6} phase={i * 1.3}>
                <group scale={2.2}>
                  <ItemModel kind={kind} color="red" size="regular" />
                </group>
              </Spinner>
              {labels && interest && <InterestLabel interest={interest} />}
            </group>
          );
        })}
      </Suspense>
    </Canvas>
  );
}
