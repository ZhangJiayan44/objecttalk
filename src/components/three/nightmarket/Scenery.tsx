import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MARKET_BACKDROP_BUILDINGS, MARKET_GARDENS } from '@shared/nightmarket-layout';
import { Box } from '../furniture';
import { Sign } from '../env';
import { Prop } from '../props';
import { LanternString } from '../stalls';

export function CourtyardGardens() {
  return <group name="market-courtyard-gardens">{MARKET_GARDENS.map((g) => <group key={g.id} position={[g.x, 0, g.z]}>
    <Box size={[g.w, 0.3, g.d]} position={[0, 0.15, 0]} color="#9a9c8b" radius={0.12} />
    <Box size={[g.w - 0.24, 0.05, g.d - 0.24]} position={[0, 0.325, 0]} color="#627f69" radius={0.08} />
    {[-1, 1].map((s) => <group key={s}>
      <Box size={[g.w, 0.19, 0.16]} position={[0, 0.39, s * (g.d / 2 - 0.08)]} color="#c4baa4" radius={0.045} />
      <Box size={[0.16, 0.19, g.d - 0.3]} position={[s * (g.w / 2 - 0.08), 0.39, 0]} color="#c4baa4" radius={0.045} />
    </group>)}
    {g.style === 'pond' ? <>
    <group position={[-0.65, 0.34, 0.35]}>
      <Box size={[3.3, 0.1, 2.35]} position={[0, 0, 0]} color="#899686" radius={0.2} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.065, 0]} receiveShadow><planeGeometry args={[3.05, 2.1]} /><meshStandardMaterial color="#5f9c93" roughness={0.3} metalness={0.12} /></mesh>
      {[[-0.95, 0.15], [0.4, -0.58], [0.92, 0.55]].map(([x, z], i) => <group key={i} position={[x, 0.074, z]}>
        <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[0.22, 12]} /><meshStandardMaterial color="#71916c" roughness={0.8} side={THREE.DoubleSide} /></mesh>
        {i !== 1 && <group position={[0.03, 0.035, 0]}>{Array.from({ length: 5 }, (_, n) => <mesh key={n} position={[Math.cos(n * Math.PI * 0.4) * 0.07, 0, Math.sin(n * Math.PI * 0.4) * 0.07]} scale={[0.09, 0.045, 0.06]}><sphereGeometry args={[1, 8, 5]} /><meshStandardMaterial color={i ? '#e6c6b1' : '#dcb1b1'} roughness={0.8} /></mesh>)}</group>}
      </group>)}
    </group>
    <Prop name="pineTree" position={[1.8, 0.35, -1.15]} size={1.7} word={false} alive={false} />
    {[[-2.35, -1.55], [-1.35, -1.6], [-0.35, -1.65], [0.75, -1.55]].map(([x, z], i) => <Prop key={i} name={i % 2 ? 'rose' : 'tulip'} position={[x, 0.35, z]} size={0.7} word={false} alive={false} />)}
    {[[1.7, 0.8, 0.5], [2.15, 0.25, 0.35], [1.75, 1.5, 0.28]].map(([x, z, size], i) => <mesh key={i} position={[x, 0.35 + size * 0.35, z]} scale={[size, size * 0.75, size * 0.7]} rotation-y={i * 0.8} castShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color={i % 2 ? '#9b9d8d' : '#8a9186'} roughness={1} /></mesh>)}
    </> : <>
      {[-0.55, 0.55].flatMap((x) => [-1.25, 1.25].map((z, i) => <group key={`${x}:${z}`} position={[x, 0.35, z]}>
        <mesh position={[0, 0.85, 0]} castShadow><cylinderGeometry args={[0.04, 0.055, 1.7 + i * 0.2, 7]} /><meshStandardMaterial color="#7d956e" roughness={0.9} /></mesh>
        {[0.65, 1.15, 1.55].flatMap((y) => [-1, 1].map((side) => <mesh key={`${y}:${side}`} position={[side * 0.2, y, 0]} scale={[0.32, 0.055, 0.11]} rotation-z={side * 0.35} castShadow><sphereGeometry args={[1, 8, 5]} /><meshStandardMaterial color={i ? '#799a75' : '#8ca77e'} roughness={0.9} /></mesh>))}
      </group>))}
      <Prop name="rose" position={[0, 0.35, 0]} size={0.65} word={false} alive={false} />
    </>}
    <Sign lines={g.style === 'pond' ? ['荷香池院', 'Lotus courtyard'] : ['听竹小院', 'Bamboo garden']} position={[0, 0.7, g.d / 2 - 0.03]} size={[1.4, 0.35]} bg="#5f7666" fg="#f9e4bd" border="#b09b78" />
  </group>)}</group>;
}

interface Part { position: [number, number, number]; size: [number, number, number]; color: string }
const WALLS = ['#a99a83', '#a9a18e', '#b3a18c', '#9eaaa0', '#b8a38d', '#b49b8e'];
const ROOFS = ['#637d73', '#657879', '#73847b', '#727276'];
const houseParts: Part[] = [];
for (const b of MARKET_BACKDROP_BUILDINGS) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), front = b.d / 2 - 0.6;
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) => houseParts.push({ position: [b.x + c * x + s * z, y, b.z - s * x + c * z], size: [Math.abs(c) * w + Math.abs(s) * d, h, Math.abs(s) * w + Math.abs(c) * d], color });
  add(0, b.h / 2, -0.6, b.w, b.h, b.d, WALLS[b.variant % WALLS.length]);
  add(0, 0.22, -0.6, b.w + 0.2, 0.44, b.d + 0.2, '#8a8d80');
  add(0, 1.1, front + 0.03, 1.35, 2.05, 0.08, '#70564d');
  add(0, 1.3, front + 0.08, 0.06, 2.3, 0.1, '#b5936c');
  for (const level of b.h > 5.6 ? [1.9, 4.1] : [2.8]) for (const x of [-b.w * 0.3, b.w * 0.3]) {
    add(x, level, front + 0.04, 1.15, 1.25, 0.09, '#776758');
    add(x, level, front + 0.1, 0.95, 1.05, 0.05, '#d2b581');
    add(x, level, front + 0.14, 0.055, 1.05, 0.04, '#877057');
    add(x, level, front + 0.14, 0.95, 0.05, 0.04, '#877057');
  }
  for (const x of [-b.w / 2 + 0.14, b.w / 2 - 0.14]) add(x, b.h / 2, front + 0.05, 0.13, b.h, 0.13, '#8a6254');
  add(0, b.h - 0.2, front + 0.08, b.w + 0.25, 0.14, 0.2, '#b89b73');
  if (b.h > 5.6) add(0, 3.25, front + 0.09, b.w + 0.1, 0.16, 0.18, '#826653');
}

/** The distant town uses a single box batch, rather than hundreds of individual draw calls. */
function TownFacades() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.92 }), []);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    houseParts.forEach((p, i) => {
      dummy.position.set(...p.position); dummy.scale.set(...p.size); dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix); ref.current!.setColorAt(i, new THREE.Color(p.color));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <instancedMesh ref={ref} args={[geometry, material, houseParts.length]} receiveShadow />;
}

/** A low-detail, upturned tiled roof, authored only for the non-playable town. */
function TownRoof({ width, depth, color }: { width: number; depth: number; color: string }) {
  const geometry = useMemo(() => {
    const d = depth / 2 + 0.45;
    const shape = new THREE.Shape();
    shape.moveTo(-d, 0.22); shape.lineTo(-d * 0.8, 0.08); shape.lineTo(0, 1.05); shape.lineTo(d * 0.8, 0.08); shape.lineTo(d, 0.22);
    shape.lineTo(d, 0.05); shape.lineTo(d * 0.8, -0.09); shape.lineTo(0, 0.88); shape.lineTo(-d * 0.8, -0.09); shape.lineTo(-d, 0.05); shape.closePath();
    const roof = new THREE.ExtrudeGeometry(shape, { depth: width + 0.75, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, steps: 1 });
    roof.rotateY(Math.PI / 2); roof.translate(-(width + 0.75) / 2, 0, 0);
    return roof;
  }, [width, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow><meshStandardMaterial color={color} roughness={0.95} /></mesh>;
}

export function NightMarketBackdrop() {
  return <group name="night-market-backdrop">
    <TownFacades />
    {MARKET_BACKDROP_BUILDINGS.map((b, i) => <group key={i} position={[b.x, b.h - 0.05, b.z]} rotation-y={b.yaw}>
      <group position={[0, 0, -0.6]}><TownRoof width={b.w} depth={b.d} color={ROOFS[b.variant % ROOFS.length]} /></group>
      <Box size={[b.w + 0.8, 0.13, 0.15]} position={[0, 1.05, -0.6]} color="#ab9878" radius={0.03} />
    </group>)}
    {[-1, 1].map((s) => <group key={s}>
      <Box size={[0.35, 1.65, 55]} position={[s < 0 ? -19.3 : 23.5, 0.825, -5]} color="#8b8d80" radius={0.06} />
      <Box size={[0.55, 0.16, 55.2]} position={[s < 0 ? -19.3 : 23.5, 1.7, -5]} color="#637b70" radius={0.04} />
      <LanternString from={[s < 0 ? -20.3 : 24.3, 3.9, -25]} to={[s < 0 ? -20.3 : 24.3, 3.9, 19]} count={9} color="#c99074" sag={0.25} />
    </group>)}
    <Box size={[43, 1.8, 0.4]} position={[1.5, 0.9, -30.4]} color="#939584" radius={0.05} />
    <Box size={[43.3, 0.17, 0.6]} position={[1.5, 1.85, -30.4]} color="#6e8274" radius={0.05} />
    <group position={[0, 0, -43]}>
      <Box size={[10, 7, 5]} position={[0, 3.5, 0]} color="#9b9b88" radius={0.08} />
      {[7, 10.7].map((y, i) => <group key={y} position={[0, y, 0]}><TownRoof width={11 - i * 2} depth={6 - i} color="#637c73" />{i === 0 && <Box size={[7, 3.5, 4]} position={[0, 1.8, 0]} color="#afaa92" radius={0.06} />}</group>)}
    </group>
    {Array.from({ length: 22 }, (_, i) => {
      const angle = i / 22 * Math.PI * 2;
      const distance = 67 + i % 3 * 6;
      const h = 5.5 + i % 4 * 2.1;
      return <mesh key={i} position={[Math.cos(angle) * distance + 2, h * 0.18, Math.sin(angle) * distance - 5]} scale={[13 + i % 3 * 3, h, 10 + i % 4]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color={i % 2 ? '#73867f' : '#83918a'} roughness={1} /></mesh>;
    })}
    <mesh position={[-34, 33, -70]}><sphereGeometry args={[2.7, 20, 12]} /><meshStandardMaterial color="#f6dfb8" emissive="#ddc19a" emissiveIntensity={1.2} toneMapped={false} /></mesh>
  </group>;
}
