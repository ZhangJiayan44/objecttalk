import { getKind, kindName } from './catalog';
import { freeCells, PERSPECTIVE_FREE, resolvePlace, resolveRef, sceneEntities } from './spatial';
import type { Cell, Entity, PlaceDesc, RefDesc, Relation, RelType, Role, SceneState, SuperlativeType, ViewSpec } from './types';
import { sameCell } from './types';

/**
 * Referring Expression Generation (REG): find the shortest descriptions that
 * pick out exactly one thing *from the listener's point of view*, and turn
 * them into English. Used by the AI guide, the mission generator (a mission
 * is only playable if a clear description exists) and the post-game coach.
 */

export interface Candidate<T> {
  desc: T;
  text: string;
  /** Lower is simpler / clearer. */
  cost: number;
  /** True if the words depend on who is looking (left/right/front/behind). */
  perspective: boolean;
}

export interface Voice {
  speaker: Role;
  listener: Role;
}

const DIRECTIONAL: RelType[] = ['leftOf', 'rightOf', 'inFrontOf', 'behind'];
const SUPERLATIVES: SuperlativeType[] = ['leftmost', 'rightmost', 'nearest', 'farthest'];

// ---------------------------------------------------------------------------
// Realization (structure -> English)
// ---------------------------------------------------------------------------

function owner(view: ViewSpec, voice: Voice): 'your' | 'my' | null {
  if (view === voice.listener) return 'your';
  if (view === voice.speaker) return 'my';
  return null;
}

export function nounPhrase(desc: RefDesc, opts: { article?: boolean } = {}): string {
  const words: string[] = [];
  if (desc.size) words.push(desc.size);
  const kind = desc.kind ? getKind(desc.kind) : undefined;
  const isLandmark = !!desc.kind && !kind;
  if (desc.color && !isLandmark) words.push(desc.color);
  words.push(desc.kind ? kindName(desc.kind) : 'one');
  const np = words.join(' ');
  return opts.article === false ? np : `the ${np}`;
}

function relationPhrase(rel: Relation, voice: Voice): string {
  const [a, b] = rel.refs.map((r) => nounPhrase(r));
  const who = owner(rel.view, voice);
  switch (rel.type) {
    case 'nextTo':
      return `next to ${a}`;
    case 'near':
      return `near ${a}`;
    case 'between':
      return `between ${a} and ${b}`;
    case 'leftOf':
      return who ? `to the left of ${a} (${who} left)` : `to the left of ${a}`;
    case 'rightOf':
      return who ? `to the right of ${a} (${who} right)` : `to the right of ${a}`;
    case 'inFrontOf':
      return who === 'your' ? `in front of ${a}, closer to you` : who === 'my' ? `in front of ${a}, closer to me` : `in front of ${a}`;
    case 'behind':
      return who === 'your' ? `behind ${a}, farther from you` : who === 'my' ? `behind ${a}, farther from me` : `behind ${a}`;
  }
}

function superlativePhrase(type: SuperlativeType, view: ViewSpec, voice: Voice): string {
  const who = owner(view, voice);
  switch (type) {
    case 'leftmost':
      return who ? `on ${who} left` : 'on the left';
    case 'rightmost':
      return who ? `on ${who} right` : 'on the right';
    case 'nearest':
      return who === 'your' ? 'closest to you' : who === 'my' ? 'closest to me' : 'at the front';
    case 'farthest':
      return who === 'your' ? 'farthest from you' : who === 'my' ? 'farthest from me' : 'at the back';
  }
}

export function realizeRef(desc: RefDesc, voice: Voice): string {
  if (desc.deictic && !desc.kind) return 'that one';
  const parts = [nounPhrase(desc)];
  if (desc.sup) parts.push(superlativePhrase(desc.sup.type, desc.sup.view, voice));
  if (desc.rel) parts.push(relationPhrase(desc.rel, voice));
  return parts.join(' ');
}

export function realizePlace(desc: PlaceDesc, voice: Voice): string {
  return relationPhrase(desc.rel, voice);
}

// ---------------------------------------------------------------------------
// Generation (target -> best descriptions)
// ---------------------------------------------------------------------------

function costOf(desc: RefDesc): number {
  let cost = 1;
  if (desc.color) cost += 1;
  if (desc.size) cost += 1;
  if (desc.sup) cost += 2;
  if (desc.rel) cost += desc.rel.type === 'between' ? 3.5 : PERSPECTIVE_FREE.has(desc.rel.type) ? 2 : 2.5;
  return cost;
}

function isPerspective(desc: RefDesc | PlaceDesc): boolean {
  const rel = desc.rel;
  if (rel && !PERSPECTIVE_FREE.has(rel.type)) return true;
  return 'sup' in desc && !!desc.sup;
}

/** Minimal intrinsic description (kind / colour / size) that uniquely names an entity, if any. */
export function uniqueName(target: Entity, entities: Entity[], listener: Role): RefDesc | null {
  if (target.landmark) return { kind: target.kind };
  const kind = getKind(target.kind);
  const options: RefDesc[] = [{ kind: target.kind }];
  if (kind?.colorVariants) options.push({ kind: target.kind, color: target.color });
  if (target.size !== 'regular') options.push({ kind: target.kind, size: target.size });
  if (kind?.colorVariants && target.size !== 'regular') options.push({ kind: target.kind, color: target.color, size: target.size });
  for (const d of options) {
    const hits = resolveRef(d, entities, listener);
    if (hits.length === 1 && hits[0].id === target.id) return d;
  }
  return null;
}

function intrinsicVariants(target: Entity): RefDesc[] {
  const kind = getKind(target.kind);
  const out: RefDesc[] = [{ kind: target.kind }];
  if (kind?.colorVariants) out.push({ kind: target.kind, color: target.color });
  if (target.size !== 'regular') out.push({ kind: target.kind, size: target.size });
  return out;
}

/** Things that can serve as a reference point: landmarks plus uniquely-named objects. */
function anchors(entities: Entity[], listener: Role, excludeId?: string): { entity: Entity; name: RefDesc }[] {
  const out: { entity: Entity; name: RefDesc }[] = [];
  for (const e of entities) {
    if (e.id === excludeId) continue;
    const name = uniqueName(e, entities, listener);
    if (name) out.push({ entity: e, name });
  }
  // Landmarks first: they never move, so they make the most reliable anchors.
  return out.sort((a, b) => Number(b.entity.landmark) - Number(a.entity.landmark));
}

/**
 * All unique descriptions of an object from the listener's view, best first.
 * Only listener-centred ("your left") or perspective-free wording is produced.
 */
export function describeObject(scene: SceneState, targetId: string, voice: Voice, limit = 6): Candidate<RefDesc>[] {
  const entities = sceneEntities(scene);
  const target = entities.find((e) => e.id === targetId);
  if (!target) return [];
  const out: Candidate<RefDesc>[] = [];
  const seen = new Set<string>();
  const consider = (desc: RefDesc) => {
    const key = JSON.stringify(desc);
    if (seen.has(key)) return;
    seen.add(key);
    const hits = resolveRef(desc, entities, voice.listener);
    if (hits.length === 1 && hits[0].id === targetId) {
      out.push({ desc, text: realizeRef(desc, voice), cost: costOf(desc), perspective: isPerspective(desc) });
    }
  };

  const bases = intrinsicVariants(target);
  bases.forEach(consider);
  const pool = anchors(entities, voice.listener, targetId);
  for (const base of bases) {
    for (const type of SUPERLATIVES) consider({ ...base, sup: { type, view: voice.listener } });
    for (const { name } of pool) {
      consider({ ...base, rel: { type: 'nextTo', view: 'none', refs: [name] } });
      for (const type of DIRECTIONAL) consider({ ...base, rel: { type, view: voice.listener, refs: [name] } });
    }
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++)
        consider({ ...base, rel: { type: 'between', view: 'none', refs: [pool[i].name, pool[j].name] } });
    for (const { name } of pool) consider({ ...base, rel: { type: 'near', view: 'none', refs: [name] } });
  }
  return out.sort((a, b) => a.cost - b.cost).slice(0, limit);
}

/** All unique descriptions of a destination cell from the listener's view, best first. */
export function describeCell(scene: SceneState, cell: Cell, movingId: string, voice: Voice, limit = 6): Candidate<PlaceDesc>[] {
  const all = sceneEntities(scene);
  const entities = all.filter((e) => e.id !== movingId);
  const cells = freeCells(scene, movingId);
  // Name anchors against the full table, so "the rocket" becomes "the big rocket" when a rocket is moving.
  const pool = anchors(all, voice.listener, movingId);
  const out: Candidate<PlaceDesc>[] = [];
  const consider = (desc: PlaceDesc) => {
    const hits = resolvePlace(desc, entities, cells, voice.listener, movingId);
    if (hits.length === 1 && sameCell(hits[0], cell)) {
      const cost = desc.rel.type === 'between' ? 3 : PERSPECTIVE_FREE.has(desc.rel.type) ? 1.5 : 2;
      out.push({ desc, text: realizePlace(desc, voice), cost: cost + (desc.rel.refs[0] && getKind(desc.rel.refs[0].kind ?? '') ? 0.5 : 0), perspective: isPerspective(desc) });
    }
  };
  for (const { name } of pool) {
    consider({ rel: { type: 'nextTo', view: 'none', refs: [name] } });
    for (const type of DIRECTIONAL) consider({ rel: { type, view: voice.listener, refs: [name] } });
  }
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) consider({ rel: { type: 'between', view: 'none', refs: [pool[i].name, pool[j].name] } });
  return out.sort((a, b) => a.cost - b.cost).slice(0, limit);
}

/** Capitalize the first letter of a sentence. */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
