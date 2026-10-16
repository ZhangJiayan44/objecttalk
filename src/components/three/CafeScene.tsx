import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAFE_COLS, TRAY_SLOTS } from '@shared/cafe';
import { getKind, kindsFor } from '@shared/catalog';
import type { Palette } from '@shared/levels';
import type { HoverEvent } from '@shared/protocol';
import type { Role, SceneObject, SceneState } from '@shared/types';
import { centerRayEvents, clickInteracts, FirstPersonRig } from './controls';
import { detectQuality, Dust, LightShaft, PostFx, Sign, SoftIBL, useTextTexture } from './env';
import { Box, PendantLamp, Plant, RoomShellBox, usePatternTexture, usePlankTexture, WindowPane, INK } from './furniture';
import { Avatar, ItemModel } from './models';
import { CafeDressing, MarketSet, NightMarketSet } from './stalls';

/**
 * Corner Cafe. The display case sits on the counter between the barista
 * (north, behind the counter) and the customer (south). Case cells:
 * c = 0..4 along x, r = 0 top shelf, 1 middle shelf, 2 bottom shelf (drinks).
 */

const COUNTER_H = 0.92;
/** Top of the counter slab: the case stands on it (sharing its plane made the base flicker). */
const COUNTER_TOP = COUNTER_H + 0.04;
const CASE_X = -0.5;
const CELL = 0.56;
const SHELF_Y = [COUNTER_TOP + 0.62, COUNTER_TOP + 0.34, COUNTER_TOP + 0.05];
const TRAY = { x: 2.3, z: 0.02 };

export const casePos = (c: number, r: number): [number, number, number] => [CASE_X + (c - (CAFE_COLS - 1) / 2) * CELL, SHELF_Y[r] ?? SHELF_Y[0], 0];
export const trayPos = (k: number): [number, number, number] => [TRAY.x + ((k % 3) - 1) * 0.27, COUNTER_H + 0.06, TRAY.z + (Math.floor(k / 3) - 0.5) * 0.24];

export interface CafeViewProps {
  scene: SceneState;
  tray: string[];
  view: Role | 'overview';
  interactive: boolean;
  /** Capture the mouse on click (the local player). */
  capture?: boolean;
  /** What the barista is pointing at (shown to the customer). */
  pointer?: HoverEvent | null;
  /** Ids on the customer's order (guide only), to highlight on the tray. */
  wanted?: Set<string> | null;
  onHover?(e: HoverEvent): void;
  onTray?(objectId: string, add: boolean): void;
  onServe?(): void;
  names?: Partial<Record<Role, string>>;
  missionKey?: string;
  shakeId?: { id?: string; key: number } | null;
  onLockChange?(locked: boolean): void;
  className?: string;
  level?: string;
  palette?: Palette;
  sign?: string;
  /** The place around the counter: a café, a farmers' market stall, or a night market. */
  look?: 'cafe' | 'market' | 'night';
}

function GlassCase({ look = 'cafe' }: { look?: CafeViewProps['look'] }) {
  const w = CAFE_COLS * CELL + 0.2;
  const trim = look === 'cafe' ? '#c98f5a' : WOOD[look][1];
  return (
    <group position={[CASE_X, COUNTER_TOP, 0]}>
      {/* base + shelves */}
      {[0.02, 0.3, 0.58].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} receiveShadow castShadow={i === 0}>
          <boxGeometry args={[w, 0.04, 0.62]} />
          <meshStandardMaterial color={i === 0 ? trim : '#ffffff'} roughness={0.3} transparent={i > 0} opacity={i > 0 ? 0.55 : 1} />
        </mesh>
      ))}
      {/* glass on the customer side only: the barista reaches in from the open back, like a real café case.
          It ends at the posts' inner faces, so no two surfaces share a plane (z-fighting flickers). */}
      <mesh position={[0, 0.46, 0.32]}>
        <boxGeometry args={[w - 0.03, 0.9, 0.012]} />
        <meshStandardMaterial color="#e8f7ff" roughness={0.05} metalness={0.1} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[(sx * w) / 2, 0.46, 0]}>
          <boxGeometry args={[0.03, 0.9, 0.64]} />
          <meshStandardMaterial color={trim} roughness={0.6} />
        </mesh>
      ))}
      {/* warm case light */}
      <pointLight position={[0, 0.8, 0]} intensity={2.2} distance={2.2} color="#fff0cf" />
    </group>
  );
}

const WOOD: Record<NonNullable<CafeViewProps['look']>, [string, string]> = { cafe: ['#c48e58', '#a8733f'], market: ['#7fb069', '#5e8f4c'], night: ['#b5523b', '#8e3b2a'] };

function Counter({ look = 'cafe' }: { look?: CafeViewProps['look'] }) {
  const wood = usePlankTexture(WOOD[look][0], WOOD[look][1], [3, 1]);
  return (
    <group>
      <mesh position={[0.3, COUNTER_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[7.2, COUNTER_H, 0.9]} />
        <meshStandardMaterial map={wood} roughness={0.7} />
      </mesh>
      <mesh position={[0.3, COUNTER_H + 0.02, 0]} receiveShadow>
        <boxGeometry args={[7.3, 0.04, 1.0]} />
        <meshStandardMaterial color="#f4ece1" roughness={0.35} />
      </mesh>
      {/* the tray */}
      <group position={[TRAY.x, COUNTER_H + 0.045, TRAY.z]}>
        <Box size={[0.9, 0.03, 0.58]} position={[0, 0, 0]} color="#7a5136" radius={0.015} />
        <mesh position={[0, 0.018, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.82, 0.5]} />
          <meshStandardMaterial color="#fff6e6" roughness={0.8} />
        </mesh>
      </group>
      {/* till */}
      <group position={[3.3, COUNTER_H + 0.04, -0.2]}>
        <Box size={[0.45, 0.22, 0.35]} position={[0, 0.11, 0]} color="#9b7bf2" radius={0.04} />
        <Box size={[0.35, 0.14, 0.04]} position={[0, 0.3, -0.1]} color={INK} radius={0.02} rotation={[-0.4, 0, 0]} />
      </group>
    </group>
  );
}

function Bell({ interactive, onServe, armed }: { interactive: boolean; onServe?(): void; armed: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const hit = useRef(0);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const since = clock.elapsedTime - hit.current;
    ref.current.rotation.z = since < 0.5 ? Math.sin(since * 40) * 0.2 * (0.5 - since) : 0;
    ref.current.scale.setScalar(armed ? 1 + Math.sin(clock.elapsedTime * 5) * 0.05 : 1);
  });
  return (
    <group
      ref={ref}
      position={[3.05, COUNTER_H + 0.04, 0.25]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!interactive || !clickInteracts()) return;
        e.stopPropagation();
        hit.current = performance.now() / 1000;
        onServe?.();
      }}
      onPointerOver={() => interactive && (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.13, 0.04, 24]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <sphereGeometry args={[0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ffd166" metalness={0.8} roughness={0.25} emissive={armed ? '#ffb703' : '#000000'} emissiveIntensity={armed ? 0.6 : 0} />
      </mesh>
      {interactive && (
        <Html position={[0, 0.32, 0]} center distanceFactor={3} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-full border-2 border-ink bg-sun px-2 py-0.5 font-display text-xs font-semibold text-ink shadow-[2px_2px_0_#2d3748]">🔔 Serve (F)</div>
        </Html>
      )}
    </group>
  );
}

/** The menu board lists what is in the case today (the menu is bigger than the case). */
function Backbar({ level, sign, today }: { level: string; sign: string; today: string[] }) {
  const menu = kindsFor(level).filter((k) => today.includes(k.id));
  const lines = ['TODAY', ...menu.filter((k) => k.sized).map((k) => `${k.name}  S / L`), ...menu.filter((k) => !k.sized).slice(0, 7).map((k) => k.name)];
  const menuTex = useTextTexture(lines, { width: 512, height: 640, bg: '#2f3b36', fg: '#fdf6e3', border: '#c48e58', lineHeight: 640 / (lines.length + 1.2) });
  return (
    <group>
      {/* back counter */}
      <Box size={[7, 0.95, 0.7]} position={[0, 0.475, -4.55]} color="#e9b88a" radius={0.04} />
      <Box size={[7.1, 0.05, 0.8]} position={[0, 0.97, -4.55]} color="#f4ece1" radius={0.02} />
      {/* espresso machine */}
      <group position={[-1.6, 0.95, -4.55]}>
        <Box size={[1.0, 0.6, 0.5]} position={[0, 0.3, 0]} color="#d1d5db" radius={0.06} roughness={0.25} />
        <Box size={[0.9, 0.12, 0.45]} position={[0, 0.66, 0]} color="#ff6b6b" radius={0.04} />
        {[-0.25, 0.25].map((x) => (
          <mesh key={x} position={[x, 0.18, 0.28]}>
            <cylinderGeometry args={[0.05, 0.05, 0.12, 12]} />
            <meshStandardMaterial color={INK} metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>
      {/* mugs on a shelf */}
      <Box size={[2.4, 0.06, 0.3]} position={[1.6, 2.0, -4.85]} color="#c98f5a" radius={0.02} />
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[0.7 + i * 0.36, 2.12, -4.85]} castShadow>
          <cylinderGeometry args={[0.08, 0.07, 0.17, 16]} />
          <meshStandardMaterial color={['#fdbcb4', '#add8e6', '#ffd166', '#98ff98', '#e6e6fa', '#ff9f43'][i]} roughness={0.4} />
        </mesh>
      ))}
      {/* menu board + neon */}
      <mesh position={[-1.4, 2.35, -4.93]}>
        <planeGeometry args={[1.5, 1.9]} />
        <meshStandardMaterial map={menuTex} roughness={0.9} />
      </mesh>
      <Sign lines={[sign]} size={[2.6, 0.5]} position={[1.6, 2.75, -4.92]} bg="#2d3748" fg="#ffd166" border="#2d3748" emissive={1.4} />
    </group>
  );
}

function SeatingArea() {
  return (
    <group>
      {[
        [-3.3, 3.0],
        [0.2, 3.4],
        [3.6, 2.8],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.55, 0.55, 0.05, 32]} />
            <meshStandardMaterial color="#fff9f0" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.37, 0]}>
            <cylinderGeometry args={[0.05, 0.08, 0.74, 12]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          {[-0.85, 0.85].map((dx) => (
            <group key={dx} position={[dx, 0, 0]}>
              <Box size={[0.45, 0.06, 0.45]} position={[0, 0.46, 0]} color={['#fdbcb4', '#add8e6', '#ffd166'][i]} radius={0.03} />
              <Box size={[0.06, 0.5, 0.42]} position={[dx > 0 ? 0.2 : -0.2, 0.72, 0]} color={['#fdbcb4', '#add8e6', '#ffd166'][i]} radius={0.03} />
              {[-0.17, 0.17].map((lx) =>
                [-0.17, 0.17].map((lz) => (
                  <mesh key={`${lx}${lz}`} position={[lx, 0.22, lz]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.44, 6]} />
                    <meshStandardMaterial color={INK} />
                  </mesh>
                )),
              )}
            </group>
          ))}
          <mesh position={[0.1, 0.83, 0.1]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, 0.12, 16]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CaseItem({ obj, pos, hovered, interactive, onHover, onClick, shakeKey, label }: { obj: SceneObject; pos: [number, number, number]; hovered: boolean; interactive: boolean; onHover?(e: HoverEvent): void; onClick?(): void; shakeKey: number; label: string }) {
  const ref = useRef<THREE.Group>(null);
  const shakeUntil = useRef(0);
  const lastShake = useRef(0);
  if (shakeKey && shakeKey !== lastShake.current) {
    lastShake.current = shakeKey;
    shakeUntil.current = performance.now() + 600;
  }
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.position.x = THREE.MathUtils.damp(g.position.x, pos[0], 10, dt);
    g.position.y = THREE.MathUtils.damp(g.position.y, pos[1] + (hovered ? 0.03 : 0), 10, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, pos[2], 10, dt);
    g.rotation.z = performance.now() < shakeUntil.current ? Math.sin(performance.now() * 0.06) * 0.15 : 0;
  });
  const handlers = interactive
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover?.({ objectId: obj.id, cell: null });
          document.body.style.cursor = 'pointer';
        },
        onPointerOut: () => {
          onHover?.({ objectId: null, cell: null });
          document.body.style.cursor = '';
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 8 || !clickInteracts()) return;
          e.stopPropagation();
          onClick?.();
        },
      }
    : {};
  return (
    <group ref={ref} position={pos} {...handlers}>
      <group rotation-y={obj.yaw}>
        <ItemModel kind={obj.kind} color={obj.color} size={obj.size} look={{ glow: hovered ? '#4f8ef7' : null }} />
      </group>
      {hovered && (
        <Html position={[0, 0.42, 0]} center distanceFactor={2.6} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
          <div className="flex flex-col items-center whitespace-nowrap rounded-2xl border-2 border-ink bg-white px-2 py-0.5 font-display text-ink shadow-[2px_2px_0_#2d3748]">
            <span className="text-sm leading-tight font-semibold">{label}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

const labelOf = (o: SceneObject) => `${o.size === 'small' ? 'small ' : o.size === 'big' ? 'large ' : ''}${getKind(o.kind)?.name ?? o.kind}`;

function CafeContents(p: CafeViewProps) {
  const quality = useMemo(detectQuality, []);
  const look = p.look ?? 'cafe';
  const floor = usePatternTexture('#f4e2cc', '#e8cfae', 'checks', [12, 10]);
  const hoverId = p.pointer?.objectId ?? null;
  const fps = p.view !== 'overview';
  const trayIndex = new Map(p.tray.map((id, i) => [id, i]));
  return (
    <>
      {fps ? (
        <FirstPersonRig
          position={p.view === 'builder' ? [0.6, 1.66, -1.55] : [-0.2, 1.6, 2.45]}
          yaw={p.view === 'builder' ? Math.PI : 0}
          pitch={p.view === 'builder' ? -0.24 : -0.16}
          yawRange={1.45}
          pitchMin={-1.05}
          pitchMax={0.45}
          resetKey={p.missionKey}
          capture={p.capture ?? p.interactive}
          onLockChange={p.onLockChange}
        />
      ) : (
        <OrbitControls makeDefault target={[0.4, 1.2, 0]} minDistance={2} maxDistance={6.5} maxPolarAngle={1.45} />
      )}
      {look === 'night' ? (
        <NightMarketSet sign={p.sign ?? 'Night Market'} />
      ) : look === 'market' ? (
        <MarketSet sign={p.sign ?? 'Market'} palette={p.palette} />
      ) : (
        <>
          <hemisphereLight args={['#fff4e6', '#b98a63', 0.6]} />
          <ambientLight intensity={0.15} />
          <directionalLight position={[-3, 6, 7]} intensity={1.6} color="#ffeccc" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
          <SoftIBL warm="#ffd9b8" intensity={0.85} />
          <RoomShellBox w={12} d={10} h={3.4} wall={p.palette?.wall ?? '#fbe7d0'} wallLow={p.palette?.wallLow ?? '#9b7bf2'} floorTex={floor} />
          <Backbar level={p.level ?? 'cafe'} sign={p.sign ?? 'Corner Café'} today={[...new Set(p.scene.objects.map((o) => o.kind))].sort()} />
          <SeatingArea />
          {/* street-side windows behind the customer */}
          {[-3.2, 0.2, 3.6].map((x) => (
            <group key={x} position={[x, 1.75, 4.94]} rotation-y={Math.PI}>
              <WindowPane width={2.2} height={1.7} glow="#e7f6ff" curtains={null} light={false} />
            </group>
          ))}
          <LightShaft position={[0.2, 2.6, 4.4]} rotation={[0.85, 0, 0]} width={2.2} length={4.5} opacity={0.16} />
          <Sign lines={['OPEN']} size={[0.8, 0.32]} position={[-5.4, 2.2, 4.9]} rotation={[0, Math.PI, 0]} bg="#ff6b6b" fg="#ffffff" border="#2d3748" emissive={0.8} />
          {[-2.4, 0.4, 2.8].map((x) => (
            <PendantLamp key={x} position={[x, 3.4, 0]} drop={1.1} shade="#22c55e" />
          ))}
          <Plant position={[-5.3, 0, 4.2]} scale={1.2} />
          <Plant position={[5.3, 0, 4.2]} scale={1.1} />
          <Plant position={[5.2, 0, -3.8]} />
          <CafeDressing />
        </>
      )}
      <Counter look={look} />
      <GlassCase look={look} />
      {/* display case contents and the tray */}
      {p.scene.objects.map((o) => {
        const onTray = trayIndex.get(o.id);
        const pos = onTray !== undefined ? trayPos(onTray) : casePos(o.cell.c, o.cell.r);
        return (
          <CaseItem
            key={o.id}
            obj={o}
            pos={pos}
            hovered={hoverId === o.id}
            interactive={p.interactive}
            onHover={p.onHover}
            onClick={() => p.onTray?.(o.id, onTray === undefined)}
            shakeKey={p.shakeId?.id === o.id ? p.shakeId.key : 0}
            label={`${labelOf(o)}${onTray !== undefined ? ' (on the tray: click to take it back)' : ''}`}
          />
        );
      })}
      {/* free tray slots, softly marked */}
      {Array.from({ length: TRAY_SLOTS }, (_, k) =>
        k >= p.tray.length ? (
          <mesh key={k} position={[trayPos(k)[0], COUNTER_H + 0.066, trayPos(k)[2]]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.07, 0.09, 24]} />
            <meshBasicMaterial color="#c48e58" transparent opacity={0.5} />
          </mesh>
        ) : null,
      )}
      <Bell interactive={p.interactive} onServe={p.onServe} armed={p.tray.length > 0 && p.interactive} />
      {/* pointer marker for the customer */}
      {!p.interactive && hoverId && p.scene.objects.some((o) => o.id === hoverId) && (
        <PointerArrow pos={(() => {
          const o = p.scene.objects.find((x) => x.id === hoverId)!;
          const t = trayIndex.get(o.id);
          return t !== undefined ? trayPos(t) : casePos(o.cell.c, o.cell.r);
        })()} />
      )}
      {p.view !== 'builder' && (
        <group position={[0.5, 0, -1.25]}>
          <Avatar role="builder" name={p.names?.builder ?? 'Barista'} />
        </group>
      )}
      {p.view !== 'guide' && (
        <group position={[-0.2, 0, 1.35]} rotation-y={Math.PI}>
          <Avatar role="guide" name={p.names?.guide ?? 'Customer'} />
        </group>
      )}
      {look !== 'night' && <Dust area={[11, 3, 9]} center={[0, 1.7, 0.5]} count={180} />}
      <PostFx quality={quality} bloom={look === 'night' ? 0.95 : 0.65} />
    </>
  );
}

function PointerArrow({ pos }: { pos: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = pos[1] + 0.42 + Math.sin(clock.elapsedTime * 4) * 0.03;
  });
  return (
    <group ref={ref} position={[pos[0], pos[1] + 0.42, pos[2]]}>
      <mesh rotation-x={Math.PI}>
        <coneGeometry args={[0.05, 0.12, 4]} />
        <meshStandardMaterial color="#4f8ef7" emissive="#4f8ef7" emissiveIntensity={0.8} />
      </mesh>
    </group>
  );
}

export function CafeScene(props: CafeViewProps) {
  return (
    <Canvas className={props.className} shadows dpr={[1, 2]} events={centerRayEvents} camera={{ fov: 62, near: 0.05, far: 80, position: [0, 2, 4] }} gl={{ antialias: false, powerPreference: 'high-performance' }} onPointerMissed={() => props.interactive && props.onHover?.({ objectId: null, cell: null })}>
      <color attach="background" args={[props.look === 'night' ? '#1c1838' : '#f4e2cc']} />
      <Suspense fallback={<Html center>Loading…</Html>}>
        <CafeContents {...props} />
      </Suspense>
    </Canvas>
  );
}
