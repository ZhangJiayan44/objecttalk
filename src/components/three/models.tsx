import { Html, RoundedBox, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DECOR_MODELS, getKind, kindsFor } from '@shared/catalog';
import { TABLE_D, TABLE_W, TABLE_Y } from '@shared/room';
import { COLOR_HEX, type ColorName, type LandmarkKind, type Role, type SizeName } from '@shared/types';
import { asset } from '@/lib/asset';

/** Visual building blocks shared by the game, replay and landing showcase. */

export const SIZE_SCALE: Record<SizeName, number> = { small: 0.7, regular: 1, big: 1.32 };
const INK = '#2d3748';

export interface Look {
  glow?: string | null;
  ghost?: boolean;
  opacity?: number;
}

/** Apply hover glow / ghost transparency to every mesh of a (cloned) model. */
function useLook(root: THREE.Object3D | null, look: Look) {
  useEffect(() => {
    if (!root) return;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats as THREE.MeshStandardMaterial[]) {
        if (!m) continue;
        if ('emissive' in m) {
          m.emissive = new THREE.Color(look.glow ?? '#000000');
          m.emissiveIntensity = look.glow ? 0.45 : 0;
        }
        m.transparent = !!look.ghost || (look.opacity ?? 1) < 1;
        m.opacity = look.ghost ? 0.38 : (look.opacity ?? 1);
        m.depthWrite = !look.ghost;
        m.needsUpdate = true;
      }
    });
  }, [root, look.glow, look.ghost, look.opacity]);
}

function GlbModel({ url, rotation, look }: { url: string; rotation?: [number, number, number]; look: Look }) {
  const gltf = useGLTF(asset(url), false, true);
  const root = useMemo(() => {
    const c = gltf.scene.clone(true);
    c.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      }
    });
    // Re-seat rotated models so they stay centred and rest on the table (y = 0).
    const turned = new THREE.Group();
    turned.add(c);
    if (rotation) turned.rotation.set(...rotation);
    turned.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(turned);
    const center = box.getCenter(new THREE.Vector3());
    turned.position.set(-center.x, -box.min.y, -center.z);
    const outer = new THREE.Group();
    outer.add(turned);
    return outer;
  }, [gltf.scene, rotation]);
  useLook(root, look);
  return <primitive object={root} />;
}

function Mug({ color, look }: { color: ColorName; look: Look }) {
  const mat = {
    color: COLOR_HEX[color],
    roughness: 0.45,
    emissive: look.glow ?? '#000000',
    emissiveIntensity: look.glow ? 0.45 : 0,
    transparent: !!look.ghost,
    opacity: look.ghost ? 0.38 : 1,
    depthWrite: !look.ghost,
  };
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.36, 0.32, 0.84, 32]} />
        <meshStandardMaterial {...mat} />
      </mesh>
      <mesh position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.31, 32]} />
        <meshStandardMaterial color="#6b4226" roughness={0.3} transparent={!!look.ghost} opacity={look.ghost ? 0.38 : 1} />
      </mesh>
      <mesh castShadow position={[0.33, 0.44, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <torusGeometry args={[0.19, 0.055, 12, 24, Math.PI]} />
        <meshStandardMaterial {...mat} />
      </mesh>
    </group>
  );
}

/** One movable object. Normalized models are 1 unit at their largest side. */
export function ItemModel({ kind, color, size, look = {} }: { kind: string; color: ColorName; size: SizeName; look?: Look }) {
  const def = getKind(kind);
  const scale = (def?.footprint ?? 0.32) * SIZE_SCALE[size];
  return <group scale={scale}>{def?.model ? <GlbModel url={def.model} rotation={def.rotation} look={look} /> : <Mug color={color} look={look} />}</group>;
}

/** Warm the GLB cache for a level (or the hero items) while the lobby is open. */
export function preloadModels(level?: string) {
  const urls = new Set(['/models/rocket.glb', '/models/teddy_bear.glb', '/models/cupcake.glb', '/models/sneaker.glb', '/models/game_controller.glb', DECOR_MODELS.plant, DECOR_MODELS.books]);
  if (level) for (const k of kindsFor(level)) if (k.model) urls.add(k.model);
  if (level === 'city') for (const u of ['/models/bank.glb', '/models/convenience_store.glb', '/models/hospital.glb', '/models/school.glb', '/models/post_office.glb', '/models/hotel.glb', '/models/museum.glb', '/models/house.glb', '/models/fountain.glb', '/models/tree.glb', '/models/traffic_light.glb', '/models/bus_stop.glb']) urls.add(u);
  for (const url of urls) useGLTF.preload(asset(url), false, true);
}

// ---------------------------------------------------------------------------
// Landmarks (fixed table furniture)
// ---------------------------------------------------------------------------

function Lamp() {
  return (
    <group>
      <mesh castShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.13, 0.15, 0.06, 28]} />
        <meshStandardMaterial color="#f4a261" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.48, 12]} />
        <meshStandardMaterial color={INK} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.56, 0]}>
        <coneGeometry args={[0.2, 0.24, 28, 1, true]} />
        <meshStandardMaterial color="#ffd166" roughness={0.5} side={THREE.DoubleSide} emissive="#ffd166" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color="#fff6d8" emissive="#fff1b8" emissiveIntensity={1.4} />
      </mesh>
      <pointLight position={[0, 0.42, 0]} intensity={0.9} distance={1.6} color="#ffe2a8" />
    </group>
  );
}

function Plant() {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.15, 0.11, 0.24, 24]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.245, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.02, 24]} />
        <meshStandardMaterial color="#6b4226" />
      </mesh>
      {[
        [0, 0.42, 0, 0.13],
        [-0.09, 0.36, 0.05, 0.1],
        [0.09, 0.37, -0.04, 0.1],
        [0.03, 0.52, 0.02, 0.09],
      ].map(([x, y, z, r], i) => (
        <mesh key={i} castShadow position={[x, y, z]}>
          <sphereGeometry args={[r, 20, 16]} />
          <meshStandardMaterial color={i % 2 ? '#3fbf7f' : '#57cc99'} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Books({ color }: { color: string }) {
  return (
    <group rotation={[0, 0.25, 0]}>
      <RoundedBox args={[0.34, 0.07, 0.25]} radius={0.015} position={[0, 0.035, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0.005, 0.035, 0]}>
        <boxGeometry args={[0.32, 0.055, 0.252]} />
        <meshStandardMaterial color="#fffaf0" />
      </mesh>
      <RoundedBox args={[0.3, 0.06, 0.22]} radius={0.015} position={[0.01, 0.1, 0]} rotation={[0, -0.35, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.6} />
      </RoundedBox>
    </group>
  );
}

export function LandmarkModel({ kind }: { kind: LandmarkKind }) {
  if (kind === 'lamp') return <Lamp />;
  if (kind === 'plant') return <Plant />;
  return <Books color={kind === 'redBook' ? COLOR_HEX.red : COLOR_HEX.blue} />;
}

// ---------------------------------------------------------------------------
// Room shell
// ---------------------------------------------------------------------------

export function Table() {
  const legX = TABLE_W / 2 - 0.18;
  const legZ = TABLE_D / 2 - 0.16;
  return (
    <group>
      <RoundedBox args={[TABLE_W, 0.1, TABLE_D]} radius={0.05} smoothness={4} position={[0, TABLE_Y - 0.05, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#f7d9b4" roughness={0.75} />
      </RoundedBox>
      {/* chunky ink edge, like the 3px card borders of the UI */}
      <RoundedBox args={[TABLE_W + 0.04, 0.06, TABLE_D + 0.04]} radius={0.03} position={[0, TABLE_Y - 0.11, 0]}>
        <meshStandardMaterial color={INK} roughness={0.8} />
      </RoundedBox>
      {[
        [-legX, -legZ],
        [legX, -legZ],
        [-legX, legZ],
        [legX, legZ],
      ].map(([x, z], i) => (
        <RoundedBox key={i} args={[0.12, TABLE_Y - 0.12, 0.12]} radius={0.04} position={[x, (TABLE_Y - 0.12) / 2, z]} castShadow>
          <meshStandardMaterial color="#e9b88a" roughness={0.8} />
        </RoundedBox>
      ))}
    </group>
  );
}

function Shelf({ x, flip }: { x: number; flip: boolean }) {
  return (
    <group position={[x, 0, 0]} rotation={[0, flip ? -Math.PI / 2 : Math.PI / 2, 0]}>
      <RoundedBox args={[3.2, 2.6, 0.12]} radius={0.06} position={[0, 1.3, -0.06]} receiveShadow>
        <meshStandardMaterial color={flip ? '#e6e6fa' : '#fdd9d2'} roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[1.1, 0.75, 0.04]} radius={0.04} position={[-0.7, 1.75, 0.02]}>
        <meshStandardMaterial color="#add8e6" roughness={0.4} />
      </RoundedBox>
      <RoundedBox args={[1.18, 0.83, 0.03]} radius={0.05} position={[-0.7, 1.75, 0.0]}>
        <meshStandardMaterial color={INK} />
      </RoundedBox>
      <RoundedBox args={[0.9, 0.08, 0.3]} radius={0.03} position={[0.8, 1.35, 0.12]} castShadow>
        <meshStandardMaterial color="#e9b88a" />
      </RoundedBox>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0.55 + i * 0.22, 1.5, 0.15]} castShadow>
          <boxGeometry args={[0.12, 0.22 - i * 0.03, 0.16]} />
          <meshStandardMaterial color={['#ff6b6b', '#ffd166', '#98ff98'][i]} />
        </mesh>
      ))}
    </group>
  );
}

export function RoomShell() {
  return (
    <group>
      <RoundedBox args={[8.5, 0.2, 8.5]} radius={0.1} position={[0, -0.1, 0]} receiveShadow>
        <meshStandardMaterial color="#f3e2c7" roughness={0.95} />
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <circleGeometry args={[2.6, 48]} />
        <meshStandardMaterial color="#c9f7d4" roughness={1} />
      </mesh>
      <Shelf x={-4.1} flip={false} />
      <Shelf x={4.1} flip />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

export function Avatar({ role, name, label = true }: { role: Role; name: string; label?: boolean }) {
  const color = role === 'guide' ? '#fdbcb4' : '#add8e6';
  const head = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (head.current) head.current.position.y = 1.32 + Math.sin(clock.elapsedTime * 2 + (role === 'guide' ? 0 : 1.5)) * 0.02;
  });
  return (
    <group>
      <mesh castShadow position={[0, 0.62, 0]}>
        <capsuleGeometry args={[0.26, 0.6, 8, 20]} />
        <meshStandardMaterial color={color} roughness={0.55} />
      </mesh>
      <group ref={head} position={[0, 1.32, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.26, 28, 22]} />
          <meshStandardMaterial color="#ffe8d6" roughness={0.6} />
        </mesh>
        {[-0.09, 0.09].map((x) => (
          <mesh key={x} position={[x, 0.03, 0.235]}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshStandardMaterial color={INK} />
          </mesh>
        ))}
        <mesh position={[0, -0.07, 0.235]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.05, 0.012, 8, 16, Math.PI]} />
          <meshStandardMaterial color={INK} />
        </mesh>
        <mesh position={[0, 0.2, 0]} rotation={[0.2, 0, 0]}>
          <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.3]} />
          <meshStandardMaterial color={role === 'guide' ? '#9b7bf2' : '#22c55e'} roughness={0.5} />
        </mesh>
      </group>
      {label && (
        <Html position={[0, 1.78, 0]} center distanceFactor={4} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-full border-2 border-ink bg-white px-2.5 py-0.5 font-display text-sm font-semibold text-ink shadow-[2px_2px_0_#2d3748]">
            {role === 'guide' ? '🧭' : '🛠️'} {name}
          </div>
        </Html>
      )}
    </group>
  );
}
