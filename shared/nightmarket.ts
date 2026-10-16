import { getKind, kindsFor } from './catalog';
import { lineText, type CafeState, type OrderLine } from './cafe';
import type { Pose } from './city';
import type { Rng } from './rng';
import type { SceneObject } from './types';

/** The same street geometry is used by rendering, collision, directions and the server. */
export interface MarketShop {
  id: string;
  name: string;
  zh: string;
  owner: string;
  x: number;
  z: number;
  yaw: number;
  color: string;
  temporary: boolean;
  kinds: string[];
}

export const MARKET_START: Pose = { x: 0, z: 16, yaw: 0 };
export const MARKET_MEETING = { x: 0, z: 15.5 };
export const MARKET_SHOPS: MarketShop[] = [
  { id: 'noodles', name: 'Moon Noodle House', zh: '月来面馆', owner: 'Uncle Chen', x: -4.4, z: 12, yaw: Math.PI / 2, color: '#cb604b', temporary: false, kinds: ['noodles', 'dumpling'] },
  { id: 'tea', name: 'Jade Tea Shop', zh: '玉露茶铺', owner: 'Aunt Lin', x: 4.4, z: 12, yaw: -Math.PI / 2, color: '#5caa9a', temporary: false, kinds: ['bubble-tea', 'soy-milk'] },
  { id: 'grill', name: 'Lucky Skewer Stall', zh: '如意烤串', owner: 'Master Wu', x: -10, z: -9, yaw: 0, color: '#d28a45', temporary: true, kinds: ['skewer', 'chicken-leg', 'corn'] },
  { id: 'roast', name: 'Chestnut Cart', zh: '栗香小摊', owner: 'Granny Zhou', x: 10, z: -9, yaw: 0, color: '#b88a58', temporary: true, kinds: ['chestnut', 'sweet-potato'] },
  { id: 'sweets', name: 'Peach Blossom Sweets', zh: '桃花点心', owner: 'Sister Tao', x: -10, z: 9, yaw: Math.PI, color: '#d38b9d', temporary: false, kinds: ['mooncake', 'shaved-ice'] },
  { id: 'pantry', name: 'Lantern General Store', zh: '灯下杂货', owner: 'Mr Sun', x: 10, z: 9, yaw: Math.PI, color: '#698ba8', temporary: false, kinds: ['tea-egg'] },
];

export const shopForKind = (kind: string) => MARKET_SHOPS.find((s) => s.kinds.includes(kind)) ?? MARKET_SHOPS[5];
/** Shop names may contain food words; they are locations, not extra order lines. */
export function marketOrderSpeech(text: string) {
  for (const shop of MARKET_SHOPS) text = text.replace(new RegExp(shop.name, 'gi'), 'the shop');
  return text;
}
export const shopApproach = (s: MarketShop) => ({ x: s.x + Math.sin(s.yaw) * 2.3, z: s.z + Math.cos(s.yaw) * 2.3 });
export const nearShop = (p: Pick<Pose, 'x' | 'z'>, s: MarketShop) => Math.hypot(p.x - shopApproach(s).x, p.z - shopApproach(s).z) <= 2.5;
export const closestShop = (p: Pick<Pose, 'x' | 'z'>) => MARKET_SHOPS.filter((s) => nearShop(p, s)).sort((a, b) => Math.hypot(p.x - shopApproach(a).x, p.z - shopApproach(a).z) - Math.hypot(p.x - shopApproach(b).x, p.z - shopApproach(b).z))[0];
export const atMeeting = (p: Pick<Pose, 'x' | 'z'>) => Math.hypot(p.x - MARKET_MEETING.x, p.z - MARKET_MEETING.z) <= 2.8;

export const MARKET_ROADS = [
  { x: 0, z: 0, w: 6.6, d: 37 },
  { x: 0, z: 6, w: 30, d: 4.6 },
  { x: 0, z: -6, w: 30, d: 4.6 },
];

/** Project into the connected street network, with a small body radius from the walls. */
export function collideMarket(p: { x: number; z: number }) {
  let best = { x: 0, z: 0 };
  let distance = Infinity;
  for (const r of MARKET_ROADS) {
    const q = { x: Math.max(r.x - r.w / 2 + 0.25, Math.min(r.x + r.w / 2 - 0.25, p.x)), z: Math.max(r.z - r.d / 2 + 0.25, Math.min(r.z + r.d / 2 - 0.25, p.z)) };
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < distance) { best = q; distance = d; }
  }
  return best;
}

/** Substeps prevent walking through a block when network updates skip several frames. */
export function marketStep(from: Pose, to: Pose, maxDistance: number): Pose {
  const dx = to.x - from.x, dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const scale = distance > maxDistance ? maxDistance / distance : 1;
  const steps = Math.max(1, Math.ceil(distance * scale / 0.2));
  let p = { x: from.x, z: from.z };
  for (let i = 0; i < steps; i++) p = collideMarket({ x: p.x + dx * scale / steps, z: p.z + dz * scale / steps });
  return { ...p, yaw: Math.atan2(Math.sin(to.yaw), Math.cos(to.yaw)) };
}

export function buildMarket(rng: Rng, specials: string[] = []): CafeState {
  const menu = [...kindsFor('nightmarket'), ...specials.map(getKind).filter((k) => !!k)];
  const objects: SceneObject[] = [];
  const seen = new Set<string>();
  for (const kind of menu) {
    if (seen.has(kind.id)) continue;
    seen.add(kind.id);
    for (const size of kind.sized ? ['small', 'big'] as const : ['regular'] as const) {
      for (let n = 0; n < 3; n++) objects.push({ id: `c${objects.length + 1}`, kind: kind.id, size, color: kind.baseColor, cell: { c: objects.length, r: 0 }, yaw: (rng.next() - 0.5) * 0.4 });
    }
  }
  return { scene: { layoutId: 'nightmarket', objects, landmarks: [] }, tray: [] };
}

/** Centerline waypoints, including the connecting main street, never across a block. */
export function marketRoute(from: Pick<Pose, 'x' | 'z'>, to: { x: number; z: number }) {
  const points: { x: number; z: number }[] = [];
  const branch = (p: { x: number; z: number }) => Math.abs(p.z - 6) < Math.abs(p.z + 6) ? 6 : -6;
  const a = Math.abs(from.x) > 3.05;
  const b = Math.abs(to.x) > 3.05;
  if (a) points.push({ x: from.x, z: branch(from) });
  if (a && b && branch(from) === branch(to)) points.push({ x: to.x, z: branch(to) });
  else {
    points.push({ x: 0, z: a ? branch(from) : from.z });
    points.push({ x: 0, z: b ? branch(to) : to.z });
    if (b) points.push({ x: to.x, z: branch(to) });
  }
  points.push(to);
  return points.filter((p, i) => Math.hypot(p.x - (i ? points[i - 1].x : from.x), p.z - (i ? points[i - 1].z : from.z)) > 0.2);
}

export function marketDirections(pose: Pose, shop?: MarketShop) {
  const target = shop ? shopApproach(shop) : MARKET_MEETING;
  const next = marketRoute(pose, target)[0];
  if (!next || Math.hypot(pose.x - target.x, pose.z - target.z) < 1.2) return shop ? `You are at ${shop.name}. Speak to ${shop.owner} at the counter.` : 'You are at the meeting point. Hand over the shopping bag.';
  const angle = Math.atan2(-(next.x - pose.x), -(next.z - pose.z)) - pose.yaw;
  const delta = Math.atan2(Math.sin(angle), Math.cos(angle));
  const turn = Math.abs(delta) > 2.35 ? 'Turn around' : delta > 0.65 ? 'Turn left' : delta < -0.65 ? 'Turn right' : 'Go straight ahead';
  return `${turn} and follow the ${Math.abs(next.x - pose.x) > Math.abs(next.z - pose.z) ? 'side lane' : 'main street'}. ${shop ? `Look for ${shop.name}.` : 'Meet me at the entrance gate.'}`;
}

export const shoppingInstruction = (line: OrderLine) => `Go to ${shopForKind(line.kind).name} and buy ${lineText(line)}, please.`;
