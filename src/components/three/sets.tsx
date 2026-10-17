import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { LightShaft, Sign, useTextTexture } from './env';
import { Box, INK, PendantLamp, Plant, RoomShellBox, usePatternTexture, usePlankTexture, WindowPane } from './furniture';
import { Prop } from './props';

/**
 * Extra 3D sets for tabletop levels. The table, the grid and the landmarks
 * stay exactly where the study has them (the spatial language depends on
 * them); only the room around them changes. Every prop is a Rodin model with
 * a word card, and the animals move.
 */

/** A wire pet crate with a soft bed, and a resting animal inside. */
function Crate({ position, rotation = 0, color = '#9b7bf2', children }: { position: [number, number, number]; rotation?: number; color?: string; children?: React.ReactNode }) {
  const bars = useMemo(() => Array.from({ length: 9 }, (_, i) => -0.42 + i * 0.105), []);
  return (
    <group position={position} rotation-y={rotation}>
      <Box size={[1, 0.08, 0.7]} position={[0, 0.04, 0]} color={color} radius={0.03} />
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[0.3, 0.32, 0.06, 28]} />
        <meshStandardMaterial color="#fff2dd" roughness={1} />
      </mesh>
      {children}
      {/* wire front and roof */}
      {bars.map((x) => (
        <mesh key={x} position={[x, 0.38, 0.34]}>
          <cylinderGeometry args={[0.008, 0.008, 0.64, 6]} />
          <meshStandardMaterial color="#d1d5db" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      <Box size={[1, 0.04, 0.7]} position={[0, 0.72, 0]} color={color} radius={0.02} />
      {[-0.49, 0.49].map((x) => (
        <Box key={x} size={[0.03, 0.68, 0.7]} position={[x, 0.38, 0]} color={color} radius={0.01} />
      ))}
    </group>
  );
}

/** Aquarium with bubbles and swimming Rodin fish. */
function Aquarium({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: 14 }, () => ({ x: (Math.random() - 0.5) * 1.3, z: (Math.random() - 0.5) * 0.4, s: 0.3 + Math.random() * 0.5, o: Math.random() })), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    const m = bubbles.current;
    if (!m) return;
    seeds.forEach((b, i) => {
      const y = ((clock.elapsedTime * b.s + b.o) % 1) * 0.72;
      tmp.position.set(b.x + Math.sin(clock.elapsedTime * 2 + i) * 0.02, 0.2 + y, b.z);
      tmp.scale.setScalar(0.012 + b.s * 0.012);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={position} rotation-y={rotation}>
      {/* stand */}
      <Box size={[1.7, 0.9, 0.62]} position={[0, 0.45, 0]} color="#2f5d50" radius={0.04} />
      <group position={[0, 0.9, 0]}>
        {/* water + glass */}
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.6, 0.82, 0.52]} />
          <meshStandardMaterial color="#7fd3f0" transparent opacity={0.28} roughness={0.05} metalness={0.1} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.04, 0]} receiveShadow>
          <boxGeometry args={[1.56, 0.06, 0.48]} />
          <meshStandardMaterial color="#f3e2b8" roughness={1} />
        </mesh>
        {/* water plants */}
        {[-0.55, -0.35, 0.5, 0.62].map((x, i) => (
          <mesh key={x} position={[x, 0.24 + (i % 2) * 0.05, -0.12]} rotation-z={(i - 1.5) * 0.12}>
            <coneGeometry args={[0.05, 0.42 + (i % 2) * 0.1, 6]} />
            <meshStandardMaterial color="#3fbf7f" roughness={0.8} />
          </mesh>
        ))}
        <Prop name="tropicalFish" position={[0, 0.45, 0]} size={0.2} roam={0.45} />
        <Prop name="fish" position={[0.1, 0.3, 0]} size={0.17} roam={0.32} />
        <Prop name="snail" position={[0.55, 0.07, 0.12]} size={0.12} />
        <instancedMesh ref={bubbles} args={[undefined, undefined, seeds.length]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.7} />
        </instancedMesh>
        {/* lid with a light */}
        <Box size={[1.66, 0.06, 0.58]} position={[0, 0.89, 0]} color={INK} radius={0.02} />
        <pointLight position={[0, 0.7, 0]} intensity={1.6} distance={1.8} color="#bfe9ff" />
      </group>
    </group>
  );
}

/** A parrot on a perch stand, bobbing its head. */
function Perch({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 1.5, 10]} />
        <meshStandardMaterial color="#a8733f" />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.025, 0.025, 0.6, 10]} />
        <meshStandardMaterial color="#a8733f" />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.04, 24]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <Prop name="parrot" position={[0, 1.52, 0]} size={0.42} />
    </group>
  );
}

/** Shelves of pet food bags and toys (simple painted boxes: the Rodin pets are the stars). */
function SupplyShelf({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const colors = ['#ff9f43', '#4f8ef7', '#ff6b6b', '#3fbf7f', '#ffd166', '#9b7bf2'];
  return (
    <group position={position} rotation-y={rotation}>
      <Box size={[2.2, 2.2, 0.45]} position={[0, 1.1, -0.04]} color="#f4e2cc" radius={0.04} />
      {[0.5, 1.15, 1.8].map((y, row) => (
        <group key={y}>
          <Box size={[2.1, 0.05, 0.42]} position={[0, y - 0.05, 0.02]} color="#c98f5a" radius={0.01} />
          {Array.from({ length: 5 }, (_, i) => (
            <Box key={i} size={[0.3, 0.42 - (i % 2) * 0.08, 0.22]} position={[-0.8 + i * 0.4, y + 0.18 - (i % 2) * 0.04, 0.05]} color={colors[(i + row * 2) % colors.length]} radius={0.04} />
          ))}
        </group>
      ))}
    </group>
  );
}

/** Life in the Cozy Study: a cat on the armchair, a trophy and a radio on the shelves, a packed suitcase. */
export function StudyDressing() {
  return (
    <group>
      <Prop name="kitten" position={[3.6, 0.48, 3.62]} size={0.4} rotation={Math.PI + 0.9} />
      <Prop name="trophy" position={[-3.6, 2.1, -4.72]} size={0.38} />
      <Prop name="radio" position={[3.6, 2.1, -4.72]} size={0.42} />
      <Prop name="suitcase" position={[-5.3, 0, 3.0]} size={0.8} rotation={Math.PI / 2} />
      <Prop name="basketball" position={[1.8, 0, 4.3]} size={0.3} />
    </group>
  );
}

export function PetShopRoom() {
  const floor = usePlankTexture('#e7c08f', '#c79a64', [8, 7]);
  const rug = usePatternTexture('#bdeccb', '#ffffff88', 'dots', [3, 2]);
  const paw = useTextTexture(['🐾 PAWS & CLAWS', 'Pet Shop'], { width: 768, height: 300, bg: '#3fbf7f', fg: '#ffffff', border: '#2d3748' });
  return (
    <group>
      <RoomShellBox w={12} d={10} h={3.4} wall="#e6f7ec" wallLow="#3fbf7f" floorTex={floor} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} receiveShadow>
        <circleGeometry args={[2.9, 64]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      {/* North wall (behind the guide): the shop sign, crates with sleeping pets, an aquarium */}
      <mesh position={[0, 2.75, -4.93]}>
        <planeGeometry args={[3.2, 1.25]} />
        <meshStandardMaterial map={paw} emissive="#ffffff" emissiveMap={paw} emissiveIntensity={0.35} roughness={0.7} />
      </mesh>
      <Crate position={[-3.9, 0, -4.4]} color="#4f8ef7">
        <Prop name="puppy" position={[0, 0.12, 0]} size={0.42} rotation={0.4} />
      </Crate>
      <Crate position={[-3.9, 0.74, -4.4]} color="#ff9f43">
        <Prop name="kitten" position={[0, 0.12, 0]} size={0.4} rotation={-0.3} />
      </Crate>
      <Aquarium position={[3.4, 0, -4.55]} />
      {/* East wall: supplies + a parrot */}
      <SupplyShelf position={[5.7, 0, 1.4]} rotation={-Math.PI / 2} />
      <Perch position={[4.9, 0, -2.2]} />
      {/* West wall: window, plants and a turtle pond */}
      <group position={[-5.94, 1.75, -1.2]} rotation-y={Math.PI / 2}>
        <WindowPane width={2.2} height={1.5} curtains="#bdeccb" />
      </group>
      <LightShaft position={[-5.2, 2.6, -1.2]} rotation={[0, 0, 0.9]} width={1.5} length={5} />
      <group position={[-4.6, 0, 2.6]}>
        <mesh position={[0, 0.18, 0]} receiveShadow>
          <cylinderGeometry args={[0.9, 0.95, 0.36, 36]} />
          <meshStandardMaterial color="#c9b79c" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.34, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.8, 36]} />
          <meshStandardMaterial color="#6cc6e8" roughness={0.1} metalness={0.1} />
        </mesh>
        <Prop name="turtle" position={[0.25, 0.36, 0.1]} size={0.36} />
        <Prop name="duck" position={[-0.3, 0.33, -0.2]} size={0.34} roam={0.18} />
      </group>
      {/* South wall (behind the builder): the counter, a little dog that greets customers */}
      <Box size={[2.6, 1, 0.8]} position={[3.2, 0.5, 4.4]} color="#ffd166" radius={0.05} />
      <Box size={[2.7, 0.06, 0.9]} position={[3.2, 1.02, 4.4]} color="#f4ece1" radius={0.02} />
      <Prop name="trophy" position={[2.5, 1.05, 4.4]} size={0.32} />
      <Prop name="telephone" position={[3.7, 1.05, 4.35]} size={0.3} rotation={Math.PI} />
      <Prop name="puppy" position={[1.2, 0, 3.9]} size={0.6} rotation={Math.PI + 0.5} />
      <Prop name="basket" position={[-1.6, 0, 4.2]} size={0.55} />
      <Prop name="soccerBall" position={[-0.6, 0, 4.1]} size={0.3} />
      <Sign lines={['Adopt, don’t shop!', 'Every pet needs a home']} size={[1.8, 0.7]} position={[-3.4, 1.9, 4.92]} rotation={[0, Math.PI, 0]} bg="#fff9f0" fg="#2d3748" border="#3fbf7f" />
      <Plant position={[-5.2, 0, -4.2]} scale={1.2} />
      <Plant position={[5.2, 0, 4.2]} scale={1.1} />
      <Prop name="cactus" position={[5.3, 0, -4.3]} size={0.7} />
      <Prop name="sunflower" position={[-5.3, 0, 4.4]} size={0.8} />
      <PendantLamp position={[0, 3.4, 0]} drop={1.0} shade="#3fbf7f" />
    </group>
  );
}
