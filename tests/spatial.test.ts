import { describe, expect, it } from 'vitest';
import { cellToWorld, COLS, fromFrame, toFrame } from '../shared/room';
import { relationHolds, resolvePlace, resolveRef, sceneEntities } from '../shared/spatial';
import { describeCell, describeObject } from '../shared/reg';
import type { SceneState } from '../shared/types';

/**
 * Hand-built table (6 x 3). Row 0 is the guide's side, row 2 the builder's.
 *
 *   r0:  .      lamp   .      .      .      .
 *   r1:  rocketS .     .      redBook rocketB .
 *   r2:  .      mugR   .      .      plant  mugB
 */
const scene: SceneState = {
  layoutId: 'test',
  landmarks: [
    { id: 'L0', kind: 'lamp', name: 'lamp', color: 'yellow', cell: { c: 1, r: 0 } },
    { id: 'L1', kind: 'redBook', name: 'red book', color: 'red', cell: { c: 3, r: 1 } },
    { id: 'L2', kind: 'plant', name: 'plant', color: 'green', cell: { c: 4, r: 2 } },
  ],
  objects: [
    { id: 'rs', kind: 'rocket', color: 'white', size: 'small', cell: { c: 0, r: 1 }, yaw: 0 },
    { id: 'rb', kind: 'rocket', color: 'white', size: 'big', cell: { c: 4, r: 1 }, yaw: 0 },
    { id: 'mr', kind: 'mug', color: 'red', size: 'regular', cell: { c: 1, r: 2 }, yaw: 0 },
    { id: 'mb', kind: 'mug', color: 'blue', size: 'regular', cell: { c: 5, r: 2 }, yaw: 0 },
  ],
};
const entities = sceneEntities(scene);
const ids = (es: { id: string }[]) => es.map((e) => e.id).sort();

describe('perspective frames', () => {
  it('mirrors left/right and front/back between the two players', () => {
    expect(toFrame({ c: 0, r: 0 }, 'builder')).toEqual({ x: 0, y: 0 });
    expect(toFrame({ c: 0, r: 0 }, 'guide')).toEqual({ x: COLS - 1, y: 2 });
    for (const cell of [{ c: 2, r: 1 }, { c: 5, r: 0 }]) {
      expect(fromFrame(toFrame(cell, 'guide'), 'guide')).toEqual(cell);
    }
  });

  it('places the grid symmetrically around the origin', () => {
    const [x0, , z0] = cellToWorld({ c: 0, r: 0 });
    const [x5, , z2] = cellToWorld({ c: COLS - 1, r: 2 });
    expect(x0).toBeCloseTo(-x5);
    expect(z0).toBeCloseTo(-z2);
  });

  it('flips "left of" between viewers', () => {
    const subject = { c: 2, r: 1 };
    const ref = { c: 3, r: 1 };
    expect(relationHolds('leftOf', subject, [ref], 'builder')).toBe(true);
    expect(relationHolds('leftOf', subject, [ref], 'guide')).toBe(false);
    expect(relationHolds('rightOf', subject, [ref], 'guide')).toBe(true);
  });

  it('flips "behind" between viewers', () => {
    const subject = { c: 3, r: 0 }; // guide side of the red book
    const book = { c: 3, r: 1 };
    expect(relationHolds('behind', subject, [book], 'builder')).toBe(true);
    expect(relationHolds('inFrontOf', subject, [book], 'guide')).toBe(true);
  });
});

describe('resolution', () => {
  it('resolves size, colour and landmark relations', () => {
    expect(ids(resolveRef({ kind: 'rocket' }, entities, 'builder'))).toEqual(['rb', 'rs']);
    expect(ids(resolveRef({ kind: 'rocket', size: 'small' }, entities, 'builder'))).toEqual(['rs']);
    expect(ids(resolveRef({ kind: 'mug', color: 'blue' }, entities, 'builder'))).toEqual(['mb']);
    expect(ids(resolveRef({ kind: 'rocket', rel: { type: 'rightOf', view: 'builder', refs: [{ kind: 'redBook' }] } }, entities, 'builder'))).toEqual(['rb']);
  });

  it('gives different answers for an unmarked "left" depending on the reading', () => {
    const desc = { kind: 'rocket', sup: { type: 'leftmost' as const, view: 'unmarked' as const } };
    expect(ids(resolveRef(desc, entities, 'builder'))).toEqual(['rs']);
    expect(ids(resolveRef(desc, entities, 'guide'))).toEqual(['rb']);
  });

  it('resolves "between the lamp and ..." style destinations', () => {
    const cells = [{ c: 2, r: 1 }, { c: 2, r: 0 }];
    const hits = resolvePlace({ rel: { type: 'between', view: 'none', refs: [{ kind: 'rocket', size: 'small' }, { kind: 'redBook' }] } }, entities, cells, 'builder');
    expect(hits).toEqual([{ c: 2, r: 1 }]);
  });
});

describe('referring expression generation', () => {
  it('never offers an ambiguous description', () => {
    for (const o of scene.objects) {
      for (const cand of describeObject(scene, o.id, { speaker: 'guide', listener: 'builder' })) {
        const hits = resolveRef(cand.desc, entities, 'builder');
        expect(ids(hits)).toEqual([o.id]);
      }
    }
  });

  it('speaks from the listener side ("your", never bare "left")', () => {
    const texts = describeObject(scene, 'rs', { speaker: 'guide', listener: 'builder' }).map((c) => c.text);
    expect(texts[0]).toBe('the small rocket');
    expect(texts.some((t) => / left| right/.test(t) && !/your|my/.test(t))).toBe(false);
  });

  it('describes free cells uniquely', () => {
    const cands = describeCell(scene, { c: 3, r: 0 }, 'mr', { speaker: 'guide', listener: 'builder' });
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.map((c) => c.text)).toContain('behind the red book, farther from you');
  });
});
