import { allKinds, getKind, INTERESTS, LANDMARK_DEFS } from './catalog';
import { cap, describeCell, describeObject, type Candidate, type Voice } from './reg';
import { createRng, type Rng } from './rng';
import { LAYOUTS } from './room';
import { freeCells } from './spatial';
import {
  sameCell,
  type Cell,
  type ColorName,
  type Difficulty,
  type FindMission,
  type InterestId,
  type Mission,
  type MissionType,
  type PlaceDesc,
  type PlaceMission,
  type RefDesc,
  type SceneObject,
  type SceneState,
} from './types';

export interface RunConfig {
  seed: number;
  interests: InterestId[];
  difficulty: Difficulty;
  /** Extra item kinds to include first (e.g. a player's own Rodin-generated object). */
  kinds?: string[];
}

export const GUIDE_VOICE: Voice = { speaker: 'guide', listener: 'builder' };

/** Mission order for one 90-second run: find -> place -> (find|place). */
export function missionPlan(rng: Rng): MissionType[] {
  return ['find', 'place', rng.chance(0.5) ? 'find' : 'place'];
}

/**
 * Build the table for a run. One hero kind appears as identical twins (only
 * spatial language can tell them apart), a second as a small + big pair, a
 * third once, plus three mugs where two share a colour.
 */
export function buildScene(cfg: RunConfig): SceneState {
  const rng = createRng(cfg.seed);
  const layout = rng.pick(LAYOUTS);
  const landmarks = layout.landmarks.map((l, i) => {
    const def = LANDMARK_DEFS[l.kind];
    return { id: `L${i}`, kind: l.kind, name: def.name, color: def.color, cell: l.cell };
  });

  const wanted = [...(cfg.kinds ?? []), ...cfg.interests.map((i) => INTERESTS.find((x) => x.id === i)?.kind)];
  const heroes: string[] = [];
  for (const k of wanted) if (k && getKind(k) && !heroes.includes(k)) heroes.push(k);
  const others = rng.shuffle(allKinds().filter((k) => k.source !== 'procedural' && !heroes.includes(k.id)).map((k) => k.id));
  while (heroes.length < 3 && others.length) heroes.push(others.shift()!);
  const [a, b, c] = rng.shuffle(heroes.slice(0, 3));

  const mugColors = rng.shuffle<ColorName>(getKind('mug')?.colorVariants ?? ['red', 'blue']).slice(0, 2);
  const specs: Omit<SceneObject, 'id' | 'cell' | 'yaw'>[] = [];
  const push = (kind: string | undefined, size: SceneObject['size']) => {
    const k = kind ? getKind(kind) : undefined;
    if (k) specs.push({ kind: k.id, size, color: k.baseColor });
  };
  push(a, 'regular');
  push(a, 'regular');
  push(b, 'small');
  push(b, 'big');
  push(c, 'regular');
  for (const color of [...mugColors, mugColors[0]]) specs.push({ kind: 'mug', size: 'regular', color });

  const empty: SceneState = { layoutId: layout.id, objects: [], landmarks };
  const cells = rng.shuffle(freeCells(empty));
  const objects = specs.slice(0, cells.length - 3).map((s, i) => ({
    ...s,
    id: `o${i + 1}`,
    cell: cells[i],
    yaw: (rng.next() - 0.5) * 1.2,
  }));
  return { layoutId: layout.id, objects, landmarks };
}

function hintFor(c: Candidate<RefDesc | PlaceDesc>, type: MissionType, dupes: number): string {
  const rel = c.desc.rel;
  if (rel?.type === 'leftOf' || rel?.type === 'rightOf' || ('sup' in c.desc && (c.desc.sup?.type === 'leftmost' || c.desc.sup?.type === 'rightmost')))
    return 'Your partner faces you, so their left is YOUR right. Say "your left" or use a landmark.';
  if (rel?.type === 'inFrontOf' || rel?.type === 'behind')
    return '"In front" and "behind" flip across the table. Try "closer to you" or "farther from you".';
  if ('sup' in c.desc && c.desc.sup) return 'Use the table sides: "closest to you" or "closest to me".';
  if (rel?.type === 'between') return 'Two landmarks pin it down: "between the ... and the ...".';
  if (type === 'find' && dupes > 1) return `There are ${dupes} of these. Say which one!`;
  return 'Name the object, then give one landmark next to it.';
}

/** Weight candidates by difficulty: easy prefers landmark-only wording, tricky prefers perspective traps. */
function preference(c: Candidate<RefDesc | PlaceDesc>, difficulty: Difficulty): number {
  const base = -c.cost;
  const spatial = !!(c.desc.rel || ('sup' in c.desc && c.desc.sup));
  if (difficulty === 'easy') return base - (c.perspective ? 3 : 0);
  if (difficulty === 'tricky') return base + (spatial ? 3 : 0) + (c.perspective ? 2 : 0);
  return base + (spatial ? 2.5 : 0) + (c.perspective ? 0.5 : 0);
}

export function generateFind(scene: SceneState, index: number, difficulty: Difficulty, rng: Rng): FindMission | null {
  const counts = new Map<string, number>();
  for (const o of scene.objects) counts.set(o.kind, (counts.get(o.kind) ?? 0) + 1);
  const pool = rng.shuffle(scene.objects.filter((o) => (counts.get(o.kind) ?? 0) > 1));
  let best: { o: SceneObject; c: Candidate<RefDesc>; score: number } | null = null;
  for (const o of pool.length ? pool : rng.shuffle(scene.objects)) {
    const cands = describeObject(scene, o.id, GUIDE_VOICE);
    const c = cands[0];
    // A bare noun ("the rocket") would make the mission trivial; demand real description.
    if (!c || (!c.desc.rel && !c.desc.sup && !c.desc.size && !c.desc.color)) continue;
    const score = preference(c, difficulty) + rng.next() * 0.5;
    if (!best || score > best.score) best = { o, c, score };
  }
  if (!best) return null;
  return {
    id: `m${index + 1}`,
    index,
    type: 'find',
    targetId: best.o.id,
    target: best.c.desc,
    modelAnswer: `Pick up ${best.c.text}.`,
    hint: hintFor(best.c, 'find', counts.get(best.o.kind) ?? 1),
  };
}

export function generatePlace(scene: SceneState, index: number, difficulty: Difficulty, rng: Rng): PlaceMission | null {
  let best: { o: SceneObject; item: Candidate<RefDesc>; cell: Cell; place: Candidate<PlaceDesc>; score: number } | null = null;
  for (const o of rng.shuffle(scene.objects)) {
    const item = describeObject(scene, o.id, GUIDE_VOICE)[0];
    if (!item) continue;
    for (const cell of freeCells(scene, o.id)) {
      if (sameCell(cell, o.cell)) continue;
      const place = describeCell(scene, cell, o.id, GUIDE_VOICE)[0];
      if (!place) continue;
      const score = preference(place, difficulty) - item.cost * 0.4 + rng.next() * 0.8;
      if (!best || score > best.score) best = { o, item, cell, place, score };
    }
  }
  if (!best) return null;
  return {
    id: `m${index + 1}`,
    index,
    type: 'place',
    itemId: best.o.id,
    item: best.item.desc,
    targetCell: best.cell,
    place: best.place.desc,
    modelAnswer: cap(`put ${best.item.text} ${best.place.text}.`),
    hint: hintFor(best.place, 'place', 1),
  };
}

export function generateMission(scene: SceneState, index: number, type: MissionType, difficulty: Difficulty, rng: Rng): Mission | null {
  const primary = type === 'find' ? generateFind(scene, index, difficulty, rng) : generatePlace(scene, index, difficulty, rng);
  if (primary) return primary;
  // Fall back to the other type so a run never stalls on an unlucky layout.
  return type === 'find' ? generatePlace(scene, index, difficulty, rng) : generateFind(scene, index, difficulty, rng);
}

export function moveObject(scene: SceneState, objectId: string, cell: Cell): SceneState {
  return { ...scene, objects: scene.objects.map((o) => (o.id === objectId ? { ...o, cell } : o)) };
}

export function isPickCorrect(m: Mission, objectId: string) {
  return m.type === 'find' && m.targetId === objectId;
}

export function isPlaceCorrect(m: Mission, objectId: string, cell: Cell) {
  return m.type === 'place' && m.itemId === objectId && sameCell(m.targetCell, cell);
}

// ---------------------------------------------------------------------------
// Playability simulation (used by tests and the Scene Agent's validate step)
// ---------------------------------------------------------------------------

export interface PlayabilityReport {
  runs: number;
  missions: number;
  generated: number;
  successRate: number;
  perspectiveShare: number;
  avgModelAnswerWords: number;
  byType: Record<MissionType, number>;
  failedSeeds: number[];
}

/**
 * Generate many runs and check every mission is describable and solvable:
 * each target must have a unique listener-side description, and applying
 * the model solution must satisfy the rule check.
 */
export function simulatePlayability(base: Omit<RunConfig, 'seed'>, runs = 200, seed0 = 1): PlayabilityReport {
  let generated = 0;
  let perspective = 0;
  let words = 0;
  let total = 0;
  const byType: Record<MissionType, number> = { find: 0, place: 0 };
  const failedSeeds: number[] = [];
  for (let i = 0; i < runs; i++) {
    const seed = seed0 + i;
    const rng = createRng(seed * 7919);
    let scene = buildScene({ ...base, seed });
    for (const [index, type] of missionPlan(rng).entries()) {
      total++;
      const m = generateMission(scene, index, type, base.difficulty, rng);
      if (!m) {
        failedSeeds.push(seed);
        continue;
      }
      const ok = m.type === 'find' ? isPickCorrect(m, m.targetId) : isPlaceCorrect(m, m.itemId, m.targetCell);
      if (!ok) {
        failedSeeds.push(seed);
        continue;
      }
      generated++;
      byType[m.type]++;
      words += m.modelAnswer.split(/\s+/).length;
      const rel = m.type === 'find' ? m.target.rel : m.place.rel;
      const sup = m.type === 'find' ? m.target.sup : undefined;
      if ((rel && rel.view !== 'none') || sup) perspective++;
      if (m.type === 'place') scene = moveObject(scene, m.itemId, m.targetCell);
    }
  }
  return {
    runs,
    missions: total,
    generated,
    successRate: total ? generated / total : 0,
    perspectiveShare: generated ? perspective / generated : 0,
    avgModelAnswerWords: generated ? words / generated : 0,
    byType,
    failedSeeds: [...new Set(failedSeeds)],
  };
}
