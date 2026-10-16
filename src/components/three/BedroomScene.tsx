import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { canReach, collideRoom, FURNITURE, itemName, ROOM_D, ROOM_W, spotById, type BedroomItem } from '@shared/bedroom';
import type { Pose } from '@shared/city';
import type { Role } from '@shared/types';
import { centerRayEvents, clickInteracts, FirstPersonRig } from './controls';
import { detectQuality, Dust, LightShaft, PostFx, SoftIBL } from './env';
import { Box, INK, OpenShelf, Plant, Poster, RoomShellBox, usePatternTexture, usePlankTexture, WallClock, WindowPane } from './furniture';
import { Avatar, ItemModel } from './models';

/**
 * Messy Bedroom: real furniture with real hiding places (under the bed, on
 * top of the wardrobe, inside the toy box, behind the curtain). The seeker
 * walks it in first person; the owner sees a cut-away dollhouse view.
 */

const f = (id: string) => FURNITURE.find((x) => x.id === id)!;

function Bed() {
  const b = f('bed');
  const quilt = usePatternTexture('#add8e6', '#8bc4d6', 'stripes', [3, 3]);
  return (
    <group position={[b.x, 0, b.z]}>
      {/* legs: leave a dark gap underneath */}
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * (b.w / 2 - 0.08), 0.15, sz * (b.d / 2 - 0.08)]}>
          <boxGeometry args={[0.1, 0.3, 0.1]} />
          <meshStandardMaterial color="#8a5a3b" />
        </mesh>
      )))}
      <Box size={[b.w, 0.14, b.d]} position={[0, 0.36, 0]} color="#a8733f" radius={0.04} />
      <Box size={[b.w - 0.08, 0.2, b.d - 0.1]} position={[0, 0.52, 0.02]} color="#fff9f0" radius={0.07} />
      <mesh position={[0, 0.63, 0.35]} castShadow receiveShadow>
        <boxGeometry args={[b.w - 0.02, 0.06, b.d * 0.62]} />
        <meshStandardMaterial map={quilt} roughness={0.95} />
      </mesh>
      {/* headboard against the north wall */}
      <Box size={[b.w + 0.1, 1.1, 0.12]} position={[0, 0.65, -b.d / 2 - 0.02]} color="#9b7bf2" radius={0.06} />
      {/* two pillows with a gap between them */}
      {[-0.5, 0.5].map((x) => (
        <Box key={x} size={[0.62, 0.16, 0.42]} position={[x, 0.7, -b.d / 2 + 0.32]} color="#ffffff" radius={0.07} />
      ))}
    </group>
  );
}

function Nightstand() {
  const n = f('nightstand');
  return (
    <group position={[n.x, 0, n.z]}>
      <Box size={[n.w, n.h, n.d]} position={[0, n.h / 2, 0]} color="#e9b88a" radius={0.04} />
      <mesh position={[0, n.h * 0.55, n.d / 2 + 0.005]}>
        <boxGeometry args={[n.w - 0.1, 0.18, 0.01]} />
        <meshStandardMaterial color="#c98f5a" />
      </mesh>
      {/* bedside lamp */}
      <group position={[-0.12, n.h, -0.06]}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.03, 0.06, 0.24, 12]} />
          <meshStandardMaterial color={INK} />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <cylinderGeometry args={[0.09, 0.15, 0.18, 20, 1, true]} />
          <meshStandardMaterial color="#ffe8a8" emissive="#ffcf70" emissiveIntensity={1.4} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 0.3, 0]} intensity={2.2} distance={3} color="#ffd38a" />
      </group>
    </group>
  );
}

function Wardrobe() {
  const w = f('wardrobe');
  return (
    <group position={[w.x, 0, w.z]}>
      <Box size={[w.w, w.h, w.d]} position={[0, w.h / 2, 0]} color="#c98f5a" radius={0.04} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[-w.w / 2 - 0.005, w.h / 2 + 0.05, s * w.d * 0.25]}>
            <boxGeometry args={[0.01, w.h - 0.3, w.d / 2 - 0.08]} />
            <meshStandardMaterial color="#e0a974" />
          </mesh>
          <mesh position={[-w.w / 2 - 0.03, w.h / 2, s * 0.08]}>
            <sphereGeometry args={[0.035, 10, 8]} />
            <meshStandardMaterial color="#ffd166" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DeskAndChair() {
  const d = f('desk');
  const c = f('chair');
  return (
    <group>
      <group position={[d.x, 0, d.z]}>
        <Box size={[d.w, 0.05, d.d]} position={[0, d.h, 0]} color="#e9b88a" radius={0.02} />
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (d.w / 2 - 0.05), d.h / 2, sz * (d.d / 2 - 0.05)]}>
            <boxGeometry args={[0.05, d.h, 0.05]} />
            <meshStandardMaterial color={INK} />
          </mesh>
        )))}
        {/* laptop */}
        <group position={[0.05, d.h + 0.03, -0.3]} rotation-y={Math.PI / 2}>
          <Box size={[0.42, 0.02, 0.3]} position={[0, 0, 0]} color="#d1d5db" radius={0.01} />
          <group position={[0, 0.01, -0.15]} rotation-x={-1.25}>
            <Box size={[0.42, 0.02, 0.3]} position={[0, 0, -0.15]} color="#d1d5db" radius={0.01} />
            <mesh position={[0, 0.012, -0.15]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.38, 0.26]} />
              <meshStandardMaterial color="#4f8ef7" emissive="#4f8ef7" emissiveIntensity={0.9} toneMapped={false} />
            </mesh>
          </group>
        </group>
      </group>
      <group position={[c.x, 0, c.z]}>
        <Box size={[c.w, 0.06, c.d]} position={[0, 0.46, 0]} color="#ff9f43" radius={0.03} />
        <Box size={[0.06, 0.5, c.d]} position={[c.w / 2 - 0.03, 0.74, 0]} color="#ff9f43" radius={0.03} />
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.2, 0.23, sz * 0.2]}>
            <cylinderGeometry args={[0.02, 0.02, 0.46, 6]} />
            <meshStandardMaterial color={INK} />
          </mesh>
        )))}
      </group>
    </group>
  );
}

function Shelf() {
  const s = f('bookshelf');
  return (
    <group position={[s.x, 0, s.z]} rotation-y={Math.PI}>
      {/* boards line up with the "top shelf" (1.6 m) and "bottom shelf" (0.4 m) hiding spots */}
      <OpenShelf w={s.w} h={s.h} d={s.d} boards={[0.4, 1.0, 1.6]} color="#b98a63" />
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-0.55 + i * 0.075, 1.0 + 0.14 + (i % 3) * 0.015, 0]} castShadow>
          <boxGeometry args={[0.06, 0.26 + (i % 3) * 0.03, 0.22]} />
          <meshStandardMaterial color={['#ff6b6b', '#4f8ef7', '#ffd166', '#3fbf7f'][i % 4]} />
        </mesh>
      ))}
    </group>
  );
}

function ToyBox({ open, interactive, near, onToggle }: { open: boolean; interactive: boolean; near: boolean; onToggle(): void }) {
  const t = f('toybox');
  const lid = useRef<THREE.Group>(null);
  const hover = useRef(false);
  useFrame((_, dt) => {
    if (lid.current) lid.current.rotation.x = THREE.MathUtils.damp(lid.current.rotation.x, open ? -1.9 : 0, 6, dt);
  });
  return (
    <group position={[t.x, 0, t.z]}>
      {/* open-topped box */}
      {[
        [0, 0.03, 0, t.w, 0.06, t.d],
        [0, t.h / 2, -t.d / 2 + 0.03, t.w, t.h, 0.06],
        [0, t.h / 2, t.d / 2 - 0.03, t.w, t.h, 0.06],
        [-t.w / 2 + 0.03, t.h / 2, 0, 0.06, t.h, t.d],
        [t.w / 2 - 0.03, t.h / 2, 0, 0.06, t.h, t.d],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#ff6b6b" roughness={0.6} />
        </mesh>
      ))}
      <group ref={lid} position={[0, t.h, t.d / 2]}>
        <group
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (!interactive || !clickInteracts()) return;
            e.stopPropagation();
            onToggle();
          }}
          onPointerOver={() => {
            hover.current = true;
            if (interactive) document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            hover.current = false;
            document.body.style.cursor = '';
          }}
        >
          <Box size={[t.w + 0.04, 0.06, t.d + 0.04]} position={[0, 0.03, -t.d / 2]} color="#ffd166" radius={0.03} />
          <mesh position={[0, 0.07, -t.d / 2]}>
            <sphereGeometry args={[0.08, 12, 10]} />
            <meshStandardMaterial color="#9b7bf2" />
          </mesh>
        </group>
      </group>
      {interactive && near && (
        <Html position={[0, t.h + 0.45, 0]} center distanceFactor={3.2} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-full border-2 border-ink bg-sun px-2 py-0.5 font-display text-xs font-semibold text-ink shadow-[2px_2px_0_#2d3748]">{open ? 'Click the lid to close' : 'Click the lid to open'}</div>
        </Html>
      )}
    </group>
  );
}

function Beanbag() {
  const b = f('beanbag');
  return (
    <mesh position={[b.x, 0.28, b.z]} scale={[1, 0.55, 1]} castShadow receiveShadow>
      <sphereGeometry args={[0.55, 28, 20]} />
      <meshStandardMaterial color="#22c55e" roughness={0.9} />
    </mesh>
  );
}

function WestWindow() {
  const w = f('window');
  return (
    <group>
      <group position={[-ROOM_W / 2 + 0.01, 1.75, w.z]} rotation-y={Math.PI / 2}>
        <WindowPane width={1.5} height={1.25} curtains={null} />
      </group>
      {/* sill */}
      <Box size={[0.32, 0.06, 1.9]} position={[-ROOM_W / 2 + 0.16, 1.05, w.z]} color="#ffffff" radius={0.02} />
      {/* curtains: the right one hangs over the end of the sill */}
      <mesh position={[-ROOM_W / 2 + 0.3, 1.75, w.z - 1.0]} castShadow>
        <boxGeometry args={[0.07, 1.9, 0.5]} />
        <meshStandardMaterial color="#f7a8b8" roughness={0.95} />
      </mesh>
      {/* a sheer curtain: things behind it are hidden, but you can just make them out */}
      <mesh position={[-ROOM_W / 2 + 0.3, 1.75, w.z + 0.55]}>
        <boxGeometry args={[0.04, 1.9, 0.62]} />
        <meshStandardMaterial color="#f7a8b8" roughness={0.95} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <LightShaft position={[-ROOM_W / 2 + 0.4, 2.3, w.z]} rotation={[0, 0, 0.75]} width={1.3} length={3.6} />
    </group>
  );
}

function LostItem({ item, highlight, interactive, reachable, onPick }: { item: BedroomItem; highlight: 'target' | null; interactive: boolean; reachable: boolean; onPick(): void }) {
  const spot = spotById(item.spot)!;
  const hoverRef = useRef(false);
  const setHovered = (v: boolean) => (hoverRef.current = v);
  const ring = useRef<THREE.Mesh>(null);
  const label = useRef<HTMLDivElement>(null);
  useFrame(({ clock }) => {
    if (ring.current) ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.1);
    if (label.current) label.current.style.opacity = hoverRef.current ? '1' : '0';
  });
  return (
    <group position={spot.pos}>
      <group
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (!interactive) return;
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!interactive || !clickInteracts()) return;
          e.stopPropagation();
          if (reachable) onPick();
        }}
      >
        <ItemModel kind={item.kind} color="white" size="regular" look={{ glow: highlight ? '#ffb703' : null }} />
      </group>
      {highlight && (
        <>
          <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
            <ringGeometry args={[0.2, 0.26, 32]} />
            <meshBasicMaterial color="#ffd166" toneMapped={false} />
          </mesh>
          <Html position={[0, 0.55, 0]} center distanceFactor={7} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div className="animate-bounce whitespace-nowrap rounded-full border-2 border-ink bg-sun px-2.5 py-0.5 font-display text-sm font-bold text-ink shadow-[2px_2px_0_#2d3748]">⭐ {itemName(item.kind)}</div>
          </Html>
        </>
      )}
      {interactive && (
        <Html position={[0, 0.42, 0]} center distanceFactor={3.2} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={label} style={{ opacity: 0 }} className="whitespace-nowrap rounded-full border-2 border-ink bg-white px-2 py-0.5 font-display text-xs font-semibold text-ink shadow-[2px_2px_0_#2d3748] transition-opacity">
            {itemName(item.kind)} · {reachable ? 'click to pick up' : 'walk closer'}
          </div>
        </Html>
      )}
    </group>
  );
}

function SeekerMarker({ pose, name }: { pose: Pose; name: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.x = THREE.MathUtils.damp(g.position.x, pose.x, 10, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, pose.z, 10, dt);
    const d = Math.atan2(Math.sin(pose.yaw - g.rotation.y), Math.cos(pose.yaw - g.rotation.y));
    g.rotation.y += d * Math.min(1, dt * 10);
  });
  return (
    <group ref={ref} position={[pose.x, 0, pose.z]} rotation-y={pose.yaw}>
      <group rotation-y={Math.PI} scale={0.95}>
        <Avatar role="builder" name={name} />
      </group>
      <mesh position={[0, 0.03, -0.55]} rotation-x={-Math.PI / 2}>
        <coneGeometry args={[0.18, 0.4, 3]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
    </group>
  );
}

function FollowEyes({ pose }: { pose: Pose }) {
  useFrame(({ camera }, dt) => {
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pose.x, 8, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, pose.z, 8, dt);
    camera.position.y = 1.5;
    const cur = camera.rotation.y;
    const d = Math.atan2(Math.sin(pose.yaw - cur), Math.cos(pose.yaw - cur));
    camera.rotation.set(-0.25, cur + d * Math.min(1, dt * 8), 0, 'YXZ');
  });
  return null;
}

export interface BedroomViewProps {
  items: BedroomItem[];
  found: string[];
  open: string[];
  pose: Pose;
  view: Role | 'overview';
  interactive: boolean;
  targetId?: string | null;
  names?: Partial<Record<Role, string>>;
  onMove?(p: Pose): void;
  onPick?(id: string): void;
  onOpen?(id: string, open: boolean): void;
  onLockChange?(locked: boolean): void;
  className?: string;
}

function BedroomContents(p: BedroomViewProps) {
  const quality = useMemo(detectQuality, []);
  const floor = usePlankTexture('#e8c49a', '#c99c6c', [7, 6]);
  const rug = usePatternTexture('#e6e6fa', '#c9b8f5', 'dots', [3, 2]);
  const seeker = p.view === 'builder';
  const startPose = useRef(p.pose);
  const near = (id: string) => {
    const fu = f(id);
    return Math.hypot(p.pose.x - fu.x, p.pose.z - fu.z) < 2.4;
  };
  return (
    <>
      {seeker && p.interactive ? (
        <FirstPersonRig
          position={[startPose.current.x, 1.5, startPose.current.z]}
          yaw={startPose.current.yaw}
          pitch={-0.3}
          pitchMin={-1.35}
          pitchMax={0.9}
          walk={{ speed: 2.6, run: 4.2, eye: 1.5, collide: (q) => collideRoom(q), onPose: p.onMove }}
          onLockChange={p.onLockChange}
        />
      ) : seeker ? (
        <FollowEyes pose={p.pose} />
      ) : (
        <OrbitControls makeDefault target={[0, 0.8, 0]} minDistance={5} maxDistance={15} maxPolarAngle={1.2} enableDamping />
      )}
      <hemisphereLight args={['#fff4e6', '#c9a27e', 0.55]} />
      <ambientLight intensity={0.16} />
      <directionalLight position={[-7, 6, -0.6]} intensity={1.7} color="#ffe2b8" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} />
      <SoftIBL intensity={0.75} />
      <RoomShellBox w={ROOM_W} d={ROOM_D} h={2.9} wall="#e6e6fa" wallLow="#c9b8f5" floorTex={floor} ceiling={seeker} />
      <mesh rotation-x={-Math.PI / 2} position={[f('rug').x, 0.008, f('rug').z]} receiveShadow>
        <planeGeometry args={[f('rug').w, f('rug').d]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      <Bed />
      <Nightstand />
      <Wardrobe />
      <DeskAndChair />
      <Shelf />
      <ToyBox open={p.open.includes('toybox')} interactive={p.interactive} near={p.interactive && near('toybox')} onToggle={() => p.onOpen?.('toybox', !p.open.includes('toybox'))} />
      <Beanbag />
      <WestWindow />
      <Plant position={[3.9, 0, -3.1]} scale={1.1} />
      <Poster lines={['★ GAME ON ★']} position={[1.2, 1.9, -ROOM_D / 2 + 0.03]} size={[1.0, 0.7]} bg="#ffd166" />
      <Poster lines={['SPACE', '🚀']} position={[ROOM_W / 2 - 0.03, 1.8, 1.2]} rotation={-Math.PI / 2} size={[0.8, 1.0]} bg="#add8e6" />
      <WallClock position={[-1.2, 2.3, -ROOM_D / 2 + 0.05]} />
      {/* the door, where the owner stands (not in the cut-away dollhouse view) */}
      {seeker && (
        <group position={[1.4, 0, ROOM_D / 2 - 0.02]} rotation-y={Math.PI}>
          <Box size={[1.0, 2.1, 0.06]} position={[0, 1.05, 0]} color="#c98f5a" radius={0.03} />
        </group>
      )}
      {seeker && (
        <group position={[1.4, 0, ROOM_D / 2 - 0.45]} rotation-y={Math.PI}>
          <Avatar role="guide" name={p.names?.guide ?? 'Owner'} />
        </group>
      )}
      <mesh position={[0, 2.88, 0]} rotation-x={Math.PI / 2}>
        <circleGeometry args={[0.35, 32]} />
        <meshStandardMaterial color="#fff6dd" emissive="#ffe4a8" emissiveIntensity={seeker ? 1.5 : 0.2} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 2.5, 0]} intensity={3} distance={8} color="#ffe2b0" />
      {p.items
        .filter((i) => !p.found.includes(i.id))
        .map((i) => (
          <LostItem key={i.id} item={i} highlight={p.targetId === i.id ? 'target' : null} interactive={p.interactive} reachable={canReach(p.pose, i)} onPick={() => p.onPick?.(i.id)} />
        ))}
      {!seeker && <SeekerMarker pose={p.pose} name={p.names?.builder ?? 'Seeker'} />}
      <Dust area={[8, 2.6, 6]} center={[0, 1.4, 0]} count={160} />
      <PostFx quality={quality} />
    </>
  );
}

export function BedroomScene(props: BedroomViewProps) {
  return (
    <Canvas className={props.className} shadows dpr={[1, 2]} events={centerRayEvents} camera={{ fov: props.view === 'builder' ? 70 : 45, near: 0.05, far: 80, position: [0, 9, 8.5] }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#efe6f6']} />
      <Suspense fallback={<Html center>Tidying up…</Html>}>
        <BedroomContents {...props} />
      </Suspense>
    </Canvas>
  );
}
