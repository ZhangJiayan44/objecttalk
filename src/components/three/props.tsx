import { Html, useGLTF } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getKind } from '@shared/catalog';
import { DECOR } from '@shared/wave4';
import { asset } from '@/lib/asset';
import { speak } from '@/lib/speech';
import { addWord } from '@/lib/words';
import { clickInteracts } from './controls';

/**
 * Scenery kit: Rodin props that make every place feel lived-in, and the
 * "word card" interaction that turns scenery into vocabulary. Point at any
 * prop with the crosshair (or tap it): its English name pops up,
 * a click says the word and saves it to the word book. Pets idle (breathe,
 * look around, hop), so a room never feels frozen.
 */

export type DecorName = keyof typeof DECOR;

/** English + Chinese for scenery props (mission items carry their own names in the catalog). */
export const DECOR_WORDS: Partial<Record<DecorName, [string, string]>> = {
  cactus: ['cactus', '仙人掌'],
  tulip: ['tulip', '郁金香'],
  sunflower: ['sunflower', '向日葵'],
  rose: ['rose', '玫瑰'],
  seedling: ['seedling', '幼苗'],
  pineTree: ['pine tree', '松树'],
  bicycle: ['bicycle', '自行车'],
  car: ['car', '小汽车'],
  bus: ['bus', '公交车'],
  taxi: ['taxi', '出租车'],
  postbox: ['postbox', '邮筒'],
  motorScooter: ['scooter', '电动车/摩托车'],
  truck: ['truck', '卡车'],
  ambulance: ['ambulance', '救护车'],
  shoppingCart: ['shopping cart', '购物车'],
  kickScooter: ['kick scooter', '滑板车'],
  balloon: ['balloon', '气球'],
  kite: ['kite', '风筝'],
  soccerBall: ['football', '足球'],
  basketball: ['basketball', '篮球'],
  basket: ['basket', '篮子'],
  bucket: ['bucket', '水桶'],
  umbrella: ['umbrella', '雨伞'],
  gift: ['present', '礼物'],
  trophy: ['trophy', '奖杯'],
  candle: ['candle', '蜡烛'],
  laptop: ['laptop', '笔记本电脑'],
  television: ['TV', '电视'],
  radio: ['radio', '收音机'],
  telephone: ['telephone', '电话'],
  mantelClock: ['clock', '钟'],
  picture: ['picture', '画'],
  chair: ['chair', '椅子'],
  suitcase: ['suitcase', '行李箱'],
  handbag: ['handbag', '手提包'],
  dice: ['dice', '骰子'],
  lantern: ['lantern', '灯笼'],
  bird: ['bird', '小鸟'],
  swan: ['swan', '天鹅'],
  tropicalFish: ['tropical fish', '热带鱼'],
  fish: ['fish', '鱼'],
  snail: ['snail', '蜗牛'],
  kitten: ['cat', '猫'],
  puppy: ['dog', '狗'],
  duck: ['duck', '鸭子'],
  parrot: ['parrot', '鹦鹉'],
  turtle: ['turtle', '乌龟'],
};

const ANIMALS = new Set<DecorName>(['kitten', 'puppy', 'duck', 'parrot', 'turtle', 'bird', 'swan', 'fish', 'tropicalFish', 'snail']);

/** A Rodin model, normalized (largest side = `size` metres), resting on y = 0, centred. */
export function useProp(url: string) {
  const gltf = useGLTF(asset(url), false, true);
  return useMemo(() => {
    const c = gltf.scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    c.position.set(-center.x, -box.min.y, -center.z);
    const g = new THREE.Group();
    g.add(c);
    g.userData.unit = 1 / Math.max(size.x, size.y, size.z, 1e-6);
    return g;
  }, [gltf.scene]);
}

export interface PropProps {
  name: DecorName;
  position: [number, number, number];
  size: number;
  rotation?: number;
  /** Gentle idle motion (default on for animals). */
  alive?: boolean;
  /** Word card on hover/tap (default on). */
  word?: boolean;
  /** Swim / flutter in a small circle (fish, birds). */
  roam?: number;
}

/** One scenery prop: an idle-animated Rodin model that teaches its name when you look at it. */
export function Prop({ name, position, size, rotation = 0, alive, word = true, roam = 0 }: PropProps) {
  const obj = useProp(DECOR[name]);
  const ref = useRef<THREE.Group>(null);
  const seed = useMemo(() => Math.random() * 10, []);
  const live = alive ?? ANIMALS.has(name);
  const [hot, setHot] = useState(false);
  const hop = useRef(0);
  useFrame(({ clock }, dt) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime + seed;
    if (roam) {
      g.position.x = position[0] + Math.cos(t * 0.5) * roam;
      g.position.z = position[2] + Math.sin(t * 0.5) * roam;
      g.rotation.y = -t * 0.5 + Math.PI;
    }
    if (live) {
      const breathe = 1 + Math.sin(t * 2.2) * 0.025;
      g.scale.set(size * obj.userData.unit, size * obj.userData.unit * breathe, size * obj.userData.unit);
      if (!roam) g.rotation.y = rotation + Math.sin(t * 0.6) * 0.35;
      hop.current = Math.max(0, hop.current - dt * 2.5);
      g.position.y = position[1] + Math.sin(hop.current * Math.PI) * 0.12 * size;
    }
  });
  const card = word ? DECOR_WORDS[name] : undefined;
  return (
    <group
      ref={ref}
      position={position}
      rotation-y={rotation}
      scale={size * obj.userData.unit}
      onPointerOver={card ? (e: ThreeEvent<PointerEvent>) => (e.stopPropagation(), setHot(true)) : undefined}
      onPointerOut={card ? () => setHot(false) : undefined}
      onClick={
        card
          ? (e: ThreeEvent<MouseEvent>) => {
              if (!clickInteracts()) return;
              e.stopPropagation();
              hop.current = 1;
              speak(card[0], { rate: 0.9 });
              addWord({ en: card[0], zh: card[1], source: 'scene' });
            }
          : undefined
      }
    >
      <primitive object={obj} />
      {hot && card && <WordCard en={card[0]} y={1.15} />}
    </group>
  );
}

/** The little floating label. Scales with the object, not the screen. */
export function WordCard({ en, y = 1.1, hint = true }: { en: string; y?: number; hint?: boolean }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={4} zIndexRange={[14, 0]} style={{ pointerEvents: 'none' }}>
      <div className="flex flex-col items-center whitespace-nowrap rounded-2xl border-2 border-ink bg-white px-2.5 py-1 font-display shadow-[2px_2px_0_#2d3748]">
        <span className="text-base leading-tight font-semibold">{en}</span>
        {hint && <span className="text-[10px] leading-tight text-ink/40">click: hear it · save it</span>}
      </div>
    </Html>
  );
}

/** The word card for a mission item kind (its catalog name + Chinese). */
export function kindWords(kind: string): [string, string] | null {
  const k = getKind(kind);
  return k ? [k.name, k.zh?.split('/')[0] ?? ''] : null;
}

/** Warm the cache for a set of props (call in the lobby or while the countdown runs). */
export function preloadProps(names: DecorName[]) {
  for (const n of names) useGLTF.preload(asset(DECOR[n]), false, true);
}
