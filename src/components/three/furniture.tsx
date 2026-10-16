import { RoundedBox, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DECOR_MODELS } from '@shared/catalog';
import type { Palette } from '@shared/levels';
import { asset } from '@/lib/asset';
import { Dust, LightShaft, Sign, useTextTexture } from './env';

/**
 * Furniture kit: rounded, chunky pieces in the clay style, shared by the
 * study, the cafe and the bedroom, plus the Cozy Study room itself.
 */

export const INK = '#2d3748';

/** Wood planks painted on a canvas (repeat-wrapped). */
export function usePlankTexture(base = '#d9a46c', lines = '#b9834f', repeat: [number, number] = [6, 6]) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
      g.fillRect(0, i * 32, 256, 32);
      g.fillStyle = lines;
      g.fillRect(0, i * 32, 256, 2);
      const off = (i * 97) % 256;
      g.fillRect(off, i * 32, 2, 32);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [base, lines, repeat[0], repeat[1]]);
}

/** A soft pattern for rugs / wallpaper. */
export function usePatternTexture(bg: string, dot: string, kind: 'dots' | 'stripes' | 'checks' = 'dots', repeat: [number, number] = [4, 4]) {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = bg;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = dot;
    if (kind === 'dots')
      for (const [x, y] of [
        [32, 32],
        [96, 96],
        [96, 32],
        [32, 96],
      ]) {
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI * 2);
        g.fill();
      }
    else if (kind === 'stripes') for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 14, 128);
    else
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) if ((i + j) % 2) g.fillRect(i * 32, j * 32, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [bg, dot, kind, repeat[0], repeat[1]]);
}

/** A Rodin decor model scaled to a target size (largest side in metres). */
export function Decor({ url, size, position, rotation = 0 }: { url: string; size: number; position: [number, number, number]; rotation?: number }) {
  const gltf = useGLTF(asset(url), false, true);
  const obj = useMemo(() => {
    const c = gltf.scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }, [gltf.scene]);
  return <primitive object={obj} position={position} rotation-y={rotation} scale={size} />;
}

export function Box({ size, position, color, radius = 0.04, rotation, roughness = 0.7, cast = true }: { size: [number, number, number]; position: [number, number, number]; color: string; radius?: number; rotation?: [number, number, number]; roughness?: number; cast?: boolean }) {
  return (
    <RoundedBox args={size} radius={Math.min(radius, ...size.map((s) => s / 2 - 0.001))} smoothness={3} position={position} rotation={rotation} castShadow={cast} receiveShadow>
      <meshStandardMaterial color={color} roughness={roughness} />
    </RoundedBox>
  );
}

/**
 * Four walls + floor + ceiling, built from inward-facing planes: from inside
 * they are solid, from outside they vanish, so an orbit or "dollhouse"
 * camera can look into the room while first-person players see real walls.
 */
export function RoomShellBox({ w, d, h, wall, wallLow, floorTex, ceiling = true }: { w: number; d: number; h: number; wall: string; wallLow?: string; floorTex?: THREE.Texture; ceiling?: boolean }) {
  const walls: { pos: [number, number, number]; rot: number; len: number }[] = [
    { pos: [0, 0, -d / 2], rot: 0, len: w },
    { pos: [0, 0, d / 2], rot: Math.PI, len: w },
    { pos: [-w / 2, 0, 0], rot: Math.PI / 2, len: d },
    { pos: [w / 2, 0, 0], rot: -Math.PI / 2, len: d },
  ];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floorTex} color={floorTex ? '#ffffff' : '#e8cfa8'} roughness={0.85} />
      </mesh>
      {walls.map((wl, i) => (
        <group key={i} position={wl.pos} rotation-y={wl.rot}>
          <mesh position={[0, h / 2, 0]} receiveShadow>
            <planeGeometry args={[wl.len, h]} />
            <meshStandardMaterial color={wall} roughness={0.95} />
          </mesh>
          {wallLow && (
            <mesh position={[0, 0.475, 0.004]} receiveShadow>
              <planeGeometry args={[wl.len, 0.95]} />
              <meshStandardMaterial color={wallLow} roughness={0.8} />
            </mesh>
          )}
          <mesh position={[0, 0.96, 0.008]}>
            <planeGeometry args={[wl.len, 0.05]} />
            <meshStandardMaterial color="#ffffff" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.06, 0.01]}>
            <planeGeometry args={[wl.len, 0.12]} />
            <meshStandardMaterial color="#fff9f0" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {ceiling && (
        <mesh rotation-x={Math.PI / 2} position={[0, h, 0]}>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial color="#fffaf2" roughness={1} />
        </mesh>
      )}
    </group>
  );
}

/** Window with frame, sill, glow and optional curtains. Placed on a wall facing +z in local space. */
export function WindowPane({ width = 1.8, height = 1.5, glow = '#fff3d4', curtains = '#f7a8b8', light = true }: { width?: number; height?: number; glow?: string; curtains?: string | null; light?: boolean }) {
  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {/* frame */}
      {[
        [0, height / 2, width + 0.16, 0.1],
        [0, -height / 2, width + 0.16, 0.1],
        [0, 0, width, 0.06],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.02]}>
          <boxGeometry args={[w, h, 0.08]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
      ))}
      {[-width / 2, 0, width / 2].map((x) => (
        <mesh key={x} position={[x, 0, 0.02]}>
          <boxGeometry args={[x === 0 ? 0.06 : 0.1, height, 0.08]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
      ))}
      <Box size={[width + 0.4, 0.07, 0.24]} position={[0, -height / 2 - 0.06, 0.1]} color="#ffffff" radius={0.02} />
      {curtains &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * (width / 2 + 0.22), 0.05, 0.12]} castShadow>
            <boxGeometry args={[0.36, height + 0.5, 0.08]} />
            <meshStandardMaterial color={curtains} roughness={0.95} />
          </mesh>
        ))}
      {light && <pointLight position={[0, 0, 0.6]} intensity={1.4} distance={4} color={glow} />}
    </group>
  );
}

export function PendantLamp({ position, color = '#ffd27a', shade = '#2d3748', drop = 0.9 }: { position: [number, number, number]; color?: string; shade?: string; drop?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, -drop / 2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, drop, 6]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, -drop, 0]} castShadow>
        <coneGeometry args={[0.32, 0.3, 28, 1, true]} />
        <meshStandardMaterial color={shade} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -drop - 0.1, 0]}>
        <sphereGeometry args={[0.09, 16, 12]} />
        <meshStandardMaterial color="#fff6dd" emissive={color} emissiveIntensity={4} toneMapped={false} />
      </mesh>
      <pointLight position={[0, -drop - 0.25, 0]} intensity={6} distance={6} decay={1.6} color={color} castShadow={false} />
    </group>
  );
}

export function FloorLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.06, 24]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.6, 8]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.34, 24, 1, true]} />
        <meshStandardMaterial color="#fff1c9" emissive="#ffcf70" emissiveIntensity={1.2} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.65, 0]} intensity={3} distance={4.5} color="#ffd38a" />
    </group>
  );
}

export function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <Decor url={DECOR_MODELS.plant} size={0.95 * scale} position={position} />;
}

/** An open-fronted shelf frame: back, sides, top, plinth and boards at the given heights. */
export function OpenShelf({ w, h, d, boards, color, inner = '#7a5136' }: { w: number; h: number; d: number; boards: number[]; color: string; inner?: string }) {
  const t = 0.05;
  return (
    <group>
      <Box size={[w, h, 0.04]} position={[0, h / 2, -d / 2 + 0.02]} color={inner} radius={0.01} />
      {[-1, 1].map((sx) => (
        <Box key={sx} size={[t, h, d]} position={[sx * (w / 2 - t / 2), h / 2, 0]} color={color} radius={0.015} />
      ))}
      <Box size={[w, t, d]} position={[0, h - t / 2, 0]} color={color} radius={0.015} />
      <Box size={[w, 0.08, d]} position={[0, 0.04, 0]} color={color} radius={0.015} />
      {boards.map((y) => (
        <Box key={y} size={[w - t * 2, 0.035, d - 0.04]} position={[0, y - 0.0175, 0.01]} color={color} radius={0.01} />
      ))}
    </group>
  );
}

/** A shelf unit with Rodin book stacks and little props. */
export function Bookshelf({ position, rotation = 0, width = 1.8, height = 2.1, color = '#c98f5a' }: { position: [number, number, number]; rotation?: number; width?: number; height?: number; color?: string }) {
  const boards = [0.5, 1.02, 1.54];
  const tops = [0.08, ...boards];
  return (
    <group position={position} rotation-y={rotation}>
      <OpenShelf w={width} h={height} d={0.42} boards={boards} color={color} />
      {tops.map((y, r) => (
        <group key={r}>
          <Decor url={DECOR_MODELS.books} size={0.36} position={[-width / 4 + (r % 2) * 0.35, y, 0.02]} rotation={r * 0.7} />
          {r % 2 === 0 && (
            <mesh position={[width / 4, y + 0.09, 0.04]} castShadow>
              <sphereGeometry args={[0.09, 16, 12]} />
              <meshStandardMaterial color={['#ff6b6b', '#ffd166', '#9b7bf2', '#3fbf7f'][r]} roughness={0.4} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export function Armchair({ position, rotation = 0, color = '#9b7bf2' }: { position: [number, number, number]; rotation?: number; color?: string }) {
  return (
    <group position={position} rotation-y={rotation}>
      <Box size={[1.0, 0.42, 0.9]} position={[0, 0.25, 0]} color={color} radius={0.14} />
      <Box size={[1.0, 0.7, 0.24]} position={[0, 0.7, -0.36]} color={color} radius={0.12} />
      {[-0.5, 0.5].map((x) => (
        <Box key={x} size={[0.2, 0.42, 0.85]} position={[x, 0.55, 0]} color={color} radius={0.09} />
      ))}
      <Box size={[0.78, 0.12, 0.62]} position={[0, 0.5, 0.08]} color="#fff4e6" radius={0.06} />
    </group>
  );
}

export function Globe({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.3;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.06, 20]} />
        <meshStandardMaterial color="#b9834f" />
      </mesh>
      <mesh ref={ref} position={[0, 0.3, 0]} rotation-z={0.4} castShadow>
        <sphereGeometry args={[0.2, 32, 24]} />
        <meshStandardMaterial color="#4f8ef7" roughness={0.4} />
      </mesh>
      <mesh position={[0.09, 0.36, 0.12]} rotation-z={0.4}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color="#3fbf7f" roughness={0.6} />
      </mesh>
    </group>
  );
}

export function WallClock({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const min = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (min.current) min.current.rotation.z = -clock.elapsedTime * 0.2;
  });
  return (
    <group position={position} rotation-y={rotation}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, 0, -0.005]}>
        <torusGeometry args={[0.32, 0.04, 8, 32]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh ref={min} position={[0, 0, 0.04]}>
        <boxGeometry args={[0.03, 0.4, 0.01]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <mesh position={[0.06, 0.04, 0.045]} rotation-z={-0.9}>
        <boxGeometry args={[0.035, 0.22, 0.01]} />
        <meshStandardMaterial color="#ff6b6b" />
      </mesh>
    </group>
  );
}

/** A framed poster with painted text. */
export function Poster({ lines, position, rotation = 0, size = [1.1, 0.8], bg = '#fdbcb4' }: { lines: string[]; position: [number, number, number]; rotation?: number; size?: [number, number]; bg?: string }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[size[0] + 0.1, size[1] + 0.1, 0.04]} />
        <meshStandardMaterial color={INK} />
      </mesh>
      <Sign lines={lines} size={size} position={[0, 0, 0.005]} bg={bg} border="#ffffff" />
    </group>
  );
}

/** The Cozy Study around the play table: bookshelves, a sunny window, lamps, a reading corner. */
export function StudyRoom({ palette, sign }: { palette?: Palette; sign?: string }) {
  const floor = usePlankTexture(palette?.floor ?? '#e3b580', '#c48e58', [8, 7]);
  const rug = usePatternTexture(palette?.accent ?? '#c9f7d4', '#ffffff66', 'dots', [3, 2]);
  const chalk = useTextTexture(sign ? [sign, 'your left ≠ my left'] : ['Say it clearly!', 'your left ≠ my left'], { width: 768, height: 384, bg: '#2f5d50', fg: '#f6f1e3', border: '#c48e58' });
  return (
    <group>
      <RoomShellBox w={12} d={10} h={3.4} wall={palette?.wall ?? '#fde6dc'} wallLow={palette?.wallLow ?? '#f7c9b8'} floorTex={floor} />
      {/* rug under the table */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} receiveShadow>
        <circleGeometry args={[2.9, 64]} />
        <meshStandardMaterial map={rug} roughness={1} />
      </mesh>
      {/* North wall (behind the guide): bookshelves + map + clock */}
      <Bookshelf position={[-3.6, 0, -4.7]} />
      <Bookshelf position={[3.6, 0, -4.7]} color="#b98a63" />
      <Poster lines={['WORLD MAP', '🌍 N ↑']} position={[0, 2.05, -4.93]} size={[2.2, 1.2]} bg="#add8e6" />
      <WallClock position={[0, 3.0, -4.9]} />
      {/* South wall (behind the builder): chalkboard, cork board, reading corner */}
      <group position={[0, 1.7, 4.93]} rotation-y={Math.PI}>
        <mesh>
          <planeGeometry args={[2.6, 1.3]} />
          <meshStandardMaterial map={chalk} roughness={0.9} />
        </mesh>
      </group>
      <Poster lines={['TODAY', '1. Find it', '2. Place it']} position={[-3.2, 1.8, 4.92]} rotation={Math.PI} size={[1.0, 1.1]} bg="#ffd166" />
      <Armchair position={[3.6, 0, 3.6]} rotation={Math.PI + 0.5} />
      <FloorLamp position={[4.7, 0, 4.3]} />
      <Globe position={[2.5, 0.5, 4.2]} />
      <Box size={[0.6, 0.5, 0.6]} position={[2.5, 0.25, 4.2]} color="#c98f5a" radius={0.05} />
      {/* East wall: sunny window with a beam of light */}
      <group position={[5.94, 1.75, -0.6]} rotation-y={-Math.PI / 2}>
        <WindowPane width={2.4} height={1.6} />
      </group>
      <LightShaft position={[5.2, 2.6, -0.6]} rotation={[0, 0, -0.9]} width={1.6} length={5} />
      {/* West wall: door + plants */}
      <group position={[-5.94, 0, 1.6]} rotation-y={Math.PI / 2}>
        <Box size={[1.1, 2.2, 0.08]} position={[0, 1.1, 0]} color="#c98f5a" radius={0.03} />
        <mesh position={[0.4, 1.05, 0.06]}>
          <sphereGeometry args={[0.05, 12, 10]} />
          <meshStandardMaterial color="#ffd166" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
      <Plant position={[-5.2, 0, -4.2]} scale={1.3} />
      <Plant position={[5.2, 0, -4.2]} scale={1.1} />
      <Plant position={[-5.2, 0, 4.2]} />
      <PendantLamp position={[0, 3.4, 0]} drop={1.0} />
      <Dust area={[11, 3, 9]} center={[0, 1.7, 0]} />
    </group>
  );
}
