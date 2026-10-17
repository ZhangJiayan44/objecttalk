import { Html, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { SceneCanvas as Canvas } from './performance';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import * as THREE from 'three';
import { getKind } from '@shared/catalog';
import { lineText } from '@shared/cafe';
import { closestShop, collideMarket, marketHeight, MARKET_NODES, MARKET_PATHS, MARKET_MEETING, MARKET_SHOPS, MARKET_START, MARKET_UPPER_HEIGHT, nearShop, shopForKind, type MarketShop } from '@shared/nightmarket';
import type { Pose } from '@shared/protocol';
import type { Role, SceneState } from '@shared/types';
import { asset } from '@/lib/asset';
import { centerRayEvents, clickInteracts, FirstPersonRig } from './controls';
import { PostFx, Sign, SkyDome, SoftIBL } from './env';
import { Box } from './furniture';
import { Avatar, ItemModel } from './models';
import { Prop } from './props';
import { LanternString, Steam } from './stalls';
import { MARKET_GROUND_PAVING, type MarketRect } from '@shared/nightmarket-layout';
import { Roof, MarketDecks, MarketStairs, SkywalkRails } from './nightmarket/structure';
import { MarketPerson, MerchantQuarter } from './nightmarket/MerchantQuarter';
import { CourtyardGardens, MarketPocketScenery, NightMarketBackdrop } from './nightmarket/Scenery';

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

function Shop({ shop, scene, interactive, onShop }: { shop: MarketShop; scene: SceneState; interactive: boolean; onShop?(id: string): void }) {
  const { camera } = useThree();
  const [hover, setHover] = useState(false);
  const items = scene.objects.filter((o) => shopForKind(o.kind).id === shop.id).filter((o, i, all) => all.findIndex((x) => x.kind === o.kind && x.size === o.size) === i);
  const activate = () => {
    if (interactive && clickInteracts() && nearShop({ x: camera.position.x, z: camera.position.z, y: camera.position.y - 1.65 }, shop)) onShop?.(shop.id);
  };
  return <group position={[shop.x, shop.elevation ?? 0, shop.z]} rotation-y={shop.yaw}>
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

function PavedRoad({ road }: { road: MarketRect }) {
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
  return <group>
    <Box size={[road.w, 0.09, road.d]} position={[road.x, -0.04, road.z]} color="#bdb4a6" radius={0.02} />
    <mesh rotation-x={-Math.PI / 2} position={[road.x, 0.012, road.z]} receiveShadow><planeGeometry args={[road.w, road.d]} /><meshStandardMaterial map={paving} roughness={0.9} /></mesh>
  </group>;
}

function TieredDistrict() {
  return <group>
    <CourtyardGardens />
    <SkywalkRails />
    <Sign lines={['PASTRIES ←    DESSERTS ↑']} position={[7, MARKET_UPPER_HEIGHT + 1.8, -15.6]} size={[3.4, 0.65]} bg="#6c7865" fg="#f6dfb3" border="#ad926b" />
    <Sign lines={['桥下通街', 'UNDERPASS']} position={[-8, 3.1, -5.2]} size={[2.3, 0.5]} bg="#526e66" fg="#f9e3b6" border="#ad926b" />
    <Sign lines={['TEA / PASTRIES / DESSERTS']} position={[8, 2.4, -1.2]} size={[3.4, 0.75]} bg="#58776b" fg="#f9e3b6" border="#ad926b" />
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
    <SkyDome top="#293246" bottom="#85787b" radius={180} />
    <fog attach="fog" args={['#6e686d', overview ? 85 : 48, overview ? 175 : 130]} />
    <hemisphereLight args={['#d8d7d0', '#766c64', 1.25]} />
    <ambientLight intensity={0.52} color="#fff3dc" />
    <directionalLight position={[-10, 23, 15]} intensity={1.55} color="#ffe2bb" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-23} shadow-camera-right={23} shadow-camera-top={24} shadow-camera-bottom={-24} shadow-normalBias={0.06} />
    <SoftIBL warm="#f2b981" cool="#b9c3c0" intensity={0.62} />
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, 0]} receiveShadow><planeGeometry args={[260, 260]} /><meshStandardMaterial color="#8a927d" roughness={1} /></mesh>
    <NightMarketBackdrop />
    {MARKET_GROUND_PAVING.map((road, index) => <PavedRoad key={index} road={road} />)}
    <MarketDecks />
    <MarketStairs />
    {[9, 15].map((z) => <group key={z}>
      <LanternString from={[-3.3, 4.6, z]} to={[3.3, 4.6, z]} count={5} sag={0.4} color="#d1a266" />
      {[-3.3, 3.3].map((x) => <Box key={x} size={[0.08, 4.5, 0.08]} position={[x, 2.25, z]} color="#745851" radius={0.01} />)}
    </group>)}
    <TieredDistrict />
    <MarketPocketScenery />
    <MerchantQuarter />
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
    <Prop name="pineTree" position={[-17.5, 0, -15]} size={5} word={false} />
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
      {!walker && <Html position={[shop.x, (shop.elevation ?? 0) + 4.7, shop.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}><div className="market-map-label" style={{ width: 112, whiteSpace: 'normal', fontSize: 11, lineHeight: 1.2, letterSpacing: 0 }}>{shop.name}<small>{shop.elevation ? 'Upper Floor' : 'Ground Floor'}</small></div></Html>}
    </group>)}
    {!walker && <group position={[p.pose.x, marketHeight(p.pose), p.pose.z]} rotation-y={p.pose.yaw + Math.PI}><Avatar role="builder" name={p.shopperName ?? 'Shopper'} /></group>}
    <group position={[MARKET_MEETING.x, 0.04, MARKET_MEETING.z]}>
      <mesh rotation-x={-Math.PI / 2} onClick={(e) => { e.stopPropagation(); if (p.interactive && clickInteracts()) p.onServe?.(); }}>
        <ringGeometry args={[1.5, 1.75, 48]} /><meshStandardMaterial color="#f3d17b" emissive="#e2af4f" emissiveIntensity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Sign lines={['集合处 · Meeting Point']} position={[0, 0.12, 1.8]} rotation={[-Math.PI / 2, 0, 0]} size={[3.8, 0.6]} bg="#5b6f66" fg="#ffe3a2" border="#c4a767" />
    </group>
    <PostFx ao={true} bloom={0.12} vignette={0.1} />
  </>;
}

export function NightMarketScene(props: Props) {
  return <Canvas className={props.className} events={centerRayEvents} camera={{ fov: props.view === 'builder' ? 70 : 45, near: 0.1, far: 240, position: props.view === 'builder' ? [MARKET_START.x, 1.65, MARKET_START.z] : [36, 42, 42] }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
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
