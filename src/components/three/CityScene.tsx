import { Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { SceneCanvas as Canvas } from './performance';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AVENUES, BLOCK, collide, EXTENT, LOT, lotCenter, nodePos, NODES, parseNode, PLACE_DEFS, planRoute, ROAD_W, SIDEWALK, STREETS, type Place, type Pose, type Town } from '@shared/city';
import type { Role } from '@shared/types';
import { centerRayEvents, FirstPersonRig } from './controls';
import { Cloud, PostFx, Sign, SkyDome, SoftIBL } from './env';
import { Box, INK } from './furniture';
import { Avatar } from './models';
import { asset } from '@/lib/asset';
import { TownLife } from './townlife';

/**
 * Toy Town: streets on a 4x4 grid, Rodin buildings on the lots, a park with
 * a fountain, traffic lights and a bus stop as landmarks. The walker walks it
 * in first person; the navigator looks down on it like a map.
 */

const BUILDING_SIZE = 9.6;
const TREE = '/models/tree.glb';

function Model({ url, size, position, rotation = 0 }: { url: string; size: number; position: [number, number, number]; rotation?: number }) {
  const gltf = useGLTF(asset(url), false, true);
  const obj = useMemo(() => {
    const c = gltf.scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }, [gltf.scene]);
  return <primitive object={obj} userData={{ walkSolid: true }} position={position} rotation-y={rotation} scale={size} />;
}

const FACE: Record<Place['side'], number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

function Ground() {
  const lines = useMemo(() => Array.from({ length: NODES }, (_, k) => (k - (NODES - 1) / 2) * BLOCK), []);
  const span = EXTENT * 2;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#9fd88b" roughness={1} />
      </mesh>
      {/* asphalt */}
      {lines.map((v) => (
        <group key={v}>
          <mesh rotation-x={-Math.PI / 2} position={[v, 0.01, 0]} receiveShadow>
            <planeGeometry args={[ROAD_W, span]} />
            <meshStandardMaterial color="#5b6475" roughness={0.95} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.011, v]} receiveShadow>
            <planeGeometry args={[span, ROAD_W]} />
            <meshStandardMaterial color="#5b6475" roughness={0.95} />
          </mesh>
          {/* dashed centre lines */}
          {Array.from({ length: Math.floor(span / 4) }, (_, k) => -EXTENT + 2 + k * 4).map((t) => (
            <group key={t}>
              <mesh rotation-x={-Math.PI / 2} position={[v, 0.02, t]}>
                <planeGeometry args={[0.18, 1.6]} />
                <meshBasicMaterial color="#f8f1d8" />
              </mesh>
              <mesh rotation-x={-Math.PI / 2} position={[t, 0.021, v]}>
                <planeGeometry args={[1.6, 0.18]} />
                <meshBasicMaterial color="#f8f1d8" />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* blocks: sidewalk ring + lot */}
      {Array.from({ length: 9 }, (_, k) => {
        const c = lotCenter(k % 3, Math.floor(k / 3));
        return (
          <group key={k} position={[c.x, 0, c.z]}>
            <Box size={[LOT + SIDEWALK * 2, 0.16, LOT + SIDEWALK * 2]} position={[0, 0.08, 0]} color="#e7e2d8" radius={0.05} cast={false} />
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.17, 0]} receiveShadow>
              <planeGeometry args={[LOT, LOT]} />
              <meshStandardMaterial color="#b8e3a2" roughness={1} />
            </mesh>
          </group>
        );
      })}
      {/* hedge around the town and far hills */}
      {[0, 1, 2, 3].map((s) => (
        <mesh key={s} position={s % 2 ? [s === 1 ? EXTENT + 3 : -EXTENT - 3, 0.7, 0] : [0, 0.7, s === 0 ? EXTENT + 3 : -EXTENT - 3]} castShadow>
          <boxGeometry args={s % 2 ? [1.6, 1.4, span + 8] : [span + 8, 1.4, 1.6]} />
          <meshStandardMaterial color="#5fae5a" roughness={1} />
        </mesh>
      ))}
      {[
        [-90, -120, 40],
        [60, -140, 55],
        [140, -20, 45],
        [-150, 30, 50],
        [20, 150, 45],
        [-60, 130, 38],
      ].map(([x, z, r], i) => (
        <mesh key={i} position={[x, -r * 0.55, z]}>
          <sphereGeometry args={[r, 24, 16]} />
          <meshStandardMaterial color={i % 2 ? '#8fcf7e' : '#7dc06c'} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Building({ place }: { place: Place }) {
  const def = PLACE_DEFS[place.id];
  const signPos: [number, number, number] = [place.door.x, 0, place.door.z];
  const rot = FACE[place.side];
  if (place.id === 'park')
    return (
      <group position={[place.center.x, 0.17, place.center.z]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} receiveShadow>
          <circleGeometry args={[4.6, 40]} />
          <meshStandardMaterial color="#f3e6c4" roughness={1} />
        </mesh>
        <Model url="/models/fountain.glb" size={4.2} position={[0, 0, 0]} />
        {[
          [-4.2, -4.2],
          [4.2, -4.2],
          [-4.2, 4.2],
          [4.2, 4.2],
        ].map(([x, z], i) => (
          <Model key={i} url={TREE} size={4.2} position={[x, 0, z]} rotation={i} />
        ))}
        <group position={[place.door.x - place.center.x, 0, place.door.z - place.center.z]} rotation-y={rot}>
          <Sign lines={[def.sign]} size={[3, 0.8]} position={[0, 2.4, 0.2]} bg="#22c55e" fg="#ffffff" border="#2d3748" />
          <mesh position={[0, 1.2, 0]}>
            <boxGeometry args={[0.15, 2.4, 0.15]} />
            <meshStandardMaterial color={INK} />
          </mesh>
        </group>
      </group>
    );
  return (
    <group>
      <group position={[place.center.x, 0.17, place.center.z]} rotation-y={rot}>
        {def.model && <Model url={def.model} size={BUILDING_SIZE} position={[0, 0, 0]} />}
      </group>
      {/* name sign at the door, readable from the street */}
      <group position={signPos} rotation-y={rot}>
        <mesh position={[-1.7, 1.4, 0]}>
          <boxGeometry args={[0.14, 2.8, 0.14]} />
          <meshStandardMaterial color={INK} />
        </mesh>
        <mesh position={[1.7, 1.4, 0]}>
          <boxGeometry args={[0.14, 2.8, 0.14]} />
          <meshStandardMaterial color={INK} />
        </mesh>
        <Sign lines={[def.sign]} size={[3.6, 0.9]} position={[0, 2.85, 0.02]} bg="#fff9f0" fg="#2d3748" border="#2d3748" emissive={0.25} />
        <Sign lines={[def.sign]} size={[3.6, 0.9]} position={[0, 2.85, -0.02]} rotation={[0, Math.PI, 0]} bg="#fff9f0" fg="#2d3748" border="#2d3748" emissive={0.25} />
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.18, 0.4]}>
          <planeGeometry args={[2.2, 1.0]} />
          <meshStandardMaterial color="#ff9f43" roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

function StreetSigns() {
  const signs = [];
  for (let i = 0; i < NODES; i++)
    for (let j = 0; j < NODES; j++) {
      const p = nodePos(i, j);
      const corner: [number, number, number] = [p.x + ROAD_W / 2 + 1.1, 0.16, p.z + ROAD_W / 2 + 1.1];
      signs.push(
        <group key={`${i},${j}`} position={corner}>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 3, 8]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          <Sign lines={[STREETS[j]]} size={[2.4, 0.42]} position={[-1.2, 2.85, 0]} bg="#22c55e" fg="#ffffff" border="#ffffff" />
          <Sign lines={[STREETS[j]]} size={[2.4, 0.42]} position={[-1.2, 2.85, -0.01]} rotation={[0, Math.PI, 0]} bg="#22c55e" fg="#ffffff" border="#ffffff" />
          <group rotation-y={Math.PI / 2}>
            <Sign lines={[AVENUES[i]]} size={[2.4, 0.42]} position={[1.2, 2.4, 0]} bg="#4f8ef7" fg="#ffffff" border="#ffffff" />
            <Sign lines={[AVENUES[i]]} size={[2.4, 0.42]} position={[1.2, 2.4, -0.01]} rotation={[0, Math.PI, 0]} bg="#4f8ef7" fg="#ffffff" border="#ffffff" />
          </group>
        </group>,
      );
    }
  return <group>{signs}</group>;
}

function Lamps() {
  const spots = useMemo(() => {
    const out: [number, number][] = [];
    for (let k = 0; k < 9; k++) {
      const c = lotCenter(k % 3, Math.floor(k / 3));
      const e = LOT / 2 + SIDEWALK - 0.5;
      out.push([c.x - e, c.z - e], [c.x + e, c.z + e]);
    }
    return out;
  }, []);
  return (
    <group>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0.16, z]}>
          <mesh position={[0, 1.9, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 3.8, 8]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          <mesh position={[0, 3.9, 0]}>
            <sphereGeometry args={[0.28, 16, 12]} />
            <meshStandardMaterial color="#fff6dd" emissive="#ffd27a" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Trees() {
  const trees = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let k = 0; k < 9; k++) {
      const c = lotCenter(k % 3, Math.floor(k / 3));
      const e = LOT / 2 - 1.2;
      out.push([c.x - e, c.z + e, k], [c.x + e, c.z - e, k + 3]);
    }
    return out;
  }, []);
  return (
    <group>
      {trees.map(([x, z, r], i) => (
        <Model key={i} url={TREE} size={3.6} position={[x, 0.17, z]} rotation={r} />
      ))}
    </group>
  );
}

/** Smoothly follows the live pose of the walker (for the navigator and spectators). */
function WalkerMarker({ pose, name, big }: { pose: Pose; name: string; big: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.x = THREE.MathUtils.damp(g.position.x, pose.x, 8, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, pose.z, 8, dt);
    const d = Math.atan2(Math.sin(pose.yaw - g.rotation.y), Math.cos(pose.yaw - g.rotation.y));
    g.rotation.y += d * Math.min(1, dt * 8);
  });
  return (
    <group ref={ref} position={[pose.x, 0.17, pose.z]} rotation-y={pose.yaw}>
      {big && <WalkerRing />}
      <group scale={big ? 3.2 : 1}>
        {/* Avatar faces +z by default; the walker faces -z at yaw 0. */}
        <group rotation-y={Math.PI}>
          <Avatar role="builder" name={name} label={false} />
        </group>
        <mesh position={[0, 0.05, -0.9]} rotation-x={-Math.PI / 2}>
          <coneGeometry args={[0.35, 0.8, 3]} />
          <meshBasicMaterial color="#22c55e" />
        </mesh>
      </group>
      <Html position={[0, big ? 5.2 : 2.2, 0]} center distanceFactor={big ? 40 : 10} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-full border-2 border-ink bg-sky px-2.5 py-0.5 font-display text-sm font-semibold text-ink shadow-[2px_2px_0_#2d3748]">🚶 {name}</div>
      </Html>
    </group>
  );
}

/** A pulsing ring under the walker so the navigator finds them on the map at a glance. */
function WalkerRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.12);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
      <ringGeometry args={[2.4, 3.1, 40]} />
      <meshBasicMaterial color="#22c55e" toneMapped={false} />
    </mesh>
  );
}

function Beacon({ place }: { place: Place }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(clock.elapsedTime * 3) * 0.1;
  });
  return (
    <group position={[place.door.x, 0, place.door.z]}>
      <mesh ref={ref} position={[0, 14, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 28, 24, 1, true]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Html position={[0, 9, 0]} center distanceFactor={45} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div aria-label="Destination" className="rounded-full border-2 border-ink bg-sun px-3 py-1 text-xl text-ink shadow-[3px_3px_0_#2d3748]">⭐</div>
      </Html>
    </group>
  );
}

export interface CityViewProps {
  town: Town;
  /** The walker's pose: local prediction for the walker, server/stream for everyone else. */
  pose: Pose;
  view: Role | 'overview';
  interactive: boolean;
  destination?: string | null;
  /** Show the suggested route on the navigator's map (easy mode). */
  showRoute?: boolean;
  walkerName?: string;
  onMove?(p: Pose): void;
  onLockChange?(locked: boolean): void;
  className?: string;
}

function CityContents(p: CityViewProps) {
  const dest = p.destination ? p.town.places.find((x) => x.id === p.destination) : undefined;
  const route = useMemo(() => {
    if (!p.showRoute || !dest) return null;
    const plan = planRoute(p.town, p.pose, dest.id);
    if (!plan) return null;
    const pts = [new THREE.Vector3(p.pose.x, 0.6, p.pose.z), ...plan.nodes.map((n) => new THREE.Vector3(nodePos(...parseNode(n)).x, 0.6, nodePos(...parseNode(n)).z)), new THREE.Vector3(dest.door.x, 0.6, dest.door.z)];
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.showRoute, dest?.id, Math.round(p.pose.x / 4), Math.round(p.pose.z / 4), Math.round(p.pose.yaw * 2)]);
  const walker = p.view === 'builder';
  const startPose = useRef(p.pose);
  return (
    <>
      {walker && p.interactive ? (
        <FirstPersonRig
          position={[startPose.current.x, 1.65, startPose.current.z]}
          yaw={startPose.current.yaw}
          pitch={-0.05}
          pitchMin={-1.2}
          pitchMax={0.9}
          walk={{ speed: 5.5, run: 9.5, eye: 1.65, radius: 0.4, collide: (q) => collide(q), onPose: p.onMove }}
          onLockChange={p.onLockChange}
        />
      ) : walker ? (
        <FollowCamera pose={p.pose} />
      ) : (
        <OrbitControls makeDefault target={[0, 0, 10]} minDistance={18} maxDistance={140} maxPolarAngle={1.15} enableDamping />
      )}
      <SkyDome />
      <fog attach="fog" args={['#e8f4fb', 70, 230]} />
      <hemisphereLight args={['#dff2ff', '#8fcf7e', 0.7]} />
      <directionalLight position={[40, 60, 25]} intensity={2.2} color="#fff1d6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.04} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-far={200} />
      <SoftIBL intensity={0.6} />
      <Ground />
      {p.town.places.map((pl) => (
        <Building key={pl.id} place={pl} />
      ))}
      {p.town.lights.map((n) => {
        const np = nodePos(...parseNode(n));
        return <Model key={n} url="/models/traffic_light.glb" size={4.6} position={[np.x - ROAD_W / 2 - 0.9, 0.16, np.z - ROAD_W / 2 - 0.9]} rotation={Math.PI / 4} />;
      })}
      <Model url="/models/bus_stop.glb" size={3.8} position={[p.town.busStop.x, 0.16, p.town.busStop.z]} />
      <StreetSigns />
      <Lamps />
      <Trees />
      <TownLife town={p.town} />
      {[
        [-60, 38, -30, 1.4],
        [10, 44, -70, 1.8],
        [70, 40, 10, 1.2],
        [-20, 46, 60, 1.6],
      ].map(([x, y, z, s], i) => (
        <Cloud key={i} position={[x, y, z]} scale={s} speed={0.6 + i * 0.15} />
      ))}
      {!walker && <WalkerMarker pose={p.pose} name={p.walkerName ?? 'Walker'} big={p.view === 'guide'} />}
      {!walker && dest && <Beacon place={dest} />}
      {route && <Line points={route} color="#ffb703" lineWidth={5} dashed dashSize={2} gapSize={1.2} />}
      {!walker && (
        <Html position={[EXTENT + 5, 1, -EXTENT - 5]} center distanceFactor={60} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="rounded-full border-2 border-ink bg-white px-3 py-1 font-display text-lg font-bold shadow-[2px_2px_0_#2d3748]">N ↑</div>
        </Html>
      )}
      <PostFx ao={false} bloom={0.4} vignette={0.3} />
    </>
  );
}

/** Spectators watching the walker's view (demo screens) ride along behind their eyes. */
function FollowCamera({ pose }: { pose: Pose }) {
  useFrame(({ camera }, dt) => {
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pose.x, 6, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, pose.z, 6, dt);
    camera.position.y = 1.65;
    const cur = camera.rotation.y;
    const d = Math.atan2(Math.sin(pose.yaw - cur), Math.cos(pose.yaw - cur));
    camera.rotation.set(-0.05, cur + d * Math.min(1, dt * 6), 0, 'YXZ');
  });
  return null;
}

export function CityScene(props: CityViewProps) {
  return (
    <Canvas className={props.className} events={centerRayEvents} camera={{ fov: props.view === 'builder' ? 70 : 45, near: 0.1, far: 600, position: [0, 92, 66] }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
      <Suspense fallback={<Html center>Building the town…</Html>}>
        <CityContents {...props} />
      </Suspense>
    </Canvas>
  );
}
