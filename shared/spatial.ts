import { getKind, LANDMARK_DEFS } from './catalog';
import { allCells, inBounds, toFrame } from './room';
import {
  cellKey,
  type Cell,
  type Entity,
  type PlaceDesc,
  type RefDesc,
  type RelType,
  type Role,
  type SceneState,
  type ViewSpec,
} from './types';

/** All referable things in a scene. Objects first, then landmarks. */
export function sceneEntities(scene: SceneState): Entity[] {
  return [
    ...scene.objects.map((o) => ({ id: o.id, kind: o.kind, color: o.color, size: o.size, cell: o.cell, landmark: false })),
    ...scene.landmarks.map((l) => ({ id: l.id, kind: l.kind, color: l.color, size: 'regular' as const, cell: l.cell, landmark: true })),
  ];
}

export function occupiedKeys(scene: SceneState, exceptObjectId?: string): Set<string> {
  const keys = new Set<string>();
  for (const o of scene.objects) if (o.id !== exceptObjectId) keys.add(cellKey(o.cell));
  for (const l of scene.landmarks) keys.add(cellKey(l.cell));
  return keys;
}

/** Cells an object could be dropped on (its own cell counts as free while it is held). */
export function freeCells(scene: SceneState, exceptObjectId?: string): Cell[] {
  const occ = occupiedKeys(scene, exceptObjectId);
  return allCells().filter((c) => !occ.has(cellKey(c)));
}

/** Which concrete frame a ViewSpec resolves to under a given reading of unmarked words. */
export function concreteView(view: ViewSpec, reading: Role): Role | null {
  if (view === 'guide' || view === 'builder') return view;
  if (view === 'unmarked') return reading;
  return null;
}

export const PERSPECTIVE_FREE: ReadonlySet<RelType> = new Set(['nextTo', 'near', 'between']);

/** Does `subject` stand in relation `type` to `refs` (as seen from `view`)? */
export function relationHolds(type: RelType, subject: Cell, refs: Cell[], view: Role | null): boolean {
  const [ref, ref2] = refs;
  if (!ref) return false;
  switch (type) {
    case 'nextTo':
      return subject.r === ref.r && Math.abs(subject.c - ref.c) === 1;
    case 'near':
      return Math.max(Math.abs(subject.c - ref.c), Math.abs(subject.r - ref.r)) === 1;
    case 'between': {
      if (!ref2) return false;
      if (subject.r === ref.r && subject.r === ref2.r) {
        const lo = Math.min(ref.c, ref2.c);
        const hi = Math.max(ref.c, ref2.c);
        return lo < subject.c && subject.c < hi && hi - lo <= 4;
      }
      if (subject.c === ref.c && subject.c === ref2.c) {
        const lo = Math.min(ref.r, ref2.r);
        const hi = Math.max(ref.r, ref2.r);
        return lo < subject.r && subject.r < hi;
      }
      return false;
    }
    default: {
      // Directional relations need a frame; without one they are undefined.
      if (!view) return false;
      const s = toFrame(subject, view);
      const t = toFrame(ref, view);
      if (type === 'leftOf') return s.y === t.y && t.x - s.x === 1;
      if (type === 'rightOf') return s.y === t.y && s.x - t.x === 1;
      if (type === 'inFrontOf') return s.x === t.x && s.y - t.y === 1;
      if (type === 'behind') return s.x === t.x && t.y - s.y === 1;
      return false;
    }
  }
}

function matchesKind(entity: Entity, kind: string): boolean {
  if (entity.kind === kind) return true;
  // "book" without a colour matches both book landmarks.
  if (kind === 'book') return entity.kind === 'redBook' || entity.kind === 'blueBook';
  return false;
}

/** Filter by the intrinsic attributes (kind / colour / size) only. */
export function filterIntrinsic(desc: RefDesc, entities: Entity[]): Entity[] {
  return entities.filter((e) => {
    if (desc.kind && !matchesKind(e, desc.kind)) return false;
    if (!desc.kind && e.landmark && !desc.color) return false; // "the one" never means furniture
    if (desc.color && e.color !== desc.color) return false;
    if (desc.size && e.size !== desc.size) return false;
    return true;
  });
}

/**
 * Resolve a description to the entities it can denote.
 * `reading` decides what an unmarked direction word means (whose left).
 */
export function resolveRef(desc: RefDesc, entities: Entity[], reading: Role): Entity[] {
  if (desc.deictic && !desc.kind && !desc.color && !desc.size && !desc.rel && !desc.sup) {
    return entities.filter((e) => !e.landmark);
  }
  let cands = filterIntrinsic(desc, entities);

  if (desc.rel) {
    const rel = desc.rel;
    const view = concreteView(rel.view, reading);
    const refSets = rel.refs.map((r) => resolveRef({ ...r, rel: undefined }, entities, reading));
    cands = cands.filter((cand) => {
      const [a, b] = refSets;
      if (!a || a.length === 0) return false;
      if (rel.type === 'between') {
        if (!b || b.length === 0) return false;
        return a.some((x) => b.some((y) => x.id !== y.id && x.id !== cand.id && y.id !== cand.id && relationHolds('between', cand.cell, [x.cell, y.cell], view)));
      }
      return a.some((x) => x.id !== cand.id && relationHolds(rel.type, cand.cell, [x.cell], view));
    });
  }

  if (desc.sup && cands.length > 1) {
    const view = concreteView(desc.sup.view, reading) ?? reading;
    const score = (e: Entity) => {
      const f = toFrame(e.cell, view);
      switch (desc.sup!.type) {
        case 'leftmost':
          return -f.x;
        case 'rightmost':
          return f.x;
        case 'nearest':
          return f.y;
        case 'farthest':
          return -f.y;
      }
    };
    const best = Math.max(...cands.map(score));
    cands = cands.filter((e) => score(e) === best);
  }
  return cands;
}

/** Resolve a destination description to the free cells it can denote. */
export function resolvePlace(desc: PlaceDesc, entities: Entity[], candidateCells: Cell[], reading: Role, movingId?: string): Cell[] {
  const rel = desc.rel;
  const view = concreteView(rel.view, reading);
  const others = entities.filter((e) => e.id !== movingId);
  const refSets = rel.refs.map((r) => resolveRef({ ...r, rel: undefined }, others, reading));
  return candidateCells.filter((cell) => {
    const [a, b] = refSets;
    if (!a || a.length === 0) return false;
    if (rel.type === 'between') {
      if (!b || b.length === 0) return false;
      return a.some((x) => b.some((y) => x.id !== y.id && relationHolds('between', cell, [x.cell, y.cell], view)));
    }
    return a.some((x) => relationHolds(rel.type, cell, [x.cell], view));
  });
}

/** Whether any part of a description depends on whose perspective is used. */
export function descUsesView(desc: RefDesc | PlaceDesc, view: ViewSpec): boolean {
  if ('rel' in desc && desc.rel && desc.rel.view === view) return true;
  if ('sup' in desc && desc.sup && desc.sup.view === view) return true;
  return false;
}

/** Every concrete reading worth checking: both roles if anything is unmarked, else one. */
export function readingsFor(desc: RefDesc | PlaceDesc, listener: Role): Role[] {
  return descUsesView(desc, 'unmarked') ? ['builder', 'guide'] : [listener];
}

export function cellNeighbors(cell: Cell): Cell[] {
  const out: Cell[] = [];
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    if (inBounds({ c: cell.c + dc, r: cell.r + dr })) out.push({ c: cell.c + dc, r: cell.r + dr });
  return out;
}

/** Display name of any entity, e.g. "small rocket" or "red book". */
export function entityLabel(e: Pick<Entity, 'kind' | 'color' | 'size' | 'landmark'>): string {
  if (e.landmark) return (LANDMARK_DEFS as Record<string, { name: string }>)[e.kind]?.name ?? e.kind;
  const kind = getKind(e.kind);
  const parts: string[] = [];
  if (e.size !== 'regular') parts.push(e.size);
  if (kind?.colorVariants) parts.push(e.color);
  parts.push(kind?.name ?? e.kind);
  return parts.join(' ');
}
