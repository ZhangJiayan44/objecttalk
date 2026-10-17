import { describe, expect, it } from 'vitest';
import { LEVELS, levelOf, registerLevels } from '../shared/levels';
import { clampWalk, COUNTER_WALK_BOUNDS, TABLE_WALK_BOUNDS } from '../shared/walking';

describe('bounded walking in shops', () => {
  it('keeps players on their own side, even after an oversized movement step', () => {
    for (const bounds of [COUNTER_WALK_BOUNDS, TABLE_WALK_BOUNDS]) {
      for (const role of ['guide', 'builder'] as const) {
        const b = bounds[role];
        expect(clampWalk({ x: -100, z: -100 }, b)).toEqual({ x: b.minX, z: b.minZ });
        expect(clampWalk({ x: 100, z: 100 }, b)).toEqual({ x: b.maxX, z: b.maxZ });
        expect(b.minZ * b.maxZ).toBeGreaterThan(0);
      }
    }
    expect(COUNTER_WALK_BOUNDS.builder.maxZ).toBeLessThan(-0.5);
    expect(COUNTER_WALK_BOUNDS.guide.minZ).toBeGreaterThan(0.5);
    expect(TABLE_WALK_BOUNDS.builder.minZ).toBeGreaterThan(0.9);
    expect(TABLE_WALK_BOUNDS.guide.maxZ).toBeLessThan(-0.9);
  });

  it('lets players slide sideways along the counter to reach the tray and bell', () => {
    const bounds = COUNTER_WALK_BOUNDS.builder;
    expect(clampWalk({ x: 3.05, z: 0 }, bounds)).toEqual({ x: 3.05, z: bounds.maxZ });
    expect(clampWalk({ x: -1.62, z: -1.2 }, bounds)).toEqual({ x: -1.62, z: -1.2 });
  });

  it('keeps the basic study stationary and enables walking in other built-in levels', () => {
    for (const level of Object.values(LEVELS)) {
      expect(level.controls).toBe(level.id === 'study' ? 'stand' : 'walk');
    }
  });

  it('also enables walking in older generated shop bundles', () => {
    const legacy = {
      ...LEVELS.cafe,
      id: 'gen-walking-test',
      controls: 'stand' as const,
      generated: {
        theme: 'Test shop', createdAt: 0, kinds: [], sign: 'Test shop',
        palette: { wall: '#fff', wallLow: '#fff', floor: '#fff', accent: '#fff' },
        agent: { planner: 'test', backend: 'test', review: 'test', generations: 0, validation: 'test' },
      },
    };
    registerLevels([legacy]);
    expect(levelOf(legacy.id).controls).toBe('walk');
    expect(levelOf(legacy.id).engine).toBe('order');
  });
});
