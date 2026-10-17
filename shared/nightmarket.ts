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
  elevation?: number;
}

export const MARKET_START: Pose = { x: 0, z: 16, yaw: 0 };
export const MARKET_MEETING = { x: 0, z: 15.5 };
export const MARKET_SHOPS: MarketShop[] = [
  { id: 'noodles', name: 'Moon Noodle House', zh: '月来面馆', owner: 'Uncle Chen', x: -4.4, z: 12, yaw: Math.PI / 2, color: '#cb604b', temporary: false, kinds: ['noodles'] },
  { id: 'tea', name: 'Jade Tea Shop', zh: '玉露茶铺', owner: 'Aunt Lin', x: 19, z: -8, yaw: -Math.PI / 2, color: '#5caa9a', temporary: false, kinds: ['bubble-tea', 'soy-milk'], elevation: 3.6 },
  { id: 'grill', name: 'Lucky Skewer Stall', zh: '如意烤串', owner: 'Master Wu', x: -11, z: -7, yaw: Math.PI / 2, color: '#d28a45', temporary: true, kinds: ['skewer', 'chicken-leg'] },
  { id: 'roast', name: 'Chestnut Cart', zh: '栗香小摊', owner: 'Granny Zhou', x: 5, z: 2, yaw: Math.PI / 2, color: '#b88a58', temporary: true, kinds: ['chestnut', 'sweet-potato'] },
  { id: 'sweets', name: 'Peach Blossom Sweets', zh: '桃花点心', owner: 'Sister Tao', x: -7, z: 9, yaw: Math.PI, color: '#d38b9d', temporary: false, kinds: ['mooncake'] },
  { id: 'pantry', name: 'Lantern General Store', zh: '灯下杂货', owner: 'Mr Sun', x: 5, z: -9, yaw: -Math.PI / 2, color: '#698ba8', temporary: false, kinds: ['tea-egg'] },
  { id: 'dumplings', name: 'Bamboo Dumpling House', zh: '竹里饺子铺', owner: 'Aunt Xu', x: -10, z: -19, yaw: -Math.PI / 2, color: '#799681', temporary: false, kinds: ['dumpling'] },
  { id: 'corn', name: 'Golden Corn Cart', zh: '金穗炭炉', owner: 'Uncle He', x: -3, z: -26, yaw: 0, color: '#c5a162', temporary: true, kinds: ['corn'] },
  { id: 'dessert', name: 'Osmanthus Dessert Shop', zh: '桂香甜品', owner: 'Sister Gui', x: 7, z: -25, yaw: 0, color: '#a8838a', temporary: false, kinds: ['shaved-ice'], elevation: 3.6 },
];

export const shopForKind = (kind: string) => MARKET_SHOPS.find((s) => s.kinds.includes(kind)) ?? MARKET_SHOPS[5];
/** Shop names may contain food words; they are locations, not extra order lines. */
export function marketOrderSpeech(text: string) {
  for (const shop of MARKET_SHOPS) text = text.replace(new RegExp(shop.name, 'gi'), 'the shop');
  for (const path of MARKET_PATHS) text = text.replace(new RegExp(path.name, 'gi'), 'the lane');
  return text;
}
export const shopApproach = (s: MarketShop) => ({ x: s.x + Math.sin(s.yaw) * 2.3, z: s.z + Math.cos(s.yaw) * 2.3 });
export const nearShop = (p: Pick<Pose, 'x' | 'z'>, s: MarketShop) => Math.abs(marketHeight(p) - (s.elevation ?? 0)) < 0.5 && Math.hypot(p.x - shopApproach(s).x, p.z - shopApproach(s).z) <= 2.5;
export const closestShop = (p: Pick<Pose, 'x' | 'z'>) => MARKET_SHOPS.filter((s) => nearShop(p, s)).sort((a, b) => Math.hypot(p.x - shopApproach(a).x, p.z - shopApproach(a).z) - Math.hypot(p.x - shopApproach(b).x, p.z - shopApproach(b).z))[0];
export const atMeeting = (p: Pick<Pose, 'x' | 'z'>) => Math.hypot(p.x - MARKET_MEETING.x, p.z - MARKET_MEETING.z) <= 2.8;

type Point = { x: number; z: number };
// The east wing has a raised gallery. Its only entrance is the stair at (8, -3).
export const MARKET_NODES: Point[] = [
  { x: 0, z: 16 }, { x: 0, z: 6 }, { x: -8, z: 6 },
  { x: -8, z: -3 }, { x: 2, z: -3 }, { x: 2, z: -12 },
  { x: -8, z: -12 }, { x: -13, z: -12 }, { x: -13, z: -23 },
  { x: -3, z: -23 }, { x: 8, z: 6 }, { x: 8, z: -3 },
  { x: 16, z: -3 }, { x: 16, z: -14 }, { x: 7, z: -14 }, { x: 7, z: -22 },
];
export const MARKET_PATHS = [
  { a: 0, b: 1, width: 6.6, name: 'entrance street', level: 0 },
  { a: 1, b: 2, width: 4.6, name: 'Peach Lane', level: 0 },
  { a: 2, b: 3, width: 4, name: 'west alley', level: 0 },
  { a: 3, b: 4, width: 4, name: 'pond courtyard', level: 0 },
  { a: 4, b: 5, width: 3.6, name: 'east courtyard passage', level: 0 },
  { a: 5, b: 6, width: 4, name: 'Chestnut Lane', level: 0 },
  { a: 6, b: 3, width: 3.6, name: 'west courtyard passage', level: 0 },
  { a: 6, b: 7, width: 3.6, name: 'bamboo turn', level: 0 },
  { a: 7, b: 8, width: 3.6, name: 'Bamboo Lane', level: 0 },
  { a: 8, b: 9, width: 4, name: 'corn courtyard', level: 0 },
  { a: 1, b: 10, width: 4.6, name: 'east entrance', level: 0 },
  { a: 10, b: 11, width: 3.6, name: 'stair approach', level: 0 },
  { a: 11, b: 12, width: 2.8, name: 'stone stairs', level: 1 },
  { a: 12, b: 13, width: 3.4, name: 'upper tea gallery', level: 2 },
  { a: 13, b: 14, width: 3.4, name: 'upper bridge', level: 2 },
  { a: 14, b: 15, width: 3.4, name: 'Osmanthus balcony', level: 2 },
];
export const MARKET_ROADS = MARKET_PATHS.map((path) => {
  const a = MARKET_NODES[path.a], b = MARKET_NODES[path.b];
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(a.x - b.x) + path.width, d: Math.abs(a.z - b.z) + path.width, ...path };
});

export function marketHeight(p: Point) {
  if (p.x > 8 && p.x < 16 && Math.abs(p.z + 3) <= 1.4) return (p.x - 8) / 8 * 3.6;
  if (MARKET_ROADS.some((r) => r.level === 2 && Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.z - r.z) <= r.d / 2)) return 3.6;
  return 0;
}

/** Project into the connected street network, with a small body radius from the walls. */
export function collideMarket(p: Point, previous?: Point) {
  let best = { x: 0, z: 0 };
  let distance = Infinity;
  for (const r of MARKET_ROADS) {
    const q = { x: Math.max(r.x - r.w / 2 + 0.25, Math.min(r.x + r.w / 2 - 0.25, p.x)), z: Math.max(r.z - r.d / 2 + 0.25, Math.min(r.z + r.d / 2 - 0.25, p.z)) };
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < distance) { best = q; distance = d; }
  }
  if (previous && Math.abs(marketHeight(best) - marketHeight(previous)) > Math.max(0.12, Math.hypot(best.x - previous.x, best.z - previous.z) * 0.65)) return previous;
  return best;
}

/** Substeps prevent walking through a block when network updates skip several frames. */
export function marketStep(from: Pose, to: Pose, maxDistance: number): Pose {
  const dx = to.x - from.x, dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const scale = distance > maxDistance ? maxDistance / distance : 1;
  const steps = Math.max(1, Math.ceil(distance * scale / 0.2));
  let p = { x: from.x, z: from.z };
  for (let i = 0; i < steps; i++) p = collideMarket({ x: p.x + dx * scale / steps, z: p.z + dz * scale / steps }, p);
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

/** Split the nearest centerline at each endpoint, then find a shortest graph route. */
export function marketRoute(from: Point, to: Point): Point[] {
  const nodes = [...MARKET_NODES];
  const links: { a: number; b: number; cost: number }[] = [];
  const add = (a: number, b: number) => links.push({ a, b, cost: Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) });
  const attach = (p: Point) => {
    const candidates = MARKET_PATHS.map((edge, index) => {
      const a = nodes[edge.a], b = nodes[edge.b];
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / ((b.x - a.x) ** 2 + (b.z - a.z) ** 2)));
      const q = { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
      return { index, q, distance: Math.hypot(p.x - q.x, p.z - q.z) };
    }).sort((a, b) => a.distance - b.distance);
    const pick = candidates[0];
    const id = nodes.push(pick.q) - 1;
    const edge = MARKET_PATHS[pick.index];
    add(id, edge.a); add(id, edge.b);
    return { id, edge: pick.index };
  };
  for (const edge of MARKET_PATHS) add(edge.a, edge.b);
  const start = attach(from), end = attach(to);
  if (start.edge === end.edge) add(start.id, end.id);
  const distances = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  distances[start.id] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || !Number.isFinite(distances[current])) return [];
    if (current === end.id) break;
    visited.add(current);
    for (const edge of links) {
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : -1;
      if (next >= 0 && distances[current] + edge.cost < distances[next]) {
        distances[next] = distances[current] + edge.cost; previous[next] = current;
      }
    }
  }
  const route: Point[] = [to];
  for (let i = end.id; i >= 0; i = previous[i]) route.unshift(nodes[i]);
  return route.filter((p, i) => Math.hypot(p.x - (i ? route[i - 1].x : from.x), p.z - (i ? route[i - 1].z : from.z)) > 0.01);
}

export function marketDirections(pose: Pose, shop?: MarketShop) {
  const target = shop ? shopApproach(shop) : MARKET_MEETING;
  const route = marketRoute(pose, target);
  const next = route[0];
  if (!next || Math.hypot(pose.x - target.x, pose.z - target.z) < 1.2) return shop ? `You are at ${shop.name}. Speak to ${shop.owner} at the counter.` : 'You are at the meeting point. Hand over the shopping bag.';
  const angle = Math.atan2(-(next.x - pose.x), -(next.z - pose.z)) - pose.yaw;
  const delta = Math.atan2(Math.sin(angle), Math.cos(angle));
  const turn = Math.abs(delta) > 2.35 ? 'Turn around' : delta > 0.65 ? 'Turn left' : delta < -0.65 ? 'Turn right' : 'Go straight ahead';
  const stairs = route.some((p) => p.x === 8 && p.z === -3) || (pose.x >= 8 && pose.x <= 16 && Math.abs(pose.z + 3) < 1.4);
  const floorHint = stairs ? marketHeight(target) > marketHeight(pose) ? 'Take the stairs UP, then follow the gallery.' : marketHeight(target) < marketHeight(pose) ? 'Take the stairs DOWN to the ground floor.' : '' : '';
  const midpoint = { x: (pose.x + next.x) / 2, z: (pose.z + next.z) / 2 };
  const lane = MARKET_PATHS.map((path) => {
    const a = MARKET_NODES[path.a], b = MARKET_NODES[path.b];
    const x = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), midpoint.x));
    const z = Math.max(Math.min(a.z, b.z), Math.min(Math.max(a.z, b.z), midpoint.z));
    return { name: path.name, distance: Math.hypot(midpoint.x - x, midpoint.z - z) };
  }).sort((a, b) => a.distance - b.distance)[0].name;
  return `${turn} toward the ${lane}. ${floorHint} ${shop ? '' : 'Meet at the entrance gate.'}`.trim();
}

export const shoppingInstruction = (line: OrderLine) => `Go to ${shopForKind(line.kind).name}${shopForKind(line.kind).elevation ? ' on the upper floor' : ''} and buy ${lineText(line)}, please.`;
