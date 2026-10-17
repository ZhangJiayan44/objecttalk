import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildMarket, collideMarket, marketHeight, MARKET_NODES, MARKET_MEETING, MARKET_SHOPS, MARKET_START, marketDirections, marketOrderSpeech, marketRoute, marketStep, nearShop, shopApproach, shopForKind } from '../shared/nightmarket';
import { generateOrder, objectKey, parseOrder, trayStatus } from '../shared/cafe';
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
  it('does not mistake food words in lane names for extra shopping instructions', () => {
    const directions = 'Everything is in the bag. Turn around toward the corn courtyard, then follow Chestnut Lane to the entrance.';
    expect(parseOrder(marketOrderSpeech(directions), 'nightmarket').lines).toEqual([]);
    expect(parseOrder(marketOrderSpeech('Buy two ears of corn at Golden Corn Cart. Follow the corn courtyard.'), 'nightmarket').lines).toMatchObject([{ kind: 'corn', qty: 2 }]);
  });
  it('stocks every shop with uniquely assigned goods, including the northern expansion', () => {
    const { scene } = buildMarket(createRng(42));
    for (const shop of MARKET_SHOPS) {
      expect(shop.kinds.length).toBeGreaterThan(0);
      for (const kind of shop.kinds) {
        expect(scene.objects.some((o) => o.kind === kind)).toBe(true);
        expect(MARKET_SHOPS.filter((s) => s.kinds.includes(kind))).toHaveLength(1);
      }
      expect(collideMarket(shopApproach(shop))).toEqual(shopApproach(shop));
    }
    expect(MARKET_SHOPS.filter((s) => s.elevation)).toHaveLength(2);
  });

  it('routes between every shop without crossing a building', () => {
    const points = [MARKET_START, ...MARKET_SHOPS.map(shopApproach), ...MARKET_NODES];
    for (const from of points) for (const to of points) {
      let p = from;
      for (const next of marketRoute(from, to)) {
        for (let i = 0; i <= 40; i++) {
          const q = { x: p.x + (next.x - p.x) * i / 40, z: p.z + (next.z - p.z) * i / 40 };
          const projected = collideMarket(q);
          expect(projected.x).toBeCloseTo(q.x, 8);
          expect(projected.z).toBeCloseTo(q.z, 8);
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
      for (const line of list) expect(engine.scene()!.objects.filter((o) => objectKey(o) === `${line.kind}|${line.size ?? ''}`).length).toBeGreaterThanOrEqual(line.qty);
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

  it('allows buying from every shop through the winding lanes and upper stairs', () => {
    const { engine, walk } = game();
    for (const shop of MARKET_SHOPS) {
      walk(shopApproach(shop));
      const item = engine.scene()!.objects.find((o) => shop.kinds.includes(o.kind))!;
      engine.tray('builder', item.id, true);
      expect(engine.world()!.tray).toContain(item.id);
      engine.tray('builder', item.id, false);
    }
  });

  it('routes upstairs through the stair entrance, changes height smoothly, and returns downstairs', () => {
    const shop = MARKET_SHOPS.find((s) => s.id === 'tea')!;
    const route = marketRoute(MARKET_START, shopApproach(shop));
    expect(route).toContainEqual({ x: 8, z: -3 });
    expect(route).toContainEqual({ x: 16, z: -3 });
    let pose = MARKET_START;
    for (const target of [...route, ...marketRoute(shopApproach(shop), MARKET_MEETING)]) {
      let attempts = 0;
      while (Math.hypot(target.x - pose.x, target.z - pose.z) > 0.001 && attempts++ < 500) {
        const next = marketStep(pose, { ...target, yaw: 0 }, 0.1);
        expect(Math.abs(marketHeight(next) - marketHeight(pose))).toBeLessThanOrEqual(0.066);
        pose = next;
      }
      expect(attempts).toBeLessThan(500);
    }
    expect(marketHeight(pose)).toBe(0);
    expect(marketHeight(shopApproach(shop))).toBe(3.6);
    expect(marketDirections(MARKET_START, shop)).toContain('UP');
    expect(marketDirections({ ...shopApproach(shop), yaw: 0 })).toContain('DOWN');
    expect(nearShop({ x: 13.8, z: -8 }, shop)).toBe(false);
    const edge = { x: 14.35, z: -8, yaw: Math.PI / 2 };
    expect(marketStep(edge, { x: 13, z: -8, yaw: edge.yaw }, 1).x).toBeGreaterThanOrEqual(14.3);
  });

  it('rejects invalid poses and limits teleporting through blocks', () => {
    const { engine } = game();
    engine.move('builder', 'b', { x: NaN, z: 1, yaw: 0 });
    expect(engine.world()!.market!.pose).toEqual(MARKET_START);
    engine.move('builder', 'b', { x: 10, z: -6, yaw: 0 });
    const p = engine.world()!.market!.pose;
    expect(Math.hypot(p.x - MARKET_START.x, p.z - MARKET_START.z)).toBeLessThan(2);
    const wall: Pose = { x: 2, z: -7, yaw: 0 };
    expect(marketStep(wall, { x: 12, z: -7, yaw: 0 }, 20).x).toBeLessThanOrEqual(3.55);
    expect(marketDirections({ ...MARKET_START, yaw: Math.PI }, MARKET_SHOPS[0])).toContain('Turn around');
  });
});
