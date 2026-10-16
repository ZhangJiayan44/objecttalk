import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AVATAR_Z, cellToWorld, TABLE_Y, VIEWPOINT } from '@shared/room';
import { entityLabel, freeCells } from '@shared/spatial';
import type { Palette } from '@shared/levels';
import { cellKey, sameCell, type Cell, type Role, type SceneObject, type SceneState } from '@shared/types';
import { centerRayEvents, clickInteracts, FirstPersonRig } from './controls';
import { detectQuality, PostFx, SoftIBL } from './env';
import { StudyRoom } from './furniture';
import { PetShopRoom, StudyDressing } from './sets';
import { Avatar, ItemModel, LandmarkModel, Table } from './models';

export type ViewMode = Role | 'overview';

export interface Pointer {
  objectId: string | null;
  cell: Cell | null;
}

export interface RoomSceneProps {
  scene: SceneState;
  view: ViewMode;
  heldId?: string | null;
  /** Secret overlays for the guide / spectators. */
  target?: { findId?: string; itemId?: string; cell?: Cell } | null;
  /** Where the builder is pointing, shown to everyone else. */
  pointer?: Pointer | null;
  /** The local builder's own hover (drives glow + held preview). */
  localHover?: Pointer | null;
  interactive?: boolean;
  onHover?: (p: Pointer) => void;
  onPick?: (objectId: string) => void;
  onPlace?: (cell: Cell) => void;
  onDrop?: () => void;
  wrong?: { objectId?: string; key: number } | null;
  names?: Partial<Record<Role, string>>;
  labels?: boolean;
  className?: string;
  /** Slowly orbit the overview camera (landing page hero). */
  autoRotate?: boolean;
  /** First-person view for players (mouse-look, crosshair). Spectators and replays orbit. */
  firstPerson?: boolean;
  /** Capture the mouse on click (the local player). Off: drag to look. */
  capture?: boolean;
  /** Agent-made levels repaint the room. */
  palette?: Palette;
  sign?: string;
  /** The room around the table (the table itself never moves). */
  set?: 'study' | 'petshop';
  missionKey?: string;
  onLockChange?(locked: boolean): void;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = THREE.MathUtils.damp;

function CameraRig({ view, autoRotate = false }: { view: ViewMode; autoRotate?: boolean }) {
  const { camera, size } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const base = view === 'overview' ? new THREE.Vector3(4.6, 3.9, 0.01) : new THREE.Vector3(...VIEWPOINT[view].position);
    const target = new THREE.Vector3(0, 0.62, 0);
    // Pull back on portrait screens so the whole table stays visible on phones.
    const k = aspect < 1.25 ? Math.min(2.1, 1.35 / aspect) : 1;
    camera.position.copy(target.clone().add(base.sub(target).multiplyScalar(k)));
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [camera, view, size.width, size.height]);
  const az = view === 'builder' ? 0 : view === 'guide' ? Math.PI : Math.PI / 2;
  const spread = view === 'overview' ? 1.2 : 0.55;
  const free = autoRotate && view === 'overview';
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      autoRotate={free}
      autoRotateSpeed={0.55}
      enableZoom={!free}
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      minDistance={2.4}
      maxDistance={8}
      minPolarAngle={0.3}
      maxPolarAngle={1.32}
      minAzimuthAngle={free ? -Infinity : wrapAngle(az - spread)}
      maxAzimuthAngle={free ? Infinity : wrapAngle(az + spread)}
    />
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#fff4e6', '#c9a27e', 0.55]} />
      <ambientLight intensity={0.18} />
      {/* afternoon sun through the east window */}
      <directionalLight
        position={[7, 6.5, -1.5]}
        intensity={2.1}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
      />
      <SoftIBL intensity={0.8} />
    </>
  );
}

function Ring({ cell, color, radius = 0.24, pulse = true, y = 0.008 }: { cell: Cell; color: string; radius?: number; pulse?: boolean; y?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current && pulse) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 4) * 0.08);
  });
  const [x, , z] = cellToWorld(cell);
  return (
    <mesh ref={ref} position={[x, TABLE_Y + y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius * 0.78, radius, 40]} />
      <meshBasicMaterial color={color} transparent opacity={0.95} toneMapped={false} />
    </mesh>
  );
}

function Arrow({ cell, color, height = 0.62 }: { cell: Cell; color: string; height?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = TABLE_Y + height + Math.sin(clock.elapsedTime * 3) * 0.05;
      ref.current.rotation.y = clock.elapsedTime * 1.5;
    }
  });
  const [x, , z] = cellToWorld(cell);
  return (
    <group ref={ref} position={[x, TABLE_Y + height, z]}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.07, 0.16, 4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

function SceneItem({
  obj,
  held,
  previewCell,
  hovered,
  interactive,
  onHover,
  onPick,
  onDrop,
  shakeKey,
  label,
}: {
  obj: SceneObject;
  held: boolean;
  previewCell: Cell | null;
  hovered: boolean;
  interactive: boolean;
  onHover?: (p: Pointer) => void;
  onPick?: (id: string) => void;
  onDrop?: () => void;
  shakeKey: number;
  label: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const shakeUntil = useRef(0);
  useEffect(() => {
    if (shakeKey) shakeUntil.current = performance.now() + 600;
  }, [shakeKey]);
  const home = held && previewCell ? previewCell : obj.cell;
  const [tx, , tz] = cellToWorld(home);
  useFrame(({ clock }, dt) => {
    const g = ref.current;
    if (!g) return;
    const lift = held ? 0.3 + Math.sin(clock.elapsedTime * 3.2) * 0.025 : hovered ? 0.04 : 0;
    g.position.x = damp(g.position.x, tx, 12, dt);
    g.position.z = damp(g.position.z, tz, 12, dt);
    g.position.y = damp(g.position.y, TABLE_Y + lift, 10, dt);
    const shaking = performance.now() < shakeUntil.current;
    g.rotation.z = shaking ? Math.sin(performance.now() * 0.06) * 0.18 : damp(g.rotation.z, 0, 10, dt);
  });
  const [x, , z] = cellToWorld(obj.cell);
  const handlers = interactive
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          if (!held) onHover?.({ objectId: obj.id, cell: null });
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          if (!held) onHover?.({ objectId: null, cell: null });
          document.body.style.cursor = '';
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 8 || !clickInteracts()) return;
          e.stopPropagation();
          if (held) onDrop?.();
          else onPick?.(obj.id);
        },
      }
    : {};
  return (
    <group ref={ref} position={[x, TABLE_Y, z]} {...handlers}>
      <group rotation-y={obj.yaw}>
        <ItemModel kind={obj.kind} color={obj.color} size={obj.size} look={{ glow: hovered && !held ? '#4f8ef7' : held ? '#22c55e' : null }} />
      </group>
      {label && (hovered || held) && (
        <Html position={[0, 0.5, 0]} center distanceFactor={3.2} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div className="flex flex-col items-center whitespace-nowrap rounded-2xl border-2 border-ink bg-white px-2.5 py-0.5 font-display text-ink shadow-[2px_2px_0_#2d3748]">
            <span className="text-sm leading-tight font-semibold">{entityLabel({ ...obj, landmark: false })}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function Slots({ scene, heldId, hoverCell, onHover, onPlace }: { scene: SceneState; heldId: string; hoverCell: Cell | null; onHover?: (p: Pointer) => void; onPlace?: (c: Cell) => void }) {
  const cells = useMemo(() => freeCells(scene, heldId), [scene, heldId]);
  return (
    <group>
      {cells.map((cell) => {
        const [x, , z] = cellToWorld(cell);
        const active = sameCell(cell, hoverCell);
        return (
          <mesh
            key={cellKey(cell)}
            position={[x, TABLE_Y + 0.006, z]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover?.({ objectId: null, cell });
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => (document.body.style.cursor = '')}
            onClick={(e) => {
              if (e.delta > 8 || !clickInteracts()) return;
              e.stopPropagation();
              onPlace?.(cell);
            }}
          >
            <cylinderGeometry args={[active ? 0.23 : 0.2, active ? 0.23 : 0.2, 0.012, 36]} />
            <meshBasicMaterial color={active ? '#22c55e' : '#8bc4d6'} transparent opacity={active ? 0.75 : 0.45} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function PointerMarker({ pointer, scene }: { pointer: Pointer; scene: SceneState }) {
  const cell = pointer.cell ?? scene.objects.find((o) => o.id === pointer.objectId)?.cell ?? null;
  if (!cell) return null;
  const [x, , z] = cellToWorld(cell);
  return (
    <group>
      <Ring cell={cell} color="#4f8ef7" radius={0.28} y={0.012} />
      <Html position={[x, TABLE_Y + 0.7, z]} center distanceFactor={3.6} zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
        <div className="animate-bounce whitespace-nowrap rounded-full border-2 border-ink bg-sky px-2 py-0.5 font-display text-sm font-semibold text-ink shadow-[2px_2px_0_#2d3748]">👆 partner</div>
      </Html>
    </group>
  );
}

/** Dev-only: lets UI tests click real 3D objects by projecting them to screen space. */
function DevProbe({ scene }: { scene: SceneState }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __otProject?: (id: string | { c: number; r: number }) => { x: number; y: number } | null };
    w.__otProject = (id) => {
      const cell = typeof id === 'string' ? scene.objects.find((o) => o.id === id)?.cell : id;
      if (!cell) return null;
      const [x, y, z] = cellToWorld(cell);
      const v = new THREE.Vector3(x, y + (typeof id === 'string' ? 0.12 : 0.01), z).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
  }, [camera, gl, scene]);
  return null;
}

function SceneContents(props: RoomSceneProps) {
  const { scene, view, heldId, target, pointer, localHover, interactive = false, onHover, onPick, onPlace, onDrop, wrong, names, labels = true, autoRotate, firstPerson, capture = false, missionKey, onLockChange, palette, sign, set = 'study' } = props;
  const fps = firstPerson && view !== 'overview';
  const quality = useMemo(detectQuality, []);
  const ghostSource = target?.itemId ? scene.objects.find((o) => o.id === target.itemId) : undefined;
  const hoverObj = interactive ? localHover?.objectId : pointer?.objectId;
  const hoverCell = interactive ? (localHover?.cell ?? null) : (pointer?.cell ?? null);
  return (
    <>
      {fps ? (
        <FirstPersonRig
          position={[0, 1.72, view === 'guide' ? -2.3 : 2.3]}
          yaw={view === 'guide' ? Math.PI : 0}
          pitch={-0.45}
          yawRange={1.35}
          pitchMin={-1.05}
          pitchMax={0.35}
          resetKey={missionKey}
          capture={capture}
          onLockChange={onLockChange}
        />
      ) : (
        <CameraRig view={view} autoRotate={autoRotate} />
      )}
      {import.meta.env.DEV && interactive && <DevProbe scene={scene} />}
      <Lights />
      {set === 'petshop' ? (
        <PetShopRoom />
      ) : (
        <>
          <StudyRoom palette={palette} sign={sign} />
          {!palette && <StudyDressing />}
        </>
      )}
      <Table />
      <PostFx quality={quality} />
      {scene.landmarks.map((l) => {
        const [x, y, z] = cellToWorld(l.cell);
        return (
          <group key={l.id} position={[x, y, z]}>
            <LandmarkModel kind={l.kind} />
          </group>
        );
      })}
      {scene.objects.map((o) => (
        <SceneItem
          key={o.id}
          obj={o}
          held={heldId === o.id}
          previewCell={heldId === o.id ? hoverCell : null}
          hovered={hoverObj === o.id}
          interactive={interactive}
          onHover={onHover}
          onPick={onPick}
          onDrop={onDrop}
          shakeKey={wrong?.objectId === o.id ? wrong.key : 0}
          label={labels}
        />
      ))}
      {interactive && heldId && <Slots scene={scene} heldId={heldId} hoverCell={hoverCell} onHover={onHover} onPlace={onPlace} />}
      {target?.findId &&
        (() => {
          const t = scene.objects.find((o) => o.id === target.findId);
          return t ? (
            <>
              <Ring cell={t.cell} color="#ffd166" radius={0.3} />
              <Arrow cell={t.cell} color="#ffb703" />
            </>
          ) : null;
        })()}
      {ghostSource && target?.cell && (
        <>
          {heldId !== ghostSource.id && <Ring cell={ghostSource.cell} color="#9b7bf2" radius={0.28} />}
          <Ring cell={target.cell} color="#ffd166" radius={0.3} />
          <Arrow cell={target.cell} color="#ffb703" height={0.72} />
          <group position={cellToWorld(target.cell)}>
            <group rotation-y={ghostSource.yaw}>
              <ItemModel kind={ghostSource.kind} color={ghostSource.color} size={ghostSource.size} look={{ ghost: true }} />
            </group>
          </group>
        </>
      )}
      {!interactive && pointer && (pointer.objectId || pointer.cell) && <PointerMarker pointer={pointer} scene={scene} />}
      {view !== 'guide' && (
        <group position={[0, 0, -AVATAR_Z]}>
          <Avatar role="guide" name={names?.guide ?? 'Guide'} />
        </group>
      )}
      {view !== 'builder' && (
        <group position={[0, 0, AVATAR_Z]} rotation-y={Math.PI}>
          <Avatar role="builder" name={names?.builder ?? 'Builder'} />
        </group>
      )}
    </>
  );
}

function Loader() {
  return (
    <Html center>
      <div className="clay-chip animate-pulse bg-white font-display">Loading the room…</div>
    </Html>
  );
}

export function RoomScene(props: RoomSceneProps) {
  return (
    <Canvas
      className={props.className}
      shadows
      dpr={[1, 2]}
      events={centerRayEvents}
      camera={{ fov: props.firstPerson ? 62 : 45, near: 0.05, far: 80, position: [0, 3, 4] }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      onPointerMissed={() => props.interactive && props.onHover?.({ objectId: null, cell: null })}
    >
      <color attach="background" args={['#f3dccb']} />
      <Suspense fallback={<Loader />}>
        <SceneContents {...props} />
      </Suspense>
    </Canvas>
  );
}
