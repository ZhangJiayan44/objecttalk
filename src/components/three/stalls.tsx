import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Palette } from '@shared/levels';
import { Cloud, SkyDome, Sign, SoftIBL } from './env';
import { Box, INK, Plant, usePatternTexture } from './furniture';
import { Prop } from './props';

/**
 * The places around the shop counter (shared by every order level):
 *   CafeDressing    extra life for the Corner Café (a cat, plants, a radio…)
 *   MarketSet       a sunny farmers' market: striped awning, crates, flowers, bikes
 *   NightMarketSet  a Chinese night market: lanterns, neighbouring stalls, steam, a starry sky
 * The counter, the display case and the tray stay put; the players' views
 * (stallholder behind the counter at -z, customer in front at +z) do not change.
 */

export function CafeDressing() {
  return (
    <group>
      {/* a cat napping on the window seat, a radio on the back counter */}
      <Box size={[2.4, 0.42, 0.6]} position={[-3.2, 0.21, 4.55]} color="#fdbcb4" radius={0.06} />
      <Prop name="kitten" position={[-3.5, 0.42, 4.5]} size={0.42} rotation={Math.PI + 0.6} />
      <Prop name="radio" position={[0.4, 0.97, -4.6]} size={0.42} />
      <Prop name="candle" position={[-3.3, 0.79, 3.0]} size={0.14} />
      <Prop name="tulip" position={[3.65, 0.77, 2.85]} size={0.22} />
      <Prop name="umbrella" position={[5.2, 0, 3.0]} size={0.7} rotation={-0.4} />
      <Prop name="handbag" position={[0.95, 0.49, 3.35]} size={0.3} rotation={0.4} />
    </group>
  );
}

/** A striped canvas awning (stripes painted in a canvas texture). */
function Awning({ width, depth, position, colors = ['#ff6b6b', '#fff9f0'] }: { width: number; depth: number; position: [number, number, number]; colors?: [string, string] }) {
  const tex = usePatternTexture(colors[0], colors[1], 'stripes', [Math.round(width * 2), 1]);
  return (
    <group position={position}>
      <mesh rotation-x={-0.32} castShadow receiveShadow>
        <boxGeometry args={[width, 0.05, depth]} />
        <meshStandardMaterial map={tex} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* scalloped front edge */}
      {Array.from({ length: Math.round(width / 0.4) }, (_, i) => (
        <mesh key={i} position={[-width / 2 + 0.2 + i * 0.4, -0.06 - Math.sin(0.32) * (depth / 2), depth / 2 * Math.cos(0.32)]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.2, 0.2, 0.04, 16, 1, false, 0, Math.PI]} />
          <meshStandardMaterial color={i % 2 ? colors[1] : colors[0]} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** A wooden crate, optionally full of round fruit "bulk" (spheres in one colour). */
function Crate({ position, rotation = 0, fill, scale = 1 }: { position: [number, number, number]; rotation?: number; fill?: string; scale?: number }) {
  const balls = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ x: ((i % 3) - 1) * 0.16, z: (Math.floor(i / 3) - 1) * 0.13, y: Math.random() * 0.03 })), []);
  return (
    <group position={position} rotation-y={rotation} scale={scale}>
      <Box size={[0.6, 0.32, 0.46]} position={[0, 0.16, 0]} color="#c98f5a" radius={0.02} />
      {fill &&
        balls.map((b, i) => (
          <mesh key={i} position={[b.x, 0.36 + b.y, b.z]} castShadow>
            <sphereGeometry args={[0.085, 14, 10]} />
            <meshStandardMaterial color={fill} roughness={0.5} />
          </mesh>
        ))}
    </group>
  );
}

export function MarketSet({ sign, palette }: { sign: string; palette?: Palette }) {
  const ground = usePatternTexture(palette?.floor ?? '#e8cfae', '#d8b98f', 'checks', [16, 14]);
  return (
    <group>
      <hemisphereLight args={['#fffaf0', '#9fc98a', 0.75]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[-4, 8, 6]} intensity={2.0} color="#fff1d6" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} />
      <SoftIBL warm="#fff0d0" intensity={0.9} />
      <SkyDome top="#8fd3f4" bottom="#fdf6e3" radius={60} />
      <Cloud position={[-20, 18, -30]} scale={1.4} speed={0.25} />
      <Cloud position={[18, 22, -36]} scale={1.8} speed={0.2} />
      {/* cobbles + a grass verge */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[30, 24]} />
        <meshStandardMaterial map={ground} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, -9]} receiveShadow>
        <planeGeometry args={[30, 6]} />
        <meshStandardMaterial color="#9fd88b" roughness={1} />
      </mesh>
      {/* our stall: posts, awning and a hanging sign over the counter */}
      {[-3.2, 3.8].map((x) => (
        <mesh key={x} position={[x, 1.4, -0.45]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 2.8, 10]} />
          <meshStandardMaterial color="#8a5a3b" />
        </mesh>
      ))}
      <Awning width={7.6} depth={2.2} position={[0.3, 2.85, -0.1]} colors={[palette?.accent ?? '#ff9f43', '#fff9f0']} />
      <Sign lines={[sign]} size={[3.2, 0.62]} position={[0.3, 2.38, 0.62]} bg="#fff9f0" fg="#2d3748" border={palette?.wallLow ?? '#22c55e'} />
      {/* behind the stallholder: crates of produce, a cart, the van */}
      <Crate position={[-2.4, 0, -1.9]} fill="#f25f5c" />
      <Crate position={[-1.7, 0, -2.1]} fill="#ffd166" rotation={0.2} />
      <Crate position={[-2.05, 0.32, -2.0]} fill="#3fbf7f" scale={0.9} />
      <Crate position={[2.6, 0, -1.9]} fill="#ff9f43" />
      <Crate position={[3.3, 0, -2.2]} fill="#9b7bf2" rotation={-0.3} />
      <Prop name="truck" position={[5.6, 0, -4.6]} size={3.4} rotation={-Math.PI / 2 + 0.3} />
      <Prop name="shoppingCart" position={[-4.6, 0, -2.6]} size={1.0} rotation={0.6} />
      {/* the customers' side: flowers, a bike, a dog waiting for its owner */}
      <Prop name="bicycle" position={[-4.8, 0, 3.4]} size={1.7} rotation={Math.PI / 2 + 0.2} />
      <Prop name="puppy" position={[2.6, 0, 3.2]} size={0.55} rotation={Math.PI - 0.6} />
      <Prop name="sunflower" position={[5.2, 0, 1.6]} size={1.1} />
      <Prop name="tulip" position={[5.6, 0, 2.4]} size={0.7} />
      <Prop name="rose" position={[5.0, 0, 2.6]} size={0.75} />
      <Prop name="basket" position={[-3.6, 0, 2.2]} size={0.55} rotation={0.4} />
      <Prop name="balloon" position={[4.4, 0.9, 4.2]} size={0.7} />
      {/* neighbouring stalls in the distance */}
      {[-9, 9].map((x, i) => (
        <group key={x} position={[x, 0, -1]} rotation-y={i ? -0.5 : 0.5}>
          <Box size={[3, 0.9, 0.8]} position={[0, 0.45, 0]} color={i ? '#ffd166' : '#add8e6'} radius={0.04} />
          <Awning width={3.4} depth={1.4} position={[0, 2.4, 0.1]} colors={i ? ['#22c55e', '#fff9f0'] : ['#4f8ef7', '#fff9f0']} />
          {[-1.5, 1.5].map((px) => (
            <mesh key={px} position={[px, 1.2, -0.3]}>
              <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
              <meshStandardMaterial color="#8a5a3b" />
            </mesh>
          ))}
          <Crate position={[-0.6, 0.9, 0]} fill={i ? '#f25f5c' : '#3fbf7f'} scale={0.8} />
          <Crate position={[0.6, 0.9, 0]} fill={i ? '#ffd166' : '#ff9f43'} scale={0.8} />
        </group>
      ))}
      <Prop name="pineTree" position={[-8, 0, -8]} size={4} />
      <Prop name="pineTree" position={[7.5, 0, -9]} size={4.6} />
      <Plant position={[-6.2, 0, 4.6]} scale={1.3} />
      <Prop name="bird" position={[3.8, 2.86, -0.6]} size={0.28} rotation={-0.8} />
    </group>
  );
}

/** Warm paper lanterns on a string, gently swaying. */
function LanternString({ from, to, count, color = '#ff6b6b', sag = 0.45 }: { from: [number, number, number]; to: [number, number, number]; count: number; color?: string; sag?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((c, i) => (c.rotation.z = Math.sin(clock.elapsedTime * 1.3 + i) * 0.06));
  });
  const pts = Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t - Math.sin(t * Math.PI) * sag, from[2] + (to[2] - from[2]) * t] as [number, number, number];
  });
  return (
    <group ref={ref}>
      {pts.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <sphereGeometry args={[0.17, 16, 12]} />
            <meshStandardMaterial color={i % 3 === 1 ? '#ffd166' : color} emissive={i % 3 === 1 ? '#ffb703' : '#ff4d3d'} emissiveIntensity={1.8} roughness={0.6} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 10]} />
            <meshStandardMaterial color={INK} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Steam rising from the woks (soft white puffs). */
function Steam({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const puffs = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ o: i / 6, x: (Math.random() - 0.5) * 0.2 })), []);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 0.35 + puffs[i].o) % 1;
      c.position.set(puffs[i].x + Math.sin(t * 6 + i) * 0.05, t * 1.2, 0);
      c.scale.setScalar(0.06 + t * 0.16);
      ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.35 * (1 - t);
    });
  });
  return (
    <group ref={ref} position={position}>
      {puffs.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Tiny twinkling stars on the night sky. */
function Stars() {
  const geo = useMemo(() => {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * 0.5 + 0.08;
      const r = 55;
      pos.set([Math.cos(th) * Math.cos(ph) * r, Math.sin(ph) * r, Math.sin(th) * Math.cos(ph) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  return (
    <points geometry={geo}>
      <pointsMaterial color="#fff6d8" size={0.35} sizeAttenuation transparent opacity={0.85} />
    </points>
  );
}

/** A neighbouring food stall: counter, canopy, glowing menu, a few dishes. */
function SideStall({ position, rotation, color, menu, dishes }: { position: [number, number, number]; rotation: number; color: string; menu: string[]; dishes: React.ReactNode }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Box size={[3.2, 0.95, 0.9]} position={[0, 0.475, 0]} color={color} radius={0.05} />
      <Box size={[3.3, 0.05, 1.0]} position={[0, 0.97, 0]} color="#f7e6c4" radius={0.02} />
      {[-1.55, 1.55].map((x) => (
        <mesh key={x} position={[x, 1.35, -0.4]}>
          <cylinderGeometry args={[0.05, 0.05, 2.7, 8]} />
          <meshStandardMaterial color={INK} />
        </mesh>
      ))}
      <Box size={[3.5, 0.08, 1.4]} position={[0, 2.7, 0.05]} color={color} radius={0.03} />
      <Sign lines={menu} size={[2.2, 0.6]} position={[0, 2.25, 0.42]} bg="#2d3748" fg="#ffd166" border="#ffd166" emissive={1.3} />
      <group position={[0, 1.0, 0]}>{dishes}</group>
      <pointLight position={[0, 2.2, 0.6]} intensity={5} distance={4.5} color="#ffb070" />
    </group>
  );
}

export function NightMarketSet({ sign }: { sign: string }) {
  const ground = usePatternTexture('#3b3352', '#463d60', 'checks', [18, 16]);
  return (
    <group>
      <hemisphereLight args={['#6c6aa8', '#2a2140', 0.55]} />
      <ambientLight intensity={0.18} color="#b9a8ff" />
      {/* the moon + warm stall lights do the work */}
      <directionalLight position={[6, 10, -6]} intensity={0.6} color="#b8c6ff" castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <SoftIBL warm="#ffb070" cool="#7b86d6" intensity={0.55} />
      <SkyDome top="#141233" bottom="#3a2b5c" radius={60} />
      <Stars />
      <mesh position={[16, 22, -40]}>
        <sphereGeometry args={[2.4, 24, 16]} />
        <meshStandardMaterial color="#fff6d8" emissive="#fff1c0" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[34, 28]} />
        <meshStandardMaterial map={ground} roughness={0.95} />
      </mesh>
      {/* our stall: red canopy, the glowing sign, lights over the counter */}
      {[-3.2, 3.8].map((x) => (
        <mesh key={x} position={[x, 1.45, -0.45]}>
          <cylinderGeometry args={[0.06, 0.07, 2.9, 10]} />
          <meshStandardMaterial color="#8e3b2a" />
        </mesh>
      ))}
      <Box size={[7.8, 0.1, 2.2]} position={[0.3, 2.95, -0.05]} color="#d64545" radius={0.04} />
      <Sign lines={[sign]} size={[3.4, 0.68]} position={[0.3, 2.5, 0.64]} bg="#2d3748" fg="#ffd166" border="#ff6b6b" emissive={1.5} />
      <pointLight position={[-0.5, 2.2, 0.9]} intensity={8} distance={5.5} color="#ffc27a" />
      <pointLight position={[2.4, 2.2, 0.6]} intensity={5} distance={4.5} color="#ffb070" />
      {/* behind the stall owner: the wok station, steam, stacked bowls */}
      <Box size={[3.6, 0.9, 0.8]} position={[0, 0.45, -2.2]} color="#5b4a3a" radius={0.04} />
      {[-1.0, 0.4].map((x) => (
        <group key={x} position={[x, 0.92, -2.2]}>
          <mesh>
            <sphereGeometry args={[0.32, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
            <meshStandardMaterial color="#2d3748" metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
          </mesh>
          <Steam position={[0, 0.05, 0]} />
        </group>
      ))}
      <Prop name="lantern" position={[1.4, 0.9, -2.15]} size={0.38} />
      {/* lantern strings across the street */}
      <LanternString from={[-7, 3.6, -1.2]} to={[7, 3.6, -1.2]} count={11} />
      <LanternString from={[-7, 3.4, 3.4]} to={[7, 3.4, 3.4]} count={11} color="#ff8f5a" sag={0.6} />
      {/* neighbouring stalls */}
      <SideStall position={[-7.2, 0, 1.2]} rotation={Math.PI / 2 - 0.25} color="#4f8ef7" menu={['BUBBLE TEA', '奶茶']} dishes={<Prop name="balloon" position={[1.2, 0, 0]} size={0.6} word={false} />} />
      <SideStall position={[7.6, 0, 1.0]} rotation={-Math.PI / 2 + 0.25} color="#22c55e" menu={['SKEWERS', '烤串']} dishes={<Prop name="dice" position={[-0.9, 0, 0]} size={0.24} />} />
      {/* the customers' side: low stools and tables, a scooter, a cat looking for scraps */}
      {[
        [-3.2, 3.0],
        [0.6, 3.6],
        [3.9, 2.9],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.05, 24]} />
            <meshStandardMaterial color="#d64545" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.04, 0.06, 0.5, 10]} />
            <meshStandardMaterial color={INK} />
          </mesh>
          {[-0.65, 0.65].map((dx) => (
            <mesh key={dx} position={[dx, 0.22, 0]}>
              <cylinderGeometry args={[0.17, 0.17, 0.44, 14]} />
              <meshStandardMaterial color={['#4f8ef7', '#ffd166', '#22c55e'][i]} roughness={0.6} />
            </mesh>
          ))}
        </group>
      ))}
      <Prop name="motorScooter" position={[-5.4, 0, 4.4]} size={1.4} rotation={Math.PI / 2 - 0.3} />
      <Prop name="kitten" position={[2.2, 0, 2.2]} size={0.42} rotation={Math.PI + 0.9} />
      <Prop name="lantern" position={[-3.2, 0.52, 3.0]} size={0.3} />
      <Prop name="candle" position={[0.6, 0.52, 3.6]} size={0.16} />
      <Prop name="taxi" position={[-9, 0, -6]} size={3.6} rotation={0.3} />
      <Prop name="bus" position={[9, 0, -7.5]} size={5.2} rotation={-0.2} />
    </group>
  );
}
