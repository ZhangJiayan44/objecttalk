import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildMarket, collideMarket, MARKET_MEETING, MARKET_SHOPS, MARKET_START, marketDirections, marketRoute, marketStep, shopApproach, shopForKind } from '../shared/nightmarket';
import { generateOrder, objectKey, trayStatus } from '../shared/cafe';
import type { Pose } from '../shared/city';
import { createRng } from '../shared/rng';
import { DEFAULT_SETTINGS } from '../shared/protocol';
import { CafeEngine } from '../server/game/engines/cafe';
import type { EngineHost } from '../server/game/engines/types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function game(seed = 42) {
  const succeed = vi.fn();
  const host: EngineHost = { settings: { ...DEFAULT_SETTINGS, level: 'nightmarket' }, rng: createRng(seed), now: () => Date.now(), fx: vi.fn(), log: vi.fn(), broadcast: vi.fn(), succeed, mistake: vi.fn(), emitHover: vi.fn(), emitPose: vi.fn(), notifyBots: vi.fn() };
  const engine = new CafeEngine(host);
  engine.begin();
  engine.startMission(0);
  const walk = (target: { x: number; z: number }) => {
    const current = engine.world()!.market!.pose;
    for (const next of marketRoute(current, target)) {
      let attempts = 0;
      while (attempts++ < 150) {
        const p = engine.world()!.market!.pose;
        const dx = next.x - p.x, dz = next.z - p.z, len = Math.hypot(dx, dz);
        if (len < 0.01) break;
        const step = Math.min(len, 0.5);
        vi.advanceTimersByTime(100);
        engine.move('builder', 'shopper', { x: p.x + dx / len * step, z: p.z + dz / len * step, yaw: Math.atan2(-dx, -dz) });
      }
      expect(engine.world()!.market!.pose.x).toBeCloseTo(next.x, 1);
      expect(engine.world()!.market!.pose.z).toBeCloseTo(next.z, 1);
    }
  };
  return { engine, host, succeed, walk };
}

describe('walkable night market', () => {
  it('routes between every shop without crossing a building', () => {
    const points = [MARKET_START, ...MARKET_SHOPS.map(shopApproach)];
    for (const from of points) for (const to of points) {
      let p = from;
      for (const next of marketRoute(from, to)) {
        for (let i = 0; i <= 40; i++) {
          const q = { x: p.x + (next.x - p.x) * i / 40, z: p.z + (next.z - p.z) * i / 40 };
          expect(collideMarket(q)).toEqual(q);
        }
        p = next;
      }
    }
  });

  it('has enough stock for all quantities and sizes on every difficulty', () => {
    for (const difficulty of ['easy', 'normal', 'tricky'] as const) for (let seed = 0; seed < 50; seed++) {
      const rng = createRng(seed), st = buildMarket(rng), order = generateOrder(st, difficulty, rng);
      const tray: string[] = [];
      for (const l of order) tray.push(...st.scene.objects.filter((o) => objectKey(o) === `${l.kind}|${l.size ?? ''}`).slice(0, l.qty).map((o) => o.id));
      expect(trayStatus({ ...st, tray }, order).complete).toBe(true);
      expect(tray.length).toBeLessThanOrEqual(6);
    }
  });

  it('keeps the list private and includes shops in a side lane', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { engine } = game(seed);
      expect(engine.missionFor('builder')!.order).toBeUndefined();
      expect(engine.missionFor('builder')!.modelAnswer).toBeUndefined();
      const list = engine.missionFor('guide')!.order!;
      expect(new Set(list.map((l) => shopForKind(l.kind).id)).size).toBeGreaterThanOrEqual(2);
      expect(list.some((l) => Math.abs(shopForKind(l.kind).x) > 6)).toBe(true);
    }
  });

  it('requires visiting the correct owner and returning to the meeting point', () => {
    const { engine, succeed, walk } = game();
    const order = engine.missionFor('guide')!.order!;
    const first = engine.scene()!.objects.find((o) => o.kind === order[0].kind)!;
    engine.tray('guide', first.id, true);
    engine.tray('builder', first.id, true);
    expect(engine.world()!.tray).toEqual([]);
    for (const line of order) {
      walk(shopApproach(shopForKind(line.kind)));
      const stock = engine.scene()!.objects.filter((o) => objectKey(o) === `${line.kind}|${line.size ?? ''}`).slice(0, line.qty);
      for (const o of stock) engine.tray('builder', o.id, true);
    }
    engine.serve('builder');
    expect(succeed).not.toHaveBeenCalled();
    walk(MARKET_MEETING);
    engine.serve('builder');
    expect(succeed).toHaveBeenCalledOnce();
    expect(engine.world()!.tray).toEqual([]);
    expect(engine.report({ messages: [], durationMs: 1000, humanRoles: ['builder'] }).extras.poses!.length).toBeGreaterThan(10);
  });

  it('rejects invalid poses and limits teleporting through blocks', () => {
    const { engine } = game();
    engine.move('builder', 'b', { x: NaN, z: 1, yaw: 0 });
    expect(engine.world()!.market!.pose).toEqual(MARKET_START);
    engine.move('builder', 'b', { x: 10, z: -6, yaw: 0 });
    const p = engine.world()!.market!.pose;
    expect(Math.hypot(p.x - MARKET_START.x, p.z - MARKET_START.z)).toBeLessThan(2);
    const wall: Pose = { x: 3, z: 0, yaw: 0 };
    expect(marketStep(wall, { x: 12, z: 0, yaw: 0 }, 20).x).toBeLessThanOrEqual(3.05);
    expect(marketDirections({ ...MARKET_START, yaw: Math.PI }, MARKET_SHOPS[0])).toContain('Turn around');
  });
});
