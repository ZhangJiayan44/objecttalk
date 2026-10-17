import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MARKET_UPPER_HEIGHT } from '@shared/nightmarket';
import { MARKET_DECKS, MARKET_DECK_BOARDS, MARKET_DECK_RAILS, MARKET_PIERS, MARKET_RAIL_POSTS, MARKET_STAIR, MARKET_STEPS } from '@shared/nightmarket-layout';
import { Box } from '../furniture';

export function Roof({ width = 4.8, depth = 3.8, y = 3.2, color = '#548a83' }: { width?: number; depth?: number; y?: number; color?: string }) {
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

export function TimberBeam({ from, to, width = 0.16, color = '#806049' }: { from: [number, number, number]; to: [number, number, number]; width?: number; color?: string }) {
  const delta = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), delta.clone().normalize());
  return <group position={new THREE.Vector3(...from).add(new THREE.Vector3(...to)).multiplyScalar(0.5)} quaternion={rotation}>
    <Box size={[delta.length(), width, width]} position={[0, 0, 0]} color={color} radius={0.015} />
  </group>;
}

function DeckBoards() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.86 }), []);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    MARKET_DECK_BOARDS.forEach((b, i) => {
      dummy.position.set(b.x, MARKET_UPPER_HEIGHT - 0.015, b.z);
      dummy.scale.set(b.w, 0.03, b.d);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(i, dummy.matrix);
      ref.current!.setColorAt(i, new THREE.Color(b.color));
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <instancedMesh ref={ref} args={[geometry, material, MARKET_DECK_BOARDS.length]} castShadow receiveShadow />;
}

export function MarketDecks() {
  return <group name="market-upper-decks">
    {MARKET_DECKS.map((r, i) => <Box key={i} size={[r.w, 0.22, r.d]} position={[r.x, MARKET_UPPER_HEIGHT - 0.14, r.z]} color="#85674f" radius={0.015} />)}
    <DeckBoards />
    {MARKET_PIERS.map(({ x, z }, i) => <group key={i} position={[x, 0, z]}>
      <Box size={[0.24, MARKET_UPPER_HEIGHT - 0.25, 0.24]} position={[0, (MARKET_UPPER_HEIGHT - 0.25) / 2, 0]} color="#71564c" radius={0.02} />
      <Box size={[0.48, 0.3, 0.48]} position={[0, 0.15, 0]} color="#91978c" radius={0.04} />
      {[-1, 1].map((s) => <TimberBeam key={s} from={[0, MARKET_UPPER_HEIGHT - 1.3, 0]} to={[s * 0.7, MARKET_UPPER_HEIGHT - 0.25, 0]} width={0.12} />)}
    </group>)}
  </group>;
}

export function SkywalkRails() {
  return <group name="market-upper-rails">
    {MARKET_RAIL_POSTS.map(([x, y, z], i) => <Box key={i} size={[0.09, 0.98, 0.09]} position={[x, y + 0.49, z]} color="#79574e" radius={0.015} />)}
    {MARKET_DECK_RAILS.flatMap(({ from, to }, i) => [0.28, 0.95].map((h) => <TimberBeam key={`${i}:${h}`} from={[from[0], from[1] + h, from[2]]} to={[to[0], to[1] + h, to[2]]} width={0.075} color="#b59368" />))}
  </group>;
}

export function MarketStairs() {
  const { from, to, width } = MARKET_STAIR;
  return <group name="market-stairs">
    {MARKET_STEPS.map((s, i) => <Box key={i} size={[s.w, s.h, s.d]} position={[s.x, s.y, s.z]} color={i % 2 ? '#a8a394' : '#b6ad9c'} radius={0.01} />)}
    {[-1, 1].map((side) => {
      const z = from.z + side * width / 2;
      return <group key={side}>
        {Array.from({ length: 9 }, (_, i) => {
          const x = from.x + (to.x - from.x) * i / 8;
          if (MARKET_RAIL_POSTS.some((p) => Math.hypot(p[0] - x, p[2] - z) < 0.15)) return null;
          return <Box key={i} size={[0.09, 0.98, 0.09]} position={[x, i * MARKET_UPPER_HEIGHT / 8 + 0.49, z]} color="#79584b" radius={0.01} />;
        })}
        <TimberBeam from={[from.x, 0.95, z]} to={[to.x, MARKET_UPPER_HEIGHT + 0.95, z]} width={0.075} color="#b59368" />
        <TimberBeam from={[from.x, -0.08, z]} to={[to.x, MARKET_UPPER_HEIGHT - 0.08, z]} width={0.16} />
        {[10, 13].map((x) => <Box key={x} size={[0.18, (x - from.x) / (to.x - from.x) * MARKET_UPPER_HEIGHT, 0.18]} position={[x, (x - from.x) / (to.x - from.x) * MARKET_UPPER_HEIGHT / 2, z]} color="#70554b" radius={0.02} />)}
      </group>;
    })}
  </group>;
}
