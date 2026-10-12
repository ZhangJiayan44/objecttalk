import { describe, expect, it } from 'vitest';
import { __test } from '../server/game/bots';
import { analyzeSession } from '../shared/analysis';
import type { RefDesc, SceneState } from '../shared/types';

describe('AI partner helpers', () => {
  it('nudges the builder in the builder frame', () => {
    expect(__test.nudge({ c: 1, r: 1 }, { c: 2, r: 1 })).toBe('Almost! Move it one spot to your right.');
    expect(__test.nudge({ c: 2, r: 0 }, { c: 2, r: 1 })).toBe('Almost! Move it closer to you.');
    expect(__test.nudge({ c: 3, r: 2 }, { c: 1, r: 1 })).toBe('Almost! Move it 2 spots to your left and farther from you.');
  });

  it('turns listener-side wording into the unmarked "my side" slip, but keeps perspective-free words', () => {
    const directional: RefDesc = { kind: 'rocket', rel: { type: 'leftOf', view: 'guide', refs: [{ kind: 'lamp' }] } };
    expect(__test.egocentric(directional).rel?.view).toBe('unmarked');
    const free: RefDesc = { kind: 'rocket', rel: { type: 'nextTo', view: 'none', refs: [{ kind: 'lamp' }] } };
    expect(__test.egocentric(free).rel?.view).toBe('none');
    // the original is not mutated
    expect(directional.rel?.view).toBe('guide');
  });
});

describe('coach with an AI partner', () => {
  const scene: SceneState = {
    layoutId: 't',
    landmarks: [{ id: 'L0', kind: 'lamp', name: 'lamp', color: 'yellow', cell: { c: 2, r: 1 } }],
    objects: [
      { id: 'a', kind: 'mug', color: 'red', size: 'regular', cell: { c: 1, r: 1 }, yaw: 0 },
      { id: 'b', kind: 'mug', color: 'red', size: 'regular', cell: { c: 4, r: 0 }, yaw: 0 },
    ],
  };
  const mission = { id: 'm1', index: 0, type: 'find' as const, targetId: 'a', target: { kind: 'mug' }, modelAnswer: 'Pick up the mug next to the lamp.', hint: '' };

  it("does not count the AI builder's prompts as the player's questions", () => {
    const report = analyzeSession({
      missions: [{ mission, scene, startT: 0, endT: 9000, success: true, mistakes: 0 }],
      messages: [
        { id: '1', t: 500, role: 'builder', text: 'Ready! Which one should I pick up?' },
        { id: '2', t: 1500, role: 'guide', text: 'Pick up the mug next to the lamp.' },
      ],
      durationMs: 9000,
      missionsTotal: 1,
      humanRoles: ['guide'],
    });
    expect(report.questions).toBe(0);
    expect(report.reviews.map((r) => r.role)).toEqual(['guide']);
    expect(report.reviews[0].verdict).toBe('clear');
    expect(report.skills.clarifying).toBe(100);
  });
});
