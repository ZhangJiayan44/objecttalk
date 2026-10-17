import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBedroomBot, segmentClear } from '../server/game/bots/bedroom';
import { canReach, collideRoom, spotById, type BedroomState, type SeekMission } from '../shared/bedroom';
import { moveWithCollision } from '../shared/collision';
import { createRng } from '../shared/rng';
import type { Pose } from '../shared/city';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('bedroom AI walking', () => {
  it('rejects a stationary waypoint inside furniture', () => {
    expect(segmentClear({ x: 2, z: 1.5 }, { x: 2, z: 1.5 })).toBe(false);
  });

  for (const [from, to] of [['toybox', 'wardrobe-top'], ['wardrobe-top', 'toybox']]) {
    it(`finds an object from ${from} to ${to} without getting stuck at the beanbag`, async () => {
      const start = spotById(from)!, target = spotById(to)!;
      let pose: Pose = { x: start.approach[0], z: start.approach[1], yaw: 0 };
      const item = { id: 'target', kind: 'alarm', spot: to };
      const state: BedroomState = { items: [item], found: [] };
      const opened = new Set<string>();
      const pick = vi.fn((id: string) => {
        expect(canReach(pose, item)).toBe(true);
        expect(to !== 'toybox' || opened.has('toybox')).toBe(true);
        state.found.push(id);
      });
      const mission: SeekMission = { id: 'm1', index: 0, type: 'seek', targetId: item.id, kind: item.kind, spotId: to, modelAnswer: '', hint: '' };
      const bot = createBedroomBot({ id: 'seeker', role: 'builder', difficulty: 'normal', rng: createRng(1), say: vi.fn(), trace: vi.fn(), transcript: () => [] }, {
        state: () => state, pose: () => pose, opened: () => opened,
        mission: () => mission,
        move: next => { pose = { ...moveWithCollision(pose, next, collideRoom), yaw: next.yaw }; },
        pick,
        open: (id, value) => { if (value) opened.add(id); else opened.delete(id); },
      });
      try {
        bot.onMissionStart(mission);
        bot.onChat({ id: 'message', t: 0, at: Date.now(), playerId: 'owner', name: 'Owner', role: 'guide', via: 'text', text: `I lost my alarm clock. It is ${target.phrase}.` });
        await vi.advanceTimersByTimeAsync(30000);
        expect(pick).toHaveBeenCalledWith(item.id);
      } finally { bot.dispose(); }
    });
  }
});
