import { Environment, Lightformer } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useRenderQuality } from './performance';

/**
 * Atmosphere kit shared by every level: post-processing (ambient occlusion,
 * bloom on lamps, vignette), soft light shafts,
 * painted canvas textures for signs and menus, cartoon clouds. No downloaded
 * HDRs or textures: everything is generated in the browser.
 */

/**
 * Bloom only catches real light sources (lamps, neon, screens: emissive above 1.0
 * in linear HDR), never sunlit walls, so the picture stays crisp instead of hazy.
 */
export function PostFx({ bloom = 0.4, vignette = 0.38, ao = true }: { bloom?: number; vignette?: number; ao?: boolean }) {
  const quality = useRenderQuality();
  if (quality === 'off') return null;
  if (quality === 'low')
    return (
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={bloom * 0.8} luminanceThreshold={1.1} luminanceSmoothing={0.08} />
        <Vignette eskil={false} offset={0.28} darkness={vignette} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {ao ? <N8AO aoRadius={0.6} intensity={2.2} distanceFalloff={0.6} quality="medium" halfRes /> : <></>}
      <Bloom mipmapBlur intensity={bloom} luminanceThreshold={1.05} luminanceSmoothing={0.08} />
      <Vignette eskil={false} offset={0.26} darkness={vignette} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

/** Image-based lighting from a few soft panels, so PBR Rodin models look rich without an HDR download. */
export function SoftIBL({ warm = '#ffe0c8', cool = '#d6ecff', intensity = 1 }: { warm?: string; cool?: string; intensity?: number }) {
  return (
    <Environment resolution={128} frames={1}>
      <Lightformer intensity={2 * intensity} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
      <Lightformer intensity={1.2 * intensity} position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[8, 4, 1]} color={warm} />
      <Lightformer intensity={1.2 * intensity} position={[6, 2, -1]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} color={cool} />
      <Lightformer intensity={0.7 * intensity} position={[0, 1, 7]} scale={[10, 2, 1]} color="#fff6e0" />
    </Environment>
  );
}

let shaftTex: THREE.Texture | null = null;
function shaftTexture() {
  if (shaftTex) return shaftTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  // soften the sides
  const side = g.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.25, 'rgba(0,0,0,0)');
  side.addColorStop(0.75, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 64, 256);
  shaftTex = new THREE.CanvasTexture(c);
  return shaftTex;
}

/** A soft beam of sunlight from a window (additive, no shadows, cheap). */
export function LightShaft({ position, rotation = [0, 0, 0], width = 1.4, length = 4, color = '#fff1c9', opacity = 0.22 }: { position: [number, number, number]; rotation?: [number, number, number]; width?: number; length?: number; color?: string; opacity?: number }) {
  const tex = useMemo(() => (typeof document === 'undefined' ? null : shaftTexture()), []);
  return (
    <group position={position} rotation={rotation}>
      {[0, Math.PI / 2].map((r) => (
        <mesh key={r} rotation-y={r} position={[0, -length / 2, 0]}>
          <planeGeometry args={[width, length]} />
          <meshBasicMaterial map={tex} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const texCache = new Map<string, THREE.CanvasTexture>();

/** Painted text on a canvas: signs, menu boards, posters, street names. */
export function useTextTexture(
  lines: string[],
  opts: { width?: number; height?: number; bg?: string; fg?: string; font?: string; border?: string; align?: 'center' | 'left'; lineHeight?: number } = {},
) {
  const key = JSON.stringify([lines, opts]);
  return useMemo(() => {
    const hit = texCache.get(key);
    if (hit) return hit;
    const w = opts.width ?? 512;
    const h = opts.height ?? 256;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = opts.bg ?? '#ffffff';
    g.fillRect(0, 0, w, h);
    if (opts.border) {
      g.strokeStyle = opts.border;
      g.lineWidth = Math.max(6, w / 60);
      g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    }
    g.fillStyle = opts.fg ?? '#2d3748';
    g.textBaseline = 'middle';
    g.textAlign = opts.align ?? 'center';
    const lh = opts.lineHeight ?? h / (lines.length + 0.6);
    const font = opts.font ?? `bold ${Math.round(lh * 0.62)}px Fredoka, "Fredoka Variable", "Nunito", sans-serif`;
    g.font = font;
    lines.forEach((line, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * lh;
      g.fillText(line, opts.align === 'left' ? w * 0.07 : w / 2, y, w * 0.9);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    texCache.set(key, tex);
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** A flat sign with painted text. */
export function Sign({ lines, size = [1.6, 0.5], position, rotation, bg = '#ffffff', fg = '#2d3748', border = '#2d3748', emissive = 0 }: { lines: string[]; size?: [number, number]; position: [number, number, number]; rotation?: [number, number, number]; bg?: string; fg?: string; border?: string; emissive?: number }) {
  const tex = useTextTexture(lines, { width: Math.round(256 * (size[0] / size[1])), height: 256, bg, fg, border });
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} roughness={0.6} emissive={emissive ? '#ffffff' : '#000000'} emissiveMap={emissive ? tex : null} emissiveIntensity={emissive} />
    </mesh>
  );
}

/** A puffy cartoon cloud made of spheres. */
export function Cloud({ position, scale = 1, speed = 0.4 }: { position: [number, number, number]; scale?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null);
  const puffs = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ x: (i - 2.5) * 1.6 + Math.random(), y: Math.random() * 0.9, z: (Math.random() - 0.5) * 1.6, r: 1.3 + Math.random() * 1.1 })), []);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.x += dt * speed;
    if (ref.current.position.x > 140) ref.current.position.x = -140;
  });
  return (
    <group ref={ref} position={position} scale={scale}>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.r, 16, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={1} emissive="#ffffff" emissiveIntensity={0.15} />
        </mesh>
      ))}
    </group>
  );
}

/** Big gradient sky dome. */
export function SkyDome({ top = '#7ec8f0', bottom = '#fdf3e1', radius = 260 }: { top?: string; bottom?: string; radius?: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.4 + 0.15, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
      }),
    [top, bottom],
  );
  return (
    <mesh material={mat}>
      <sphereGeometry args={[radius, 32, 16]} />
    </mesh>
  );
}
