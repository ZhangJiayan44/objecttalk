import { MARKET_NODES, MARKET_ROADS, MARKET_SHOPS, MARKET_UPPER_HEIGHT, type MarketShop } from './nightmarket';

export interface MarketRect { x: number; z: number; w: number; d: number }
export interface MarketRail { from: [number, number, number]; to: [number, number, number] }
const EPS = 0.00001;
export const insideRect = (p: { x: number; z: number }, r: MarketRect, margin = 0) => Math.abs(p.x - r.x) < r.w / 2 + margin - EPS && Math.abs(p.z - r.z) < r.d / 2 + margin - EPS;
export const overlapArea = (a: MarketRect, b: MarketRect) => Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2)) * Math.max(0, Math.min(a.z + a.d / 2, b.z + b.d / 2) - Math.max(a.z - a.d / 2, b.z - b.d / 2));

/** Transform an authored local rectangle to an axis-aligned footprint (shops face cardinal directions). */
export function shopRect(shop: MarketShop, local: MarketRect): MarketRect {
  const c = Math.cos(shop.yaw), s = Math.sin(shop.yaw);
  return { x: shop.x + c * local.x + s * local.z, z: shop.z - s * local.x + c * local.z, w: Math.abs(c) * local.w + Math.abs(s) * local.d, d: Math.abs(s) * local.w + Math.abs(c) * local.d };
}
export const shopRoofBounds = (shop: MarketShop) => shopRect(shop, { x: 0, z: -0.6, w: (shop.temporary ? 3.8 : 4.8) + 0.55, d: shop.temporary ? 2.6 : 4.04 });
export const shopBodyBounds = (shop: MarketShop) => shopRect(shop, { x: 0, z: -0.1, w: shop.temporary ? 3.4 : 4.3, d: 3.8 });

/** The courtyard is visibly occupied right up to its non-walkable boundary. */
export const MARKET_GARDENS = [
  { id: 'lotus-courtyard', x: -3, z: -7.5, w: 5.8, d: 4.7, style: 'pond' },
  { id: 'bamboo-courtyard', x: -4.65, z: 1.35, w: 2.5, d: 4.4, style: 'bamboo' },
] as const;

/** Furnished pockets occupy blocked land, with a clearance from the playable streets. */
export const MARKET_DECOR_PLOTS = [
  { id: 'west-tea-court', x: -15.8, z: -0.2, w: 4.5, d: 5, style: 'tea' },
  { id: 'east-supply-yard', x: 17, z: 5.3, w: 6, d: 6, style: 'supplies' },
  { id: 'entrance-flower-court', x: -7.5, z: 17, w: 4.2, d: 3, style: 'flowers' },
  { id: 'north-bamboo-grove', x: 12.8, z: -24, w: 4.2, d: 6.2, style: 'bamboo' },
  { id: 'pottery-preparation', x: 2, z: -27, w: 3, d: 3, style: 'pottery' },
] as const;

export const MARKET_STAIR = { from: MARKET_NODES[11], to: MARKET_NODES[12], width: 2.8, steps: 24 };
const run = MARKET_STAIR.to.x - MARKET_STAIR.from.x;
const stairOpening: MarketRect = { x: (MARKET_STAIR.from.x + MARKET_STAIR.to.x) / 2, z: MARKET_STAIR.from.z, w: run, d: MARKET_STAIR.width };
export const MARKET_STEPS = Array.from({ length: MARKET_STAIR.steps }, (_, i) => ({
  x: MARKET_STAIR.from.x + (i + 0.5) * run / MARKET_STAIR.steps,
  z: MARKET_STAIR.from.z,
  y: (i + 0.5) * MARKET_UPPER_HEIGHT / MARKET_STAIR.steps,
  w: run / MARKET_STAIR.steps - 0.012,
  d: MARKET_STAIR.width,
  h: MARKET_UPPER_HEIGHT / MARKET_STAIR.steps,
}));

const coordinates = (rects: readonly MarketRect[], axis: 'x' | 'z') => [...new Set(rects.flatMap((r) => {
  const span = axis === 'x' ? r.w : r.d;
  return [+(r[axis] - span / 2).toFixed(6), +(r[axis] + span / 2).toFixed(6)];
}))].sort((a, b) => a - b);

/** Exact rectangle union minus cutouts, partitioned into non-overlapping surfaces. */
export function partitionMarketRects(rects: readonly MarketRect[], cutouts: readonly MarketRect[] = []): MarketRect[] {
  const xs = coordinates([...rects, ...cutouts], 'x'), zs = coordinates([...rects, ...cutouts], 'z');
  const result: MarketRect[] = [];
  let active = new Map<string, MarketRect>();
  for (let j = 0; j < zs.length - 1; j++) {
    const next = new Map<string, MarketRect>();
    let start = -1;
    for (let i = 0; i < xs.length; i++) {
      const p = { x: (xs[i] + xs[i + 1]) / 2, z: (zs[j] + zs[j + 1]) / 2 };
      const filled = i < xs.length - 1 && rects.some((r) => insideRect(p, r)) && !cutouts.some((r) => insideRect(p, r));
      if (filled && start < 0) start = i;
      if (!filled && start >= 0) {
        const key = `${xs[start]}:${xs[i]}`;
        let r = active.get(key);
        if (r) {
          const minZ = r.z - r.d / 2;
          r.z = (minZ + zs[j + 1]) / 2;
          r.d = zs[j + 1] - minZ;
        } else {
          r = { x: (xs[start] + xs[i]) / 2, z: (zs[j] + zs[j + 1]) / 2, w: xs[i] - xs[start], d: zs[j + 1] - zs[j] };
          result.push(r);
        }
        next.set(key, r);
        start = -1;
      }
    }
    active = next;
  }
  return result;
}

const upperRoads = MARKET_ROADS.filter((r) => r.level === 2);
export const MARKET_GROUND_PAVING = partitionMarketRects(MARKET_ROADS.filter((r) => r.level === 0));
export const MARKET_SHOP_PLATFORMS = MARKET_SHOPS.filter((s) => s.elevation).map((s) => shopRect(s, { x: 0, z: -0.1, w: 4.5, d: 4 }));
export const MARKET_MERCHANT_PLATFORMS: MarketRect[] = [
  { x: 19.5, z: -16.5, w: 4.4, d: 1.7 },
  ...[-3.3, 1.8].map((x) => ({ x, z: -17.1, w: 3.8, d: 3 })),
];
export const MARKET_DECKS = partitionMarketRects([...upperRoads, ...MARKET_SHOP_PLATFORMS, ...MARKET_MERCHANT_PLATFORMS], [stairOpening]);

/** Piers stay outside street clearances and ground-floor eaves, including at crossing junctions. */
export const MARKET_PIERS: { x: number; z: number }[] = [];
const addPier = (x: number, z: number) => {
  if (MARKET_PIERS.some((p) => Math.hypot(p.x - x, p.z - z) < 0.5)) return;
  if (MARKET_ROADS.some((r) => r.level === 0 && insideRect({ x, z }, r, 0.55))) return;
  if (MARKET_SHOPS.some((s) => !s.elevation && insideRect({ x, z }, shopRoofBounds(s), 0.35))) return;
  MARKET_PIERS.push({ x, z });
};
for (const road of upperRoads) {
  const a = MARKET_NODES[road.a], b = MARKET_NODES[road.b];
  const length = Math.hypot(b.x - a.x, b.z - a.z), count = Math.ceil(length / 4.5);
  const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
  for (let i = 0; i <= count; i++) for (const side of [-1, 1]) addPier(a.x + (b.x - a.x) * i / count + side * nx * (road.width / 2 + 0.3), a.z + (b.z - a.z) * i / count + side * nz * (road.width / 2 + 0.3));
}
for (const shop of MARKET_SHOPS.filter((s) => s.elevation)) for (const x of [-1.96, 1.96]) for (const z of [-1.7, 1.55]) {
  const p = shopRect(shop, { x, z, w: 0, d: 0 }); addPier(p.x, p.z);
}
for (const platform of MARKET_MERCHANT_PLATFORMS) for (const x of [-1, 1]) for (const z of [-1, 1]) {
  addPier(platform.x + x * (platform.w / 2 - 0.3), platform.z + z * (platform.d / 2 - 0.3));
}

/** Continuous board spacing across every bridge junction, without duplicate plank faces. */
export const MARKET_DECK_BOARDS = MARKET_DECKS.flatMap((deck) => {
  const min = deck.z - deck.d / 2, max = deck.z + deck.d / 2;
  const boards: (MarketRect & { color: string })[] = [];
  for (let i = Math.floor(min / 0.42); i <= Math.floor(max / 0.42); i++) {
    const lo = Math.max(min, i * 0.42 + 0.018), hi = Math.min(max, (i + 1) * 0.42 - 0.018);
    if (hi - lo > 0.008) boards.push({ x: deck.x, z: (lo + hi) / 2, w: deck.w, d: hi - lo, color: Math.abs(i) % 3 ? '#bba07c' : '#c4aa86' });
  }
  return boards;
});

/** Outer edges of the union; internal bridge seams never get their own rail. */
function deckEdges(): MarketRail[] {
  const xs = coordinates(MARKET_DECKS, 'x'), zs = coordinates(MARKET_DECKS, 'z');
  const filled = (i: number, j: number) => i >= 0 && j >= 0 && i < xs.length - 1 && j < zs.length - 1 && MARKET_DECKS.some((r) => insideRect({ x: (xs[i] + xs[i + 1]) / 2, z: (zs[j] + zs[j + 1]) / 2 }, r));
  const runs = new Map<string, { axis: 'x' | 'z'; fixed: number; spans: [number, number][] }>();
  const edge = (axis: 'x' | 'z', fixed: number, lo: number, hi: number) => {
    const key = `${axis}:${fixed}`;
    const entry = runs.get(key) ?? { axis, fixed, spans: [] };
    entry.spans.push([lo, hi]); runs.set(key, entry);
  };
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) if (filled(i, j)) {
    if (!filled(i, j - 1)) edge('x', zs[j], xs[i], xs[i + 1]);
    if (!filled(i, j + 1)) edge('x', zs[j + 1], xs[i], xs[i + 1]);
    if (!filled(i - 1, j)) edge('z', xs[i], zs[j], zs[j + 1]);
    if (!filled(i + 1, j)) edge('z', xs[i + 1], zs[j], zs[j + 1]);
  }
  const forbidden = [
    ...MARKET_SHOPS.filter((s) => s.elevation).map(shopBodyBounds),
    { x: MARKET_STAIR.to.x, z: MARKET_STAIR.to.z, w: 0.06, d: MARKET_STAIR.width + 0.04 },
  ];
  const result: MarketRail[] = [];
  for (const { axis, fixed, spans } of runs.values()) {
    const merged: [number, number][] = [];
    for (const span of spans.sort((a, b) => a[0] - b[0])) {
      const prev = merged.at(-1);
      if (prev && span[0] <= prev[1] + EPS) prev[1] = Math.max(prev[1], span[1]);
      else merged.push([...span]);
    }
    let visible = merged;
    for (const r of forbidden) {
      if (Math.abs(fixed - (axis === 'x' ? r.z : r.x)) > (axis === 'x' ? r.d : r.w) / 2 + 0.02) continue;
      const lo = (axis === 'x' ? r.x - r.w / 2 : r.z - r.d / 2) - 0.02;
      const hi = (axis === 'x' ? r.x + r.w / 2 : r.z + r.d / 2) + 0.02;
      visible = visible.flatMap(([a, b]) => hi <= a || lo >= b ? [[a, b] as [number, number]] : [[a, Math.min(b, lo)], [Math.max(a, hi), b]].filter(([x, y]) => y - x > 0.14) as [number, number][]);
    }
    for (const [a, b] of visible) if (b - a > 0.14) result.push({
      from: axis === 'x' ? [a, MARKET_UPPER_HEIGHT, fixed] : [fixed, MARKET_UPPER_HEIGHT, a],
      to: axis === 'x' ? [b, MARKET_UPPER_HEIGHT, fixed] : [fixed, MARKET_UPPER_HEIGHT, b],
    });
  }
  return result;
}
export const MARKET_DECK_RAILS = deckEdges();
export const MARKET_RAIL_POSTS: [number, number, number][] = [];
for (const { from, to } of MARKET_DECK_RAILS) {
  const count = Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]) / 1.3);
  for (let i = 0; i <= count; i++) {
    const p: [number, number, number] = [from[0] + (to[0] - from[0]) * i / count, MARKET_UPPER_HEIGHT, from[2] + (to[2] - from[2]) * i / count];
    if (!MARKET_RAIL_POSTS.some((q) => Math.hypot(p[0] - q[0], p[2] - q[2]) < 0.14)) MARKET_RAIL_POSTS.push(p);
  }
}

/** Decorative town blocks are outside every playable lane on both floors. */
export const MARKET_BACKDROP_BUILDINGS = [
  ...[-27, -18, -9, 0, 9, 18].map((z, i) => ({ x: -23, z, yaw: Math.PI / 2, w: 7, d: 4.8, h: 4.8 + i % 3 * 0.7, variant: i })),
  ...[-27, -17, -7, 3, 13, 23].map((z, i) => ({ x: 28, z, yaw: -Math.PI / 2, w: 7.6, d: 5.2, h: 5.4 + i % 3 * 0.7, variant: i + 2 })),
  ...[-17, -7, 3, 13, 23].map((x, i) => ({ x, z: -35, yaw: 0, w: 7.7, d: 5.4, h: 5.6 + i % 2 * 1.4, variant: i + 1 })),
  ...[-16, -6, 6, 17].map((x, i) => ({ x, z: 26, yaw: Math.PI, w: 7.8, d: 4.8, h: 4.6 + i % 2, variant: i + 3 })),
];
