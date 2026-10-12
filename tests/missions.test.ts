import { describe, expect, it } from 'vitest';
import { analyzeSession } from '../shared/analysis';
import { buildScene, generateFind, generatePlace, simulatePlayability } from '../shared/missions';
import { createRng } from '../shared/rng';
import { resolveRef, sceneEntities } from '../shared/spatial';
import type { FindMission, SceneState } from '../shared/types';

describe('scene building', () => {
  it('is deterministic for a seed and includes the chosen interests', () => {
    const a = buildScene({ seed: 42, interests: ['space', 'food'], difficulty: 'normal' });
    const b = buildScene({ seed: 42, interests: ['space', 'food'], difficulty: 'normal' });
    expect(a).toEqual(b);
    const kinds = new Set(a.objects.map((o) => o.kind));
    expect(kinds.has('rocket')).toBe(true);
    expect(kinds.has('cupcake')).toBe(true);
    const cells = new Set([...a.objects, ...a.landmarks].map((o) => `${o.cell.c},${o.cell.r}`));
    expect(cells.size).toBe(a.objects.length + a.landmarks.length);
  });
});

describe('missions', () => {
  it('generate solvable, describable missions on every difficulty', () => {
    for (const difficulty of ['easy', 'normal', 'tricky'] as const) {
      const report = simulatePlayability({ interests: ['space', 'animals', 'games'], difficulty }, 60);
      expect(report.successRate).toBeGreaterThan(0.97);
    }
  });

  it('tricky difficulty prefers perspective-dependent targets', () => {
    const easy = simulatePlayability({ interests: ['sports', 'food'], difficulty: 'easy' }, 80);
    const tricky = simulatePlayability({ interests: ['sports', 'food'], difficulty: 'tricky' }, 80);
    expect(tricky.perspectiveShare).toBeGreaterThan(easy.perspectiveShare);
  });

  it('find targets are uniquely identified by their model answer', () => {
    for (let seed = 1; seed < 40; seed++) {
      const scene = buildScene({ seed, interests: ['games', 'space'], difficulty: 'normal' });
      const m = generateFind(scene, 0, 'normal', createRng(seed));
      expect(m).not.toBeNull();
      const hits = resolveRef(m!.target, sceneEntities(scene), 'builder');
      expect(hits.map((h) => h.id)).toEqual([m!.targetId]);
    }
  });

  it('place targets are free cells different from the current one', () => {
    for (let seed = 1; seed < 40; seed++) {
      const scene = buildScene({ seed, interests: ['animals'], difficulty: 'normal' });
      const m = generatePlace(scene, 1, 'normal', createRng(seed));
      expect(m).not.toBeNull();
      const occupied = [...scene.objects.filter((o) => o.id !== m!.itemId), ...scene.landmarks].some((o) => o.cell.c === m!.targetCell.c && o.cell.r === m!.targetCell.r);
      expect(occupied).toBe(false);
    }
  });
});

describe('coach analysis', () => {
  const scene: SceneState = {
    layoutId: 'test',
    landmarks: [{ id: 'L0', kind: 'lamp', name: 'lamp', color: 'yellow', cell: { c: 2, r: 1 } }],
    objects: [
      { id: 'a', kind: 'rocket', color: 'white', size: 'small', cell: { c: 0, r: 1 }, yaw: 0 },
      { id: 'b', kind: 'rocket', color: 'white', size: 'big', cell: { c: 4, r: 1 }, yaw: 0 },
    ],
  };
  const mission: FindMission = {
    id: 'm1',
    index: 0,
    type: 'find',
    targetId: 'a',
    target: { kind: 'rocket', size: 'small' },
    modelAnswer: 'Pick up the small rocket.',
    hint: '',
  };
  const record = { mission, scene, startT: 0, endT: 20000, success: true, mistakes: 1 };

  it('catches a perspective flip and suggests a clearer phrase', () => {
    // From the guide's side the small rocket (c=0) is on the guide's RIGHT.
    const report = analyzeSession({
      missions: [record],
      messages: [{ id: 'x', t: 1000, role: 'guide', text: 'Pick the rocket on the right' }],
      durationMs: 20000,
      missionsTotal: 1,
    });
    const review = report.reviews[0];
    expect(review.verdict).toBe('misleading');
    expect(review.issues.map((i) => i.type)).toContain('perspective-flip');
    expect(review.suggestion).toMatch(/small rocket/);
  });

  it('praises listener-centred wording', () => {
    const report = analyzeSession({
      missions: [record],
      messages: [{ id: 'y', t: 1000, role: 'guide', text: 'Grab the rocket on your left' }],
      durationMs: 20000,
      missionsTotal: 1,
    });
    expect(report.reviews[0].verdict).toBe('clear');
    expect(report.goodPhrases).toContain('on your left');
  });

  it('flags ambiguity when two objects match', () => {
    const report = analyzeSession({
      missions: [record],
      messages: [{ id: 'z', t: 1000, role: 'guide', text: 'take the rocket' }],
      durationMs: 20000,
      missionsTotal: 1,
    });
    expect(report.reviews[0].issues.map((i) => i.type)).toContain('ambiguous');
  });
});
