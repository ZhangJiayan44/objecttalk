import type { Rng } from './rng';

/**
 * Toy Town: the navigator (guide) sees a north-up map, the walker (builder)
 * only sees the street in front of them. Directions must be given relative to
 * the WALKER's heading ("turn left at the bank"), not the map's ("go up").
 *
 * Geometry: a 4x4 grid of intersections, BLOCK metres apart, with 3x3 lots
 * between the streets. 8 lots hold Rodin buildings, 1 is a park.
 * Axes: north = -z, east = +x. yaw 0 faces north, yaw +PI/2 faces west.
 */

export const NODES = 4;
export const BLOCK = 24;
export const ROAD_W = 8;
export const SIDEWALK = 2.5;
export const LOT = BLOCK - ROAD_W - SIDEWALK * 2; // buildable square inside each block
export const EXTENT = ((NODES - 1) / 2) * BLOCK + ROAD_W / 2; // outer edge of the outer roads

export type Dir = 'N' | 'E' | 'S' | 'W';
export const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const VEC: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

export type PlaceKind = 'bank' | 'shop' | 'hospital' | 'school' | 'postOffice' | 'hotel' | 'museum' | 'house' | 'park';

export const PLACE_DEFS: Record<PlaceKind, { name: string; model?: string; synonyms: string[]; sign: string }> = {
  bank: { name: 'bank', model: '/models/bank.glb', synonyms: ['bank'], sign: 'BANK' },
  shop: { name: '24-hour shop', model: '/models/convenience_store.glb', synonyms: ['24 hour shop', '24-hour shop', 'convenience store', 'supermarket', 'shop', 'store', 'market'], sign: '24H SHOP' },
  hospital: { name: 'hospital', model: '/models/hospital.glb', synonyms: ['hospital', 'clinic'], sign: 'HOSPITAL' },
  school: { name: 'school', model: '/models/school.glb', synonyms: ['school'], sign: 'SCHOOL' },
  postOffice: { name: 'post office', model: '/models/post_office.glb', synonyms: ['post office', 'post'], sign: 'POST OFFICE' },
  hotel: { name: 'hotel', model: '/models/hotel.glb', synonyms: ['hotel'], sign: 'HOTEL' },
  museum: { name: 'museum', model: '/models/museum.glb', synonyms: ['museum', 'gallery'], sign: 'MUSEUM' },
  house: { name: 'red house', model: '/models/house.glb', synonyms: ['red house', 'house', 'home', 'cottage'], sign: 'No. 7' },
  park: { name: 'park', synonyms: ['park', 'fountain', 'garden', 'playground'], sign: 'PARK' },
};

/** East-west streets by row j, north-south avenues by column i. */
export const STREETS = ['Apple Street', 'Maple Street', 'Oak Street', 'Rose Street'];
export const AVENUES = ['First Avenue', 'Second Avenue', 'Third Avenue', 'Fourth Avenue'];

export interface Place {
  id: PlaceKind;
  name: string;
  lot: { bi: number; bj: number };
  /** Which side of the lot the entrance faces. */
  side: Dir;
  center: { x: number; z: number };
  door: { x: number; z: number };
  street: string;
  /** The two intersections at the ends of the door's street segment. */
  segment: [string, string];
}

export interface Town {
  places: Place[];
  /** Intersections with traffic lights. */
  lights: string[];
  busStop: { x: number; z: number; node: string };
  start: Pose;
}

export const nodeId = (i: number, j: number) => `${i},${j}`;
export const parseNode = (id: string) => id.split(',').map(Number) as [number, number];
export const nodePos = (i: number, j: number) => ({ x: (i - (NODES - 1) / 2) * BLOCK, z: (j - (NODES - 1) / 2) * BLOCK });
export const lotCenter = (bi: number, bj: number) => ({ x: (bi - 1) * BLOCK, z: (bj - 1) * BLOCK });

export const turnRight = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 1) % 4];
export const turnLeft = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 3) % 4];
export const opposite = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 2) % 4];
export const yawOf = (d: Dir) => ({ N: 0, W: Math.PI / 2, S: Math.PI, E: -Math.PI / 2 })[d];

/** The cardinal direction a yaw is closest to. */
export function headingOf(yaw: number): Dir {
  const f = [-Math.sin(yaw), -Math.cos(yaw)];
  let best: Dir = 'N';
  let bestDot = -Infinity;
  for (const d of DIRS) {
    const dot = f[0] * VEC[d][0] + f[1] * VEC[d][1];
    if (dot > bestDot) {
      bestDot = dot;
      best = d;
    }
  }
  return best;
}

export type Relative = 'straight' | 'left' | 'right' | 'around';

export function relativeTurn(from: Dir, to: Dir): Relative {
  if (from === to) return 'straight';
  if (to === opposite(from)) return 'around';
  return to === turnRight(from) ? 'right' : 'left';
}

/** Which side (from the traveller's view, moving in `dir`) a point lies on. */
export function sideOf(dir: Dir, from: { x: number; z: number }, point: { x: number; z: number }): 'left' | 'right' {
  const [dx, dz] = VEC[dir];
  const right = [-dz, dx];
  return (point.x - from.x) * right[0] + (point.z - from.z) * right[1] > 0 ? 'right' : 'left';
}

export function buildTown(rng: Rng): Town {
  const kinds: PlaceKind[] = ['bank', 'shop', 'hospital', 'school', 'postOffice', 'hotel', 'museum', 'house'];
  const lots = rng.shuffle(Array.from({ length: 9 }, (_, k) => ({ bi: k % 3, bj: Math.floor(k / 3) })));
  const assignment: PlaceKind[] = [...rng.shuffle(kinds), 'park'];
  const places: Place[] = lots.map((lot, k) => {
    const id = assignment[k];
    const center = lotCenter(lot.bi, lot.bj);
    const side = rng.pick(DIRS);
    const [vx, vz] = VEC[side];
    const off = LOT / 2 + SIDEWALK / 2;
    const door = { x: center.x + vx * off, z: center.z + vz * off };
    // Door segment endpoints and the street it is on.
    let segment: [string, string];
    let street: string;
    if (side === 'N' || side === 'S') {
      const j = side === 'N' ? lot.bj : lot.bj + 1;
      segment = [nodeId(lot.bi, j), nodeId(lot.bi + 1, j)];
      street = STREETS[j];
    } else {
      const i = side === 'W' ? lot.bi : lot.bi + 1;
      segment = [nodeId(i, lot.bj), nodeId(i, lot.bj + 1)];
      street = AVENUES[i];
    }
    return { id, name: PLACE_DEFS[id].name, lot, side, center, door, street, segment };
  });
  const allNodes = Array.from({ length: NODES * NODES }, (_, k) => nodeId(k % NODES, Math.floor(k / NODES)));
  const lights = rng.shuffle(allNodes.filter((n) => !['0,0', '3,0', '0,3', '3,3'].includes(n))).slice(0, 3);
  const stopNode = rng.pick(['0,1', '0,2', '3,1', '3,2', '1,0', '2,0', '1,3', '2,3']);
  const [si, sj] = parseNode(stopNode);
  const sp = nodePos(si, sj);
  // Start beside the bus stop, looking along a road that leads into town.
  const into: Dir = si === 0 ? 'E' : si === NODES - 1 ? 'W' : sj === 0 ? 'S' : 'N';
  const [ix, iz] = VEC[into];
  const start = { x: sp.x + ix * 6, z: sp.z + iz * 6, yaw: yawOf(into) };
  return { places, lights, busStop: { x: sp.x - iz * 5.5, z: sp.z + ix * 5.5, node: stopNode }, start };
}

export const placeById = (town: Town, id: string) => town.places.find((p) => p.id === id);

/** Nearest intersection to a position. */
export function nearestNode(pos: { x: number; z: number }): string {
  const i = Math.max(0, Math.min(NODES - 1, Math.round(pos.x / BLOCK + (NODES - 1) / 2)));
  const j = Math.max(0, Math.min(NODES - 1, Math.round(pos.z / BLOCK + (NODES - 1) / 2)));
  return nodeId(i, j);
}

export function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Shortest node path (BFS on the street grid). */
export function shortestPath(from: string, to: string): string[] {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    const [i, j] = parseNode(cur);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NODES || nj >= NODES) continue;
      const id = nodeId(ni, nj);
      if (!prev.has(id)) {
        prev.set(id, cur);
        queue.push(id);
      }
    }
  }
  const path: string[] = [];
  for (let at: string | null = to; at; at = prev.get(at) ?? null) path.unshift(at);
  return path[0] === from ? path : [from];
}

export function dirBetween(a: string, b: string): Dir {
  const [ai, aj] = parseNode(a);
  const [bi, bj] = parseNode(b);
  if (bi > ai) return 'E';
  if (bi < ai) return 'W';
  return bj > aj ? 'S' : 'N';
}

/** Places whose lot touches an intersection. */
function touching(town: Town, node: string) {
  const [i, j] = parseNode(node);
  return town.places.filter((p) => [i - 1, i].includes(p.lot.bi) && [j - 1, j].includes(p.lot.bj));
}

/**
 * A memorable thing at an intersection, for "turn left at the bank". Nothing
 * that the walker already passed on this stretch (`notAt`) is used, so the
 * landmark points at exactly one corner.
 */
export function cornerLandmark(town: Town, node: string, exclude?: string, notAt: string[] = []): string | null {
  if (town.lights.includes(node) && !notAt.some((n) => town.lights.includes(n))) return 'the traffic lights';
  const passed = new Set(notAt.flatMap((n) => touching(town, n).map((p) => p.id)));
  const cands = touching(town, node).filter((p) => p.id !== exclude && !passed.has(p.id));
  const pick = cands.find((p) => p.id !== 'house') ?? cands[0];
  return pick ? `the ${pick.name}` : null;
}

/** Within this distance of an intersection the walker is "at the corner". */
export const AT_NODE = 4;

/** Where on the street grid a position is: at an intersection, or on the street between two. */
export function streetAt(p: { x: number; z: number }): { node: string | null; ends: [string, string]; vertical: boolean } {
  const n = nearestNode(p);
  const [ni, nj] = parseNode(n);
  const fi = p.x / BLOCK + (NODES - 1) / 2;
  const fj = p.z / BLOCK + (NODES - 1) / 2;
  const clampI = (v: number) => Math.max(0, Math.min(NODES - 1, v));
  const vertical = Math.abs(fi - Math.round(fi)) <= Math.abs(fj - Math.round(fj));
  const ends: [string, string] = vertical
    ? [nodeId(clampI(Math.round(fi)), clampI(Math.floor(fj))), nodeId(clampI(Math.round(fi)), clampI(Math.floor(fj) + 1))]
    : [nodeId(clampI(Math.floor(fi)), clampI(Math.round(fj))), nodeId(clampI(Math.floor(fi) + 1), clampI(Math.round(fj)))];
  return { node: distance(p, nodePos(ni, nj)) < AT_NODE ? n : null, ends, vertical };
}

/** Is the walker facing along the street they stand on (so "left" can only mean the next corner)? */
export function isAligned(p: Pose): boolean {
  const st = streetAt(p);
  if (st.node) return true;
  const h = headingOf(p.yaw);
  return st.vertical ? h === 'N' || h === 'S' : h === 'E' || h === 'W';
}

export interface RoutePlan {
  nodes: string[];
  /** Straight stretches; `nodes` are the corners passed on each, the last one is where the next turn happens. */
  legs: { dir: Dir; blocks: number; endNode: string; nodes: string[] }[];
  /** Corners still to reach (including the first one when the walker is between corners). */
  hops: number;
  finalSide: 'left' | 'right';
  firstTurn: Relative;
  text: string;
  /** Just the next instruction, for live step-by-step guidance. */
  next: string;
}

const COUNT = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

/** Directions from the walker's pose to a place, relative to where the walker is facing. */
export function planRoute(town: Town, pose: Pose, placeId: string): RoutePlan | null {
  const place = placeById(town, placeId);
  if (!place) return null;
  const heading = headingOf(pose.yaw);
  const st = streetAt(pose);
  // Between two corners the walker can only head for one of them first.
  const starts: { node: string; pre: Dir | null; cost: number }[] = st.node
    ? [{ node: st.node, pre: null, cost: 0 }]
    : [...new Set(st.ends)].map((node) => {
        const np = nodePos(...parseNode(node));
        const dx = np.x - pose.x;
        const dz = np.z - pose.z;
        const pre: Dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N';
        return { node, pre, cost: Math.hypot(dx, dz) };
      });
  let best: { s: (typeof starts)[number]; path: string[]; end: string; other: string; cost: number } | null = null;
  for (const s of starts)
    for (const end of place.segment) {
      const path = shortestPath(s.node, end);
      const other = end === place.segment[0] ? place.segment[1] : place.segment[0];
      const firstDir = s.pre ?? (path.length > 1 ? dirBetween(path[0], path[1]) : dirBetween(end, other));
      const turn = relativeTurn(heading, firstDir);
      const cost = s.cost + (path.length - 1) * BLOCK + (turn === 'around' ? 10 : turn === 'straight' ? 0 : 3);
      if (!best || cost < best.cost) best = { s, path, end, other, cost };
    }
  if (!best) return null;
  const { path, end: last, other, s } = best;
  const legs: RoutePlan['legs'] = [];
  const push = (dir: Dir, node: string) => {
    const leg = legs[legs.length - 1];
    if (leg && leg.dir === dir) {
      leg.blocks++;
      leg.endNode = node;
      leg.nodes.push(node);
    } else legs.push({ dir, blocks: 1, endNode: node, nodes: [node] });
  };
  if (s.pre) push(s.pre, s.node);
  for (let k = 0; k + 1 < path.length; k++) push(dirBetween(path[k], path[k + 1]), path[k + 1]);
  const finalDir = dirBetween(last, other);
  const [li, lj] = parseNode(last);
  const finalSide = sideOf(finalDir, nodePos(li, lj), place.center);

  const parts: string[] = [];
  let cur = heading;
  const firstDir = legs[0]?.dir ?? finalDir;
  const firstTurn = relativeTurn(heading, firstDir);
  const opener = { straight: 'Go straight ahead', left: 'Turn left', right: 'Turn right', around: 'Turn around' }[firstTurn];
  if (legs.length === 0) {
    parts.push(firstTurn === 'straight' ? 'Go straight ahead' : `${opener} and go straight`);
  } else {
    legs.forEach((leg, k) => {
      if (k === 0) {
        const span = leg.blocks > 1 ? ` for ${COUNT[leg.blocks]} blocks` : s.pre ? ' to the corner' : ' for one block';
        parts.push(firstTurn === 'straight' ? `Go straight ahead${span}` : `${opener} and go straight${span}`);
      } else {
        const prev = legs[k - 1];
        const turn = relativeTurn(cur, leg.dir);
        const at = cornerLandmark(town, prev.endNode, place.id, prev.nodes.slice(0, -1));
        parts.push(`then turn ${turn}${at ? ` at ${at}` : ''}${leg.blocks > 1 ? ` and go ${COUNT[leg.blocks]} blocks` : ''}`);
      }
      cur = leg.dir;
    });
    const turn = relativeTurn(cur, finalDir);
    if (turn !== 'straight') {
      const leg = legs[legs.length - 1];
      const at = cornerLandmark(town, leg.endNode, place.id, leg.nodes.slice(0, -1));
      parts.push(`then turn ${turn}${at ? ` at ${at}` : ''}`);
    }
  }
  const route = parts.join(', ').replace(/^./, (c) => c.toUpperCase());
  const text = `${route}. The ${place.name} is on your ${finalSide}.`;
  return {
    nodes: path,
    legs,
    hops: legs.reduce((n, l) => n + l.blocks, 0),
    finalSide,
    firstTurn,
    text,
    next: `${parts[0].replace(/^./, (c) => c.toUpperCase())}${legs.length === 0 ? `. It's on your ${finalSide}` : ''}.`,
  };
}

export interface RouteMission {
  id: string;
  index: number;
  type: 'route';
  destination: PlaceKind;
  modelAnswer: string;
  hint: string;
}

/** Pick a destination 2-5 intersections away that has not been visited yet. */
export function generateRouteMission(town: Town, pose: Pose, index: number, rng: Rng, visited: string[] = [], quest = 'mixed'): RouteMission | null {
  const start = nearestNode(pose);
  const scored = rng
    .shuffle(town.places.filter((p) => !visited.includes(p.id) && distance(pose, p.door) > ARRIVE_RADIUS * 2))
    .map((p) => {
      const hops = Math.min(shortestPath(start, p.segment[0]).length, shortestPath(start, p.segment[1]).length) - 1;
      return { p, hops };
    });
  const pick = (quest === 'far' ? scored.find((s) => s.hops >= 4) : undefined) ?? scored.find((s) => s.hops >= 2 && s.hops <= 4) ?? scored.find((s) => s.hops >= 1) ?? scored[0];
  if (!pick) return null;
  const plan = planRoute(town, pose, pick.p.id);
  if (!plan) return null;
  const hint =
    plan.firstTurn === 'around'
      ? 'The walker is facing AWAY from it. Start with "Turn around".'
      : 'The walker only sees the street ahead. Say left/right from THEIR view, never north/south or up/down.';
  return { id: `m${index + 1}`, index, type: 'route', destination: pick.p.id, modelAnswer: plan.text, hint };
}

export const ARRIVE_RADIUS = 5;

export function hasArrived(pose: Pose, place: Place) {
  return distance(pose, place.door) < ARRIVE_RADIUS;
}

/** Keep the walker on streets, sidewalks and inside the town. */
export function collide(pos: { x: number; z: number }, radius = 0.4): { x: number; z: number } {
  let { x, z } = pos;
  const lim = EXTENT - radius;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, Math.min(lim, z));
  for (let bi = 0; bi < 3; bi++)
    for (let bj = 0; bj < 3; bj++) {
      const c = lotCenter(bi, bj);
      const h = LOT / 2 + radius;
      const dx = x - c.x;
      const dz = z - c.z;
      if (Math.abs(dx) < h && Math.abs(dz) < h) {
        // Push out along the shallowest axis.
        if (h - Math.abs(dx) < h - Math.abs(dz)) x = c.x + Math.sign(dx || 1) * h;
        else z = c.z + Math.sign(dz || 1) * h;
      }
    }
  return { x, z };
}

// ---------------------------------------------------------------------------
// Understanding directions (AI walker + coach)
// ---------------------------------------------------------------------------

export type DirStep =
  | { type: 'straight'; blocks: number | null; until: PlaceKind | 'lights' | null }
  | { type: 'turn'; dir: Relative; at: PlaceKind | 'lights' | 'corner' | null; ordinal: number | null }
  | { type: 'goto'; place: PlaceKind }
  | { type: 'stop' }
  | { type: 'side'; side: 'left' | 'right'; place: PlaceKind | null };

export interface ParsedDirections {
  steps: DirStep[];
  /** Map-centric words a walker cannot use: north/south/east/west, up/down. */
  mapWords: string[];
  landmarks: PlaceKind[];
  question: boolean;
}

const ORD: Record<string, number> = { first: 1, next: 1, second: 2, third: 3 };
const NUMW: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4 };

function findPlace(text: string): PlaceKind | 'lights' | null {
  if (/traffic light|lights\b|light\b/.test(text)) return 'lights';
  let best: { id: PlaceKind; len: number; at: number } | null = null;
  for (const [id, def] of Object.entries(PLACE_DEFS) as [PlaceKind, (typeof PLACE_DEFS)[PlaceKind]][])
    for (const s of def.synonyms) {
      const at = text.indexOf(s);
      if (at >= 0 && (!best || at < best.at || (at === best.at && s.length > best.len))) best = { id, len: s.length, at };
    }
  return best?.id ?? null;
}

export function parseDirections(raw: string): ParsedDirections {
  const text = raw.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ,.?-]+/g, ' ');
  const mapWords = [...text.matchAll(/\b(north|south|east|west|up|down)\b(?!\s+(?:the street|the road|this street|this road))/g)].map((m) => m[1]);
  const steps: DirStep[] = [];
  const landmarks: PlaceKind[] = [];
  const clauses = text
    .split(/(?:,|\.|;|\bthen\b|\band then\b|\bafter that\b|\bnext,)/)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const c of clauses) {
    const place = findPlace(c);
    if (place && place !== 'lights') landmarks.push(place);
    if (/\b(turn around|go back|turn back|wrong way|other way)\b/.test(c)) steps.push({ type: 'turn', dir: 'around', at: null, ordinal: null });
    else if (/\b(stop|you'?re (?:there|here)|it'?s (?:right )?here|you made it|that'?s it)\b/.test(c)) steps.push({ type: 'stop' });
    else if (/\b(turn|take|make|hang|go)\b.*\b(left|right)\b|\b(left|right) turn\b/.test(c) && !/\bon (?:your|the) (left|right)\b/.test(c)) {
      const dir = /\bleft\b/.test(c) ? 'left' : 'right';
      const ord = /\b(first|next|second|third)\b/.exec(c);
      steps.push({ type: 'turn', dir, at: /\bcorner\b/.test(c) ? 'corner' : place, ordinal: ord ? ORD[ord[1]] : null });
    } else if (/\b(go to|walk to|head to|get to|go towards|walk towards|head for)\b/.test(c) && place && place !== 'lights') {
      steps.push({ type: 'goto', place });
    } else if (/\b(straight|forward|ahead|keep going|keep walking|go along|walk along|continue|down the street|up the street)\b/.test(c)) {
      const n = /\b(one|a|two|three|four|\d) blocks?\b/.exec(c);
      steps.push({ type: 'straight', blocks: n ? (NUMW[n[1]] ?? Number(n[1])) : null, until: /\b(until|till|to|past)\b/.test(c) ? place : null });
    }
    const side = /\bon (?:your|the) (left|right)\b/.exec(c);
    if (side) steps.push({ type: 'side', side: side[1] as 'left' | 'right', place: place && place !== 'lights' ? place : null });
  }
  return { steps, mapWords: [...new Set(mapWords)], landmarks: [...new Set(landmarks)], question: text.includes('?') };
}
