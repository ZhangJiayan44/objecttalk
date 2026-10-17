import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MARKET_SHOPS, MARKET_UPPER_HEIGHT, type MarketShop } from '@shared/nightmarket';
import { Box } from '../furniture';
import { Sign } from '../env';
import { Prop } from '../props';
import { Roof, TimberBeam } from './structure';

export function MarketPerson({ shop }: { shop: MarketShop }) {
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


function TeaTable({ position, color = '#719185' }: { position: [number, number, number]; color?: string }) {
  return <group position={position}>
    <Box size={[1.25, 0.12, 0.7]} position={[0, 0.78, 0]} color="#ba9870" radius={0.035} />
    {[-0.46, 0.46].map((x) => <Box key={x} size={[0.09, 0.72, 0.48]} position={[x, 0.36, 0]} color="#765b4d" radius={0.015} />)}
    <Box size={[1.4, 0.12, 0.38]} position={[0, 0.42, -0.68]} color={color} radius={0.03} />
    {[-0.5, 0.5].map((x) => <Box key={x} size={[0.1, 0.4, 0.32]} position={[x, 0.2, -0.68]} color="#765b4d" radius={0.015} />)}
    <mesh position={[0.12, 0.9, 0]}><cylinderGeometry args={[0.14, 0.11, 0.12, 12]} /><meshStandardMaterial color="#e1e3cf" roughness={0.45} /></mesh>
    <mesh position={[0.12, 0.98, 0]}><coneGeometry args={[0.16, 0.06, 12]} /><meshStandardMaterial color="#bdcbb6" /></mesh>
    {[-0.3, 0.4].map((x) => <mesh key={x} position={[x, 0.87, 0.18]}><cylinderGeometry args={[0.07, 0.045, 0.09, 12]} /><meshStandardMaterial color="#eee4d2" roughness={0.5} /></mesh>)}
  </group>;
}

function CraftFrontage({ x, craft }: { x: number; craft: 'lanterns' | 'fans' }) {
  const lanterns = craft === 'lanterns';
  const color = lanterns ? '#bc795a' : '#7d9790';
  return <group position={[x, MARKET_UPPER_HEIGHT, -17]}>
    {[-1.55, 1.55].map((px) => <group key={px}>
      <Box size={[0.14, 2.7, 0.14]} position={[px, 1.35, 0.8]} color="#795b4a" radius={0.02} />
    </group>)}
    <Box size={[3.5, 2.6, 0.14]} position={[0, 1.3, -1.45]} color="#d5c2a0" radius={0.025} />
    <Roof width={4} depth={3.1} y={2.7} color={color} />
    <MarketPerson shop={{ ...MARKET_SHOPS[0], owner: lanterns ? 'Master Lu' : 'Madam Shen', color }} />
    <Box size={[3.15, 0.13, 0.75]} position={[0, 0.95, 1]} color="#bd9b70" radius={0.025} />
    <Box size={[3, 0.65, 0.08]} position={[0, 0.58, 1.33]} color={color} radius={0.02} />
    <Sign lines={[lanterns ? 'LANTERN MAKER' : 'SILK & FANS']} position={[0, 2.35, 1.05]} size={[2.9, 0.65]} bg="#5e5047" fg="#ffe3ad" border={color} />
    {[-1, 0, 1].map((i) => lanterns
      ? <Prop key={i} name="lantern" position={[i, 1.75, -0.9]} size={0.35} word={false} />
      : <group key={i} position={[i * 0.85, 1.08, 1]}>
        <mesh position={[0, 0.15, 0]}><circleGeometry args={[0.33, 16, 0, Math.PI]} /><meshStandardMaterial color={['#b78e9a', '#e5d7b2', '#94aba1'][i + 1]} side={THREE.DoubleSide} roughness={0.9} /></mesh>
        <Box size={[0.035, 0.3, 0.035]} position={[0, 0.05, 0.01]} color="#8e7055" radius={0.005} />
      </group>)}
    {!lanterns && [-0.85, 0.85].map((px) => <Box key={px} size={[0.5, 1.25, 0.035]} position={[px, 1.7, -1.34]} color={px < 0 ? '#b78e9a' : '#94aba1'} radius={0.01} />)}
  </group>;
}

/** Trading frontages and seating occupy bays beside the clear circulation strip. */
export function MerchantQuarter() {
  const h = MARKET_UPPER_HEIGHT;
  return <group>
    <CraftFrontage x={-3.3} craft="lanterns" />
    <CraftFrontage x={1.8} craft="fans" />
    {/* Each covered arcade belongs to a shop; the connecting bridges stay open. */}
    {[{ x: 16, z: -8, yaw: Math.PI / 2, color: '#6d9084', length: 7 }, { x: -8, z: -10.5, yaw: Math.PI / 2, color: '#9a7078', length: 6 }].map((bay) => <group key={bay.x} position={[bay.x, h, bay.z]} rotation-y={bay.yaw}>
      <Roof width={bay.length} depth={3.5} y={2.7} color={bay.color} />
      {[-1, 1].flatMap((side) => [-1, 1].map((end) => <group key={`${side}${end}`} position={[end * (bay.length / 2 - 0.3), 0, side * 1.35 - 0.6]}>
        <Box size={[0.14, 2.85, 0.14]} position={[0, 1.425, 0]} color="#815c50" radius={0.02} />
        <TimberBeam from={[0, 2.15, 0]} to={[-end * 0.6, 2.7, 0]} width={0.1} />
      </group>))}
    </group>)}
    {/* The tea house has a side terrace, with seating recessed off the walking line. */}
    <group position={[19.5, h, -16.5]}>
      {[-1, 1].map((x) => <TeaTable key={x} position={[x, 0, 0.2]} />)}
      <Sign lines={['JADE TEA TERRACE']} position={[0, 1.6, -0.8]} size={[2.5, 0.55]} bg="#567d70" fg="#ffe2ae" border="#b19368" />
    </group>
    {/* A low service yard fills the former pastry-shop plot beside Peach Lane. */}
    <group position={[-7, 0, 9]} rotation-y={Math.PI}>
      <TeaTable position={[-0.85, 0, 0]} color="#b78e91" />
      <TeaTable position={[0.85, 0, 0]} color="#b78e91" />
      <Box size={[4.2, 0.55, 0.26]} position={[0, 0.275, -1.15]} color="#a0a18d" radius={0.04} />
      <Prop name="pineTree" position={[-2.3, 0, -0.7]} size={1.8} word={false} />
    </group>
    {/* Baskets, shutters and shelves give the stalls a preparation side. */}
    {MARKET_SHOPS.filter((shop) => !shop.temporary).map((shop) => <group key={shop.id} position={[shop.x, shop.elevation ?? 0, shop.z]} rotation-y={shop.yaw}>
      <Box size={[1.2, 0.9, 0.5]} position={[-1.25, 0.45, -1.48]} color="#8d7557" radius={0.025} />
      {[0.32, 0.65, 0.98].map((y) => <Box key={y} size={[1.3, 0.055, 0.58]} position={[-1.25, y, -1.48]} color="#c5ab7d" radius={0.015} />)}
      {[0, 1, 2].map((i) => <mesh key={i} position={[-1.65 + i * 0.38, 0.8, -1.45]}>
        <cylinderGeometry args={[0.13, 0.16, 0.22, 12]} /><meshStandardMaterial color={i % 2 ? '#bac3ab' : '#c9a77a'} roughness={0.85} />
      </mesh>)}
      <Box size={[0.65, 1.5, 0.06]} position={[1.65, 0.9, -1.8]} color="#98755b" radius={0.015} />
    </group>)}
    <Sign lines={['PASTRIES UPSTAIRS →']} position={[-8.8, 2.2, -5]} size={[2.8, 0.6]} bg="#926e79" fg="#ffe6bd" border="#b89a70" />
    <Sign lines={['TEA HOUSE']} position={[17.8, 4, -5.8]} rotation={[0, -Math.PI / 2, 0]} size={[1.25, 1.3]} bg="#52796d" fg="#ffe3ae" border="#b89a70" />
  </group>;
}
