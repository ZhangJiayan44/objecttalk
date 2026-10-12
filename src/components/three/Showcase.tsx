import { Environment, Html, Lightformer } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { INTERESTS } from '@shared/catalog';
import { ItemModel } from './models';

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

export function Showcase({ kinds = INTERESTS.map((i) => i.kind), labels = true, className }: { kinds?: string[]; labels?: boolean; className?: string }) {
  const gap = 0.95;
  return (
    <Canvas className={className} dpr={[1, 2]} camera={{ fov: 38, position: [0, 1.2, 4] }} gl={{ alpha: true, antialias: true }} shadows>
      <Fit count={kinds.length} gap={gap} />
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
        {kinds.map((kind, i) => {
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
              {labels && interest && (
                <Html position={[0, -0.18, 0.3]} center distanceFactor={5} style={{ pointerEvents: 'none' }}>
                  <div className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 font-display text-sm font-semibold whitespace-nowrap text-ink shadow-[2px_2px_0_#2d3748]">
                    {interest.emoji} {interest.label}
                  </div>
                </Html>
              )}
            </group>
          );
        })}
      </Suspense>
    </Canvas>
  );
}
