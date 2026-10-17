import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import * as THREE from 'three';
import { getKind } from '@shared/catalog';
import { lineText } from '@shared/cafe';
import { closestShop, collideMarket, marketHeight, MARKET_NODES, MARKET_PATHS, MARKET_MEETING, MARKET_ROADS, MARKET_SHOPS, MARKET_START, MARKET_UPPER_HEIGHT, nearShop, shopForKind, type MarketShop } from '@shared/nightmarket';
import type { Pose } from '@shared/protocol';
import type { Role, SceneState } from '@shared/types';
import { asset } from '@/lib/asset';
import { centerRayEvents, clickInteracts, FirstPersonRig } from './controls';
import { detectQuality, PostFx, Sign, SkyDome, SoftIBL } from './env';
import { Box } from './furniture';
import { Avatar, ItemModel } from './models';
import { Prop } from './props';
import { LanternString, Stars, Steam } from './stalls';

interface Props {
  scene: SceneState;
  tray: string[];
  pose: Pose;
  view: Role | 'overview';
  interactive: boolean;
  capture?: boolean;
  paused?: boolean;
  className?: string;
  onMove?(p: Pose): void;
  onShop?(id: string): void;
  onServe?(): void;
  onLockChange?(locked: boolean): void;
  shopperName?: string;
}

function Roof({ width = 4.8, depth = 3.8, y = 3.2, color = '#548a83' }: { width?: number; depth?: number; y?: number; color?: string }) {
  return <group position={[0, y, -0.6]}>
    {[-1, 1].map((s) => <group key={s}>
      <Box size={[width, 0.2, depth / 2 + 0.25]} position={[0, 0.25, s * depth / 4]} rotation={[s * 0.3, 0, 0]} color={color} radius={0.05} />
      {Array.from({ length: 15 }, (_, i) => <Box key={i} size={[0.055, 0.055, depth / 2 + 0.27]} position={[(i - 7) * width / 15, 0.38, s * depth / 4]} rotation={[s * 0.3, 0, 0]} color="#9eb9a3" radius={0.02} />)}
      <Box size={[width + 0.18, 0.15, 0.25]} position={[0, 0.02, s * depth / 2]} color="#e8c477" radius={0.05} />
    </group>)}
    <Box size={[width + 0.3, 0.21, 0.22]} position={[0, 0.64, 0]} color="#d9b771" radius={0.08} />
    {[-1, 1].map((s) => <Box key={s} size={[0.55, 0.14, 0.25]} position={[s * width / 2, 0.77, 0]} rotation={[0, 0, s * 0.35]} color="#d9b771" radius={0.04} />)}
  </group>;
}

function MarketPerson({ shop }: { shop: MarketShop }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.4 + shop.x) * 0.018; });
  return <group position={[0, 0, 0.05]} ref={ref}>
    <group position={[0, 0, 0]}>
      <mesh castShadow position={[0, 0.72, 0]}>
        <capsuleGeometry args={[0.28, 0.72, 6, 12]} />
        <meshStandardMaterial color={shop.color} roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0, 1.36, 0]}>
        <sphereGeometry args={[0.27, 16, 12]} />
        <meshStandardMaterial color="#f3c9a8" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 1.57, 0]} rotation={[0, 0, 0.04]}>
        <coneGeometry args={[0.3, 0.18, 12]} />
        <meshStandardMaterial color="#59494a" roughness={0.9} />
      </mesh>
      <mesh position={[-0.095, 1.38, 0.24]}>
        <sphereGeometry args={[0.034, 8, 8]} />
        <meshStandardMaterial color="#403b3c" roughness={0.7} />
      </mesh>
      <mesh position={[0.095, 1.38, 0.24]}>
        <sphereGeometry args={[0.034, 8, 8]} />
        <meshStandardMaterial color="#403b3c" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.84, 0.28]}>
        <boxGeometry args={[0.34, 0.38, 0.035]} />
        <meshStandardMaterial color="#f5e8d0" roughness={0.95} />
      </mesh>
    </group>
    <Sign lines={[shop.owner]} position={[0, 2.02, 0.08]} size={[1.8, 0.32]} bg="#fff2d6" fg="#433b43" border={shop.color} />
  </group>;
}

function Shop({ shop, scene, interactive, onShop }: { shop: MarketShop; scene: SceneState; interactive: boolean; onShop?(id: string): void }) {
  const { camera } = useThree();
  const [hover, setHover] = useState(false);
  const items = scene.objects.filter((o) => shopForKind(o.kind).id === shop.id).filter((o, i, all) => all.findIndex((x) => x.kind === o.kind && x.size === o.size) === i);
  const activate = () => {
    if (interactive && clickInteracts() && nearShop({ x: camera.position.x, z: camera.position.z, y: camera.position.y - 1.65 }, shop)) onShop?.(shop.id);
  };
  return <group position={[shop.x, shop.elevation ?? 0, shop.z]} rotation-y={shop.yaw}>
    {!!shop.elevation && <group>
      <Box size={[4.5, 0.22, 4]} position={[0, -0.11, -0.1]} color="#8d7055" radius={0.025} />
      {[-1.96, 1.96].flatMap((x) => [-1.7, 1.55].map((z) => <group key={`${x}${z}`}>
        <Box size={[0.24, MARKET_UPPER_HEIGHT, 0.24]} position={[x, -MARKET_UPPER_HEIGHT / 2, z]} color="#70554b" radius={0.02} />
        <Box size={[0.55, 0.32, 0.55]} position={[x, -MARKET_UPPER_HEIGHT + 0.16, z]} color="#8c9187" radius={0.04} />
        <TimberBeam from={[x, -1.5, z]} to={[x * 0.48, -0.3, z]} width={0.13} />
      </group>))}
      {[-1.7, 1.55].map((z) => <Box key={z} size={[4.45, 0.22, 0.22]} position={[0, -0.32, z]} color="#9d7a55" radius={0.02} />)}
    </group>}
    {!shop.temporary && <>
      <Box size={[4.3, 2.7, 0.16]} position={[0, 1.35, -1.92]} color="#e6c8a9" radius={0.04} />
      {[-2.08, 2.08].map((x) => <Box key={`wall${x}`} size={[0.16, 2.7, 2.5]} position={[x, 1.35, -0.7]} color="#f0d4b3" radius={0.03} />)}
      <Box size={[4.3, 0.4, 0.2]} position={[0, 2.65, 0.6]} color="#f0d4b3" radius={0.02} />
      {[-1.9, 1.9].map((x) => <Box key={x} size={[0.18, 2.8, 0.22]} position={[x, 1.4, 0.66]} color="#964e48" radius={0.02} />)}
      <Roof color={shop.color} />
      {[-1.45, 1.45].map((x) => <group key={x} position={[x, 1.25, 0.69]}>
        <Box size={[0.75, 1.1, 0.06]} position={[0, 0, 0]} color="#ffc776" radius={0.02} />
        {[-0.24, 0, 0.24].map((offset) => <Box key={offset} size={[0.035, 1.1, 0.07]} position={[offset, 0, 0.05]} color="#7b4b49" radius={0.005} />)}
      </group>)}
    </>}
    {shop.temporary && <>
      {[-1.65, 1.65].map((x) => <Box key={x} size={[0.1, 2.9, 0.1]} position={[x, 1.45, -0.1]} color="#a06b4d" radius={0.02} />)}
      <Roof width={3.8} depth={2.3} y={2.65} color={shop.color} />
      <Box size={[3.3, 0.32, 0.04]} position={[0, 2.45, 1.0]} color={shop.color} radius={0.01} />
    </>}
    <MarketPerson shop={shop} />
    <Sign lines={[shop.name]} size={[shop.temporary ? 3.1 : 3.65, 0.65]} position={[0, shop.temporary ? 2.38 : 2.68, shop.temporary ? 1.03 : 0.76]} bg="#4c3b41" fg="#ffe2a0" border={shop.color} emissive={0.3} />
    <group onClick={(e) => { e.stopPropagation(); activate(); }} onPointerOver={(e) => { e.stopPropagation(); setHover(true); }} onPointerOut={() => setHover(false)}>
      <Box size={[3.25, 0.15, 1.05]} position={[0, 0.98, 1.22]} color={hover ? '#ffe49e' : '#deb58a'} radius={0.04} />
      {[-1.4, 1.4].flatMap((x) => [-0.35, 0.35].map((z) => <Box key={`${x}${z}`} size={[0.11, 0.96, 0.12]} position={[x, 0.48, 1.22 + z]} color="#8a5f50" radius={0.02} />))}
      <Box size={[3.05, 0.52, 0.05]} position={[0, 0.7, 1.76]} color={shop.color} radius={0.02} />
      <Sign lines={[`Welcome · ${shop.owner}`]} position={[0, 0.7, 1.79]} size={[2.7, 0.3]} bg={shop.color} fg="#fff6df" border={shop.color} />
      {items.map((o, i) => <group key={o.id} position={[(i - (items.length - 1) / 2) * 0.6, 1.065, 1.25]} scale={1.5}>
        <ItemModel kind={o.kind} color={o.color} size={o.size} />
      </group>)}
      {/* The generous proxy lets the counter and the owner open the same shop. */}
      <mesh position={[0, 1.15, 1.2]}>
        <boxGeometry args={[3.3, 2, 1]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
    <LanternString from={[-1.6, 2.8, 1.65]} to={[1.6, 2.8, 1.65]} count={3} sag={0.08} color={shop.color} />
    {(shop.id === 'noodles' || shop.id === 'grill') && <Steam position={[0.8, 1.1, 0.6]} />}
  </group>;
}

function TimberBeam({ from, to, width = 0.16, color = '#806049' }: { from: [number, number, number]; to: [number, number, number]; width?: number; color?: string }) {
  const delta = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.clone().normalize());
  return <group position={new THREE.Vector3(...from).add(new THREE.Vector3(...to)).multiplyScalar(0.5)} quaternion={rotation}>
    <Box size={[delta.length(), width, width]} position={[0, 0, 0]} color={color} radius={0.015} />
  </group>;
}

const deckParts = (road: typeof MARKET_ROADS[number]) => road.a === 12
  ? [{ x: 16, z: -10.05, w: 3.4, d: 11.3 }, { x: 16.85, z: -2.85, w: 1.7, d: 3.1 }]
  : [road];
const upperDecks = MARKET_ROADS.filter((r) => r.level === 2).flatMap(deckParts);
const belowHeight = MARKET_UPPER_HEIGHT - 0.35;

function BridgeSupports({ road }: { road: typeof MARKET_ROADS[number] }) {
  const a = MARKET_NODES[road.a], b = MARKET_NODES[road.b];
  const length = Math.hypot(b.x - a.x, b.z - a.z), count = Math.ceil(length / 5);
  const px = -(b.z - a.z) / length, pz = (b.x - a.x) / length;
  const halfSpan = road.width / 2 + 0.45;
  const obstructs = (x: number, z: number) => MARKET_ROADS.some((r) => r.level === 0 && Math.abs(x - r.x) < r.w / 2 + 0.25 && Math.abs(z - r.z) < r.d / 2 + 0.25)
    || MARKET_SHOPS.some((s) => {
      if (s.elevation) return false;
      const dx = x - s.x, dz = z - s.z;
      return Math.abs(dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw)) < 2.5 && Math.abs(dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw) + 0.3) < 2.1;
    });
  return <group>
    {Array.from({ length: count + 1 }, (_, i) => {
      const x = a.x + (b.x - a.x) * i / count, z = a.z + (b.z - a.z) * i / count;
      if ([-1, 1].some((s) => obstructs(x + s * px * halfSpan, z + s * pz * halfSpan))) return null;
      return <group key={i} position={[x, 0, z]} rotation-y={Math.atan2(-pz, px)}>
        {[-1, 1].map((s) => <group key={s}>
          <Box size={[0.2, belowHeight, 0.2]} position={[s * halfSpan, belowHeight / 2, 0]} color="#71564c" radius={0.02} />
          <Box size={[0.48, 0.35, 0.48]} position={[s * halfSpan, 0.175, 0]} color="#91978c" radius={0.035} />
          <TimberBeam from={[s * halfSpan, belowHeight - 1.35, 0]} to={[s * (halfSpan - 1.05), belowHeight, 0]} width={0.14} />
        </group>)}
        <Box size={[halfSpan * 2 + 0.25, 0.22, 0.22]} position={[0, belowHeight, 0]} color="#a3885c" radius={0.025} />
        {Array.from({ length: 8 }, (_, j) => {
          const u = -1 + j / 4, v = -1 + (j + 1) / 4;
          return <TimberBeam key={j} from={[u * halfSpan, belowHeight - 0.18 - u * u * 1.15, 0]} to={[v * halfSpan, belowHeight - 0.18 - v * v * 1.15, 0]} width={0.12} color="#ad9068" />;
        })}
      </group>;
    })}
    {[-1, 1].map((s) => <TimberBeam key={s} from={[a.x + s * px * road.width / 2, belowHeight, a.z + s * pz * road.width / 2]} to={[b.x + s * px * road.width / 2, belowHeight, b.z + s * pz * road.width / 2]} width={0.18} />)}
  </group>;
}

function PavedRoad({ road, index }: { road: typeof MARKET_ROADS[number]; index: number }) {
  const paving = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#827c76';
    g.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 5; col++) {
      g.fillStyle = ['#a49d94', '#aaa39a', '#9b958d'][(row * 7 + col + 10) % 3];
      g.fillRect(col * 64 + (row % 2) * 32 + 1, row * 64 + 1, 61, 61);
      g.strokeStyle = 'rgba(72, 64, 60, 0.12)';
      g.lineWidth = 2;
      g.strokeRect(col * 64 + (row % 2) * 32 + 2, row * 64 + 2, 59, 59);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(road.w / 4, road.d / 4);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, [road.w, road.d]);
  useEffect(() => () => paving.dispose(), [paving]);
  if (road.level === 1) return <group>
    {Array.from({ length: 24 }, (_, i) => <Box key={i} size={[8 / 24 + 0.035, 0.16, 2.8]} position={[8 + (i + 0.5) * 8 / 24, (i + 1) * MARKET_UPPER_HEIGHT / 24 - 0.08, -3]} color={i % 2 ? '#a8a394' : '#b6ad9c'} radius={0.02} />)}
    {[-4.45, -1.55].map((z) => <group key={z}>
      {Array.from({ length: 9 }, (_, i) => <Box key={i} size={[0.09, 1, 0.09]} position={[8 + i, i * MARKET_UPPER_HEIGHT / 8 + 0.5, z]} color="#79584b" radius={0.01} />)}
      <TimberBeam from={[8, 1, z]} to={[16, MARKET_UPPER_HEIGHT + 1, z]} width={0.09} color="#ac855e" />
      <TimberBeam from={[8, -0.1, z]} to={[16, MARKET_UPPER_HEIGHT - 0.1, z]} width={0.2} />
      {[10, 13, 16].map((x) => <Box key={x} size={[0.18, (x - 8) / 8 * MARKET_UPPER_HEIGHT, 0.18]} position={[x, (x - 8) / 16 * MARKET_UPPER_HEIGHT, z]} color="#70554b" radius={0.02} />)}
    </group>)}
  </group>;
  if (road.level === 2) {
    // The landing starts at the last step; a full rectangle would cut across the ramp.
    const decks = deckParts(road);
    return <group>
      {decks.map((deck, j) => <group key={j}>
        <Box size={[deck.w, 0.22, deck.d]} position={[deck.x, MARKET_UPPER_HEIGHT - 0.12, deck.z]} color="#85674f" radius={0.03} />
        {Array.from({ length: Math.ceil(deck.d / 0.42) }, (_, i) => <Box key={i} size={[deck.w - 0.04, 0.035, Math.min(0.38, deck.d / Math.ceil(deck.d / 0.42) - 0.025)]} position={[deck.x, MARKET_UPPER_HEIGHT + 0.01 + index * 0.0007, deck.z - deck.d / 2 + (i + 0.5) * deck.d / Math.ceil(deck.d / 0.42)]} color={i % 3 ? '#bba07c' : '#c4aa86'} radius={0.008} />)}
      </group>)}
      <BridgeSupports road={road} />
    </group>;
  }
  return <group>
    <Box size={[road.w + 0.25, 0.09, road.d + 0.25]} position={[road.x, -0.04, road.z]} color="#bdb4a6" radius={0.02} />
    <mesh rotation-x={-Math.PI / 2} position={[road.x, 0.012 + index * 0.002, road.z]} receiveShadow><planeGeometry args={[road.w, road.d]} /><meshStandardMaterial map={paving} roughness={0.9} /></mesh>
  </group>;
}

function BackgroundHouse({ position, width, height, color, roof, sign }: { position: [number, number, number]; width: number; height: number; color: string; roof: string; sign: string }) {
  return <group position={position}>
    <Box size={[width, height, 2.4]} position={[0, height / 2, 0]} color={color} radius={0.06} />
    <Box size={[width + 0.55, 0.24, 2.85]} position={[0, height + 0.08, 0]} color={roof} radius={0.05} />
    <Box size={[width + 0.75, 0.12, 0.24]} position={[0, height - 0.08, 1.25]} color="#b08a68" radius={0.03} />
    <Box size={[width + 0.18, 0.16, 0.18]} position={[0, height - 0.22, 1.24]} color="#76574e" radius={0.03} />
    {[-0.32, 0.32].map((x) => <group key={x} position={[x * width * 0.72, height * 0.58, 1.22]}>
      <Box size={[0.48, 0.6, 0.035]} position={[0, 0, 0]} color="#6d6a63" radius={0.02} />
      <Box size={[0.34, 0.4, 0.045]} position={[0, 0, 0.03]} color="#e3b979" radius={0.01} />
    </group>)}
    <Sign lines={[sign]} position={[0, height * 0.28, 1.25]} size={[Math.min(width - 0.35, 2.5), 0.32]} bg="#66504d" fg="#f4dfb4" border="#b38d68" emissive={0.02} />
  </group>;
}

function StreetBackground() {
  const houses = [
    { position: [-17, 0, -15] as [number, number, number], width: 5.8, height: 4.2, color: '#8c7770', roof: '#5e6264', sign: '茶坊' },
    { position: [25, 0, -16] as [number, number, number], width: 6.4, height: 4.8, color: '#7f8d86', roof: '#596862', sign: '布庄' },
    { position: [-17, 0, -28] as [number, number, number], width: 6, height: 4.6, color: '#8b8579', roof: '#5e716c', sign: '竹器坊' },
    { position: [17, 0, -28] as [number, number, number], width: 6.5, height: 5.2, color: '#978577', roof: '#616873', sign: '桂花客舍' },
    { position: [-18, 0, 4] as [number, number, number], width: 5.4, height: 3.8, color: '#9a8173', roof: '#665d59', sign: '香铺' },
    { position: [18, 0, 3] as [number, number, number], width: 5.6, height: 4.1, color: '#897b86', roof: '#625b67', sign: '灯铺' },
    { position: [-17, 0, 20] as [number, number, number], width: 7, height: 5.4, color: '#766e73', roof: '#515962', sign: '客栈' },
    { position: [17, 0, 20] as [number, number, number], width: 7, height: 5, color: '#80766d', roof: '#5b5e5c', sign: '酒旗' },
  ];
  return <group>
    {houses.map((house) => <BackgroundHouse key={house.sign + house.position.join(',')} {...house} />)}
    <group position={[0, 0, -43]}>
      {[-15, -7, 2, 11, 19].map((x, i) => <mesh key={x} position={[x, 4.8 + (i % 2) * 0.7, 0]}>
        <coneGeometry args={[5.8, 8 + (i % 3) * 1.2, 5]} />
        <meshStandardMaterial color={i % 2 ? '#4d5860' : '#566169'} roughness={1} />
      </mesh>)}
      <Box size={[42, 1.25, 0.5]} position={[0, 1.05, 0]} color="#5b6265" radius={0.05} />
    </group>
    <Box size={[42, 2.5, 0.5]} position={[0, 1.25, -40]} color="#59636a" radius={0.08} />
    {[-1, 1].map((side) => <group key={side} position={[side < 0 ? -22 : 28, 0, -6]}>
      <Box size={[0.45, 1.8, 54]} position={[0, 0.9, 0]} color="#6a625d" radius={0.04} />
      <LanternString from={[0, 4.8, -24]} to={[0, 4.8, 24]} count={11} sag={0.55} color="#bf9565" />
      {[-21, -14, -7, 0, 7, 14, 21].map((z, i) => <group key={z} position={[0, 3.65 + (i % 2) * 0.25, z]}>
        <Box size={[0.05, 0.9, 0.05]} position={[0, 0.4, 0]} color="#6e534c" radius={0.01} />
        <Prop name="lantern" position={[0, 0, 0]} size={0.28} word={false} />
      </group>)}
    </group>)}
    <group position={[0, 0, -36]}>
      <Box size={[12, 0.18, 0.2]} position={[0, 0.12, 0]} color="#b18a68" radius={0.03} />
      {[-5.2, -2.6, 0, 2.6, 5.2].map((x) => <Box key={x} size={[0.08, 0.65, 0.08]} position={[x, 0.42, 0]} color="#6f514b" radius={0.01} />)}
      {[-3.8, 0, 3.8].map((x) => <Box key={x} size={[2.1, 0.52, 0.05]} position={[x, 0.75, 0]} color={x === 0 ? '#9b6b62' : '#718d83'} radius={0.03} />)}
    </group>
    <group position={[0, 0, 8]}>
      {[-9, 0, 9].map((x, i) => <group key={x} position={[x, 4.35, 0]} rotation-y={i === 1 ? 0 : 0.08 * (i - 1)}>
        <Box size={[0.06, 1.5, 0.06]} position={[0, 0.8, 0]} color="#6e514b" radius={0.01} />
        <Box size={[1.2, 0.72, 0.035]} position={[0, 0.15, 0]} color={i === 1 ? '#c49763' : '#9a6b62'} radius={0.03} />
      </group>)}
    </group>
  </group>;
}

function GalleryRail({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
  return <group position={from} rotation-y={Math.atan2(-(to[2] - from[2]), to[0] - from[0])}>
    {Array.from({ length: Math.ceil(length / 1.3) + 1 }, (_, i) => <Box key={i} size={[0.09, 0.95, 0.09]} position={[i * length / Math.ceil(length / 1.3), 0.48, 0]} color="#79574e" radius={0.02} />)}
    {[0.28, 0.95].map((y) => <Box key={y} size={[length, 0.075, 0.075]} position={[length / 2, y, 0]} color="#b59368" radius={0.02} />)}
  </group>;
}

function SkywalkRails() {
  const height = MARKET_UPPER_HEIGHT + 0.04;
  const segments = upperDecks.flatMap((deck, deckIndex) => {
    const xmin = deck.x - deck.w / 2, xmax = deck.x + deck.w / 2, zmin = deck.z - deck.d / 2, zmax = deck.z + deck.d / 2;
    const edges = [
      { a: [xmin, zmin], b: [xmax, zmin], outward: [0, -1] },
      { a: [xmin, zmax], b: [xmax, zmax], outward: [0, 1] },
      { a: [xmin, zmin], b: [xmin, zmax], outward: [-1, 0] },
      { a: [xmax, zmin], b: [xmax, zmax], outward: [1, 0] },
    ];
    return edges.flatMap((edge) => {
      const count = Math.ceil(Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]) / 0.2);
      const point = (i: number): [number, number, number] => [edge.a[0] + (edge.b[0] - edge.a[0]) * i / count, height, edge.a[1] + (edge.b[1] - edge.a[1]) * i / count];
      const runs: { from: [number, number, number]; to: [number, number, number] }[] = [];
      let start = -1;
      for (let i = 0; i <= count; i++) {
        const [x, , z] = point(i + 0.5);
        const internal = upperDecks.some((other, j) => j !== deckIndex && Math.abs(x + edge.outward[0] * 0.04 - other.x) < other.w / 2 && Math.abs(z + edge.outward[1] * 0.04 - other.z) < other.d / 2);
        const entrance = (Math.abs(x - 16) < 0.1 && z > -4.4 && z < -1.5)
          || (Math.abs(x - 17.7) < 0.1 && z > -10.5 && z < -5.5)
          || (z < -23.5 && x > 5.2 && x < 8.8);
        const draw = i < count && !internal && !entrance;
        if (draw && start < 0) start = i;
        if (!draw && start >= 0) { runs.push({ from: point(start), to: point(i) }); start = -1; }
      }
      return runs;
    });
  });
  return <group>{segments.map((s, i) => <GalleryRail key={i} {...s} />)}</group>;
}

function TieredDistrict() {
  return <group>
    {[[-3, -7], [-3, -9]].map(([x, z]) => <Box key={z} size={[5.8, 0.25, 0.24]} position={[x, 0.15, z]} color="#8b9186" radius={0.05} />)}
    <mesh position={[-3, 0.08, -8]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[5.6, 1.8]} /><meshStandardMaterial color="#577e79" roughness={0.25} metalness={0.2} />
    </mesh>
    <Prop name="pineTree" position={[-4.8, 0, -9.8]} size={2.4} word={false} />
    <SkywalkRails />
    <Sign lines={['桥下通街', 'UNDERPASS']} position={[-8, 3.1, -5.2]} size={[2.3, 0.5]} bg="#526e66" fg="#f9e3b6" border="#ad926b" />
    <Sign lines={['云廊 · 池院环桥', 'COURTYARD SKYWALK']} position={[-2, MARKET_UPPER_HEIGHT + 1.7, -5.3]} size={[3, 0.6]} bg="#6c7865" fg="#f6dfb3" border="#ad926b" />
    <Sign lines={['玉露楼 · 二楼', 'UPPER TEA GALLERY →']} position={[8, 2.4, -1.2]} size={[3, 0.65]} bg="#58776b" fg="#f9e3b6" border="#ad926b" />
    <Sign lines={['荷池院 ←', 'POND COURTYARD']} position={[-7.5, 2.5, -1]} size={[2.5, 0.6]} bg="#6d655c" fg="#f6dfb3" border="#ad926b" />
    <Sign lines={['竹里巷 · BAMBOO LANE']} position={[-12.8, 2.4, -13.8]} size={[3.2, 0.5]} bg="#6c7865" fg="#f6dfb3" border="#ad926b" />
    {MARKET_PATHS.filter((p) => p.level !== 1).map((path) => {
      const a = MARKET_NODES[path.a], b = MARKET_NODES[path.b];
      const y = path.level === 2 ? MARKET_UPPER_HEIGHT + 3.2 : 4.4;
      return <LanternString key={path.name} from={[a.x, y, a.z]} to={[b.x, y, b.z]} count={Math.max(3, Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / 2))} sag={0.25} color={path.level === 2 ? '#dac48a' : '#d49c6e'} />;
    })}
  </group>;
}

function StreetSet({ overview }: { overview: boolean }) {
  return <>
    <SkyDome top="#293246" bottom="#85787b" radius={90} />
    <Stars />
    <fog attach="fog" args={['#6e686d', overview ? 70 : 34, overview ? 160 : 90]} />
    <hemisphereLight args={['#d8d7d0', '#766c64', 1.25]} />
    <ambientLight intensity={0.52} color="#fff3dc" />
    <directionalLight position={[-10, 23, 15]} intensity={1.55} color="#ffe2bb" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-23} shadow-camera-right={23} shadow-camera-top={24} shadow-camera-bottom={-24} shadow-normalBias={0.06} />
    <SoftIBL warm="#f2b981" cool="#b9c3c0" intensity={0.62} />
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, 0]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#6f766e" roughness={1} /></mesh>
    <StreetBackground />
    {MARKET_ROADS.map((road, index) => <PavedRoad key={index} road={road} index={index} />)}
    {[9, 15].map((z) => <group key={z}>
      <LanternString from={[-3.3, 4.6, z]} to={[3.3, 4.6, z]} count={5} sag={0.4} color="#d1a266" />
      {[-3.3, 3.3].map((x) => <Box key={x} size={[0.08, 4.5, 0.08]} position={[x, 2.25, z]} color="#745851" radius={0.01} />)}
    </group>)}
    <TieredDistrict />
    {/* Timber infill creates visible blocks between the two cross lanes. */}
    {[-15].map((x) => <group key={x} position={[x, 0, 1]}>
      <Box size={[5.2, 2.8, 5.6]} position={[0, 1.4, -0.5]} color="#d1c2ae" radius={0.04} />
      <Roof width={5.7} depth={6.1} color={x < 0 ? '#718d83' : '#9b6b62'} />
      {[-2, 2].map((z) => <Box key={z} size={[5.3, 0.12, 0.14]} position={[0, 1.4, z]} color="#9e6760" radius={0.02} />)}
    </group>)}
    {[-18].map((x) => <group key={`north-block${x}`} position={[x, 0, -10]}>
      <BackgroundHouse position={[0, 0, 0]} width={5.2} height={3.4} color={x < 0 ? '#bcac97' : '#c1b8a5'} roof="#75897e" sign={x < 0 ? '绣坊' : '书肆'} />
      <Prop name="lantern" position={[x < 0 ? 1.6 : -1.6, 2.6, 1.4]} size={0.35} word={false} />
    </group>)}
    {/* The main street terminates at a little pavilion. */}
    <group position={[0, 0, -33]}>
      {[-2, 2].flatMap((x) => [-1, 1].map((z) => <Box key={`${x}${z}`} size={[0.22, 3.4, 0.22]} position={[x, 1.7, z]} color="#a44f4a" radius={0.03} />))}
      <Roof width={5.5} depth={4.5} color="#689b8c" />
      <Sign lines={['望月亭', 'Moon Pavilion']} position={[0, 2.6, 1.2]} size={[3.6, 0.6]} bg="#63504d" fg="#f8e2b6" border="#c49b68" />
    </group>
    <group position={[0, 0, 18.5]}>
      {[-3.1, 3.1].map((x) => <Box key={x} size={[0.32, 4.6, 0.35]} position={[x, 2.3, 0]} color="#b14f4c" radius={0.06} />)}
      <Box size={[7.2, 0.36, 0.65]} position={[0, 4.3, 0]} color="#568a81" radius={0.08} />
      <Sign lines={['灯火夜市', 'LANTERN STREET']} position={[0, 3.75, -0.37]} rotation={[0, Math.PI, 0]} size={[3.8, 0.85]} bg="#66504d" fg="#f7dfb0" border="#c59b68" emissive={0.04} />
    </group>
    {[-1, 1].map((side) => <group key={side} position={[side * 11.5, 0, 14]}>
      <mesh position={[0, 0.7, 0]} castShadow><cylinderGeometry args={[0.9, 0.9, 0.12, 24]} /><meshStandardMaterial color="#c79573" /></mesh>
      <Box size={[0.18, 0.7, 0.18]} position={[0, 0.35, 0]} color="#805d54" />
      {[-1.2, 1.2].map((x) => <Box key={x} size={[0.55, 0.4, 0.5]} position={[x, 0.2, 0]} color="#709f96" radius={0.05} />)}
      <Prop name="lantern" position={[0, 0.77, 0]} size={0.4} word={false} />
    </group>)}
    <Prop name="pineTree" position={[-15.8, 0, -15]} size={5} word={false} />
    <Prop name="pineTree" position={[15.8, 0, 13]} size={4.6} word={false} />
  </>;
}

function Follow({ pose }: { pose: Pose }) {
  useFrame(({ camera }) => { camera.position.set(pose.x, marketHeight(pose) + 1.65, pose.z); camera.rotation.set(-0.08, pose.yaw, 0, 'YXZ'); });
  return null;
}

function Contents(p: Props) {
  const start = useRef(p.pose);
  const live = useRef(p.pose);
  live.current = p.pose;
  const walker = p.view === 'builder';
  const quality = useMemo(detectQuality, []);
  useEffect(() => {
    if (!p.interactive) return;
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'KeyB' || /INPUT|TEXTAREA/.test((e.target as HTMLElement)?.tagName)) return;
      const shop = closestShop(live.current);
      if (shop) p.onShop?.(shop.id);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [p.interactive, p.onShop]);
  return <>
    {walker && p.interactive ? <FirstPersonRig position={[start.current.x, marketHeight(start.current) + 1.65, start.current.z]} yaw={start.current.yaw} pitch={-0.06} pitchMax={0.8} capture={p.capture && !p.paused} onLockChange={p.onLockChange} walk={{ speed: p.paused ? 0 : 4.5, run: p.paused ? 0 : 7, eye: 1.65, groundHeight: marketHeight, collide: collideMarket, onPose: p.onMove }} />
      : walker ? <Follow pose={p.pose} /> : <OrbitControls target={[0, 0, -6]} minDistance={18} maxDistance={75} maxPolarAngle={1.15} />}
    <StreetSet overview={!walker} />
    {MARKET_SHOPS.map((shop) => <group key={shop.id}>
      <Shop shop={shop} scene={p.scene} interactive={p.interactive} onShop={p.onShop} />
      {!walker && <Html position={[shop.x, (shop.elevation ?? 0) + (shop.id === 'sweets' ? 6.4 : 4.7), shop.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}><div className="market-map-label" style={{ width: 112, whiteSpace: 'normal', fontSize: 11, lineHeight: 1.2, letterSpacing: 0 }}>{shop.name}<small>{shop.elevation ? 'Upper Floor' : 'Ground Floor'}</small></div></Html>}
    </group>)}
    {!walker && <group position={[p.pose.x, marketHeight(p.pose), p.pose.z]} rotation-y={p.pose.yaw + Math.PI}><Avatar role="builder" name={p.shopperName ?? 'Shopper'} /></group>}
    <group position={[MARKET_MEETING.x, 0.04, MARKET_MEETING.z]}>
      <mesh rotation-x={-Math.PI / 2} onClick={(e) => { e.stopPropagation(); if (p.interactive && clickInteracts()) p.onServe?.(); }}>
        <ringGeometry args={[1.5, 1.75, 48]} /><meshStandardMaterial color="#f3d17b" emissive="#e2af4f" emissiveIntensity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Sign lines={['集合处 · Meeting Point']} position={[0, 0.12, 1.8]} rotation={[-Math.PI / 2, 0, 0]} size={[3.8, 0.6]} bg="#5b6f66" fg="#ffe3a2" border="#c4a767" />
    </group>
    <PostFx quality={quality} ao={true} bloom={0.12} vignette={0.1} />
  </>;
}

export function NightMarketScene(props: Props) {
  return <Canvas className={props.className} shadows dpr={[1, 1.5]} events={centerRayEvents} camera={{ fov: props.view === 'builder' ? 70 : 45, near: 0.1, far: 150, position: props.view === 'builder' ? [MARKET_START.x, 1.65, MARKET_START.z] : [36, 42, 42] }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
    <Suspense fallback={<Html center>Opening the night market...</Html>}><Contents {...props} /></Suspense>
  </Canvas>;
}

export function MarketMenu({ shopId, scene, tray, onBuy }: { shopId: string; scene: SceneState; tray: string[]; onBuy(id: string): void }) {
  const shop = MARKET_SHOPS.find((s) => s.id === shopId);
  if (!shop) return null;
  const items = scene.objects.filter((o) => shopForKind(o.kind).id === shop.id).filter((o, i, all) => all.findIndex((x) => x.kind === o.kind && x.size === o.size) === i);
  return <div className="space-y-3">
    <p className="text-sm font-semibold">{shop.owner}: Good evening! What would you like?</p>
    <div className="divide-y-2 divide-line">
      {items.map((o) => {
        const kind = getKind(o.kind);
        const stock = scene.objects.filter((x) => x.kind === o.kind && x.size === o.size && !tray.includes(x.id));
        return <div key={`${o.kind}${o.size}`} className="flex items-center gap-3 py-3">
          {kind?.ref && <img src={asset(kind.ref)} alt="" className="h-14 w-14 shrink-0 object-contain" />}
          <div className="min-w-0 flex-1"><div className="font-bold">{lineText({ kind: o.kind, qty: 1, size: o.size === 'regular' ? null : o.size })}</div><div className="text-xs text-muted">{stock.length} available</div></div>
          <button className="market-buy" aria-label={`Buy ${o.size === 'big' ? 'large ' : o.size === 'small' ? 'small ' : ''}${kind?.name}`} title={`Buy ${kind?.name}`} disabled={!stock.length || tray.length >= 6} onClick={() => stock[0] && onBuy(stock[0].id)}><Plus size={20} /></button>
        </div>;
      })}
    </div>
    <p className="text-sm font-semibold">{tray.length}/6 in your shopping bag</p>
  </div>;
}
