import { describe, expect, it } from 'vitest';
import { MARKET_ROADS, MARKET_SHOPS, MARKET_UPPER_HEIGHT, marketStep } from '../shared/nightmarket';
import { MARKET_BACKDROP_BUILDINGS, MARKET_DECOR_PLOTS, MARKET_DECK_BOARDS, MARKET_DECK_RAILS, MARKET_DECKS, MARKET_GARDENS, MARKET_GROUND_PAVING, MARKET_MERCHANT_PLATFORMS, MARKET_PIERS, MARKET_RAIL_POSTS, MARKET_STAIR, MARKET_STAIR_OPENING, MARKET_STAIR_POSTS, MARKET_STAIR_STRINGERS, MARKET_STEPS, MARKET_STREET_KERBS, insideRect, overlapArea, shopRoofBounds } from '../shared/nightmarket-layout';

describe('night-market architecture', () => {
  it('keeps neighboring shop eaves apart on the same floor', () => {
    for (let i = 0; i < MARKET_SHOPS.length; i++) for (let j = i + 1; j < MARKET_SHOPS.length; j++) {
      const a = MARKET_SHOPS[i], b = MARKET_SHOPS[j];
      if ((a.elevation ?? 0) !== (b.elevation ?? 0)) continue;
      expect(overlapArea(shopRoofBounds(a), shopRoofBounds(b)), `${a.id} / ${b.id}`).toBeLessThan(0.001);
    }
  });

  it('has one bridge surface at intersections, including the shop landings', () => {
    for (let i = 0; i < MARKET_DECKS.length; i++) for (let j = i + 1; j < MARKET_DECKS.length; j++) expect(overlapArea(MARKET_DECKS[i], MARKET_DECKS[j])).toBeLessThan(0.00001);
    let worst = 0;
    for (let i = 0; i < MARKET_DECK_BOARDS.length; i++) for (let j = i + 1; j < MARKET_DECK_BOARDS.length; j++) worst = Math.max(worst, overlapArea(MARKET_DECK_BOARDS[i], MARKET_DECK_BOARDS[j]));
    expect(worst).toBeLessThan(0.00001);
    for (const road of MARKET_ROADS.filter((r) => r.level === 2)) {
      for (let x = road.x - road.w / 2 + 0.31; x < road.x + road.w / 2; x += 0.4) for (let z = road.z - road.d / 2 + 0.31; z < road.z + road.d / 2; z += 0.4) {
        if (insideRect({ x, z }, MARKET_STAIR_OPENING)) continue;
        expect(MARKET_DECKS.some((r) => insideRect({ x, z }, r, 0.00002)), `missing deck at ${x},${z}`).toBe(true);
      }
    }
  });

  it('builds separated stair treads that meet the upper floor at exactly its foot height', () => {
    expect(MARKET_STEPS[0].y - MARKET_STEPS[0].h / 2).toBeCloseTo(0);
    const last = MARKET_STEPS.at(-1)!;
    expect(last.y + last.h / 2).toBeCloseTo(MARKET_UPPER_HEIGHT);
    for (let i = 1; i < MARKET_STEPS.length; i++) {
      const a = MARKET_STEPS[i - 1], b = MARKET_STEPS[i];
      expect(b.x - b.w / 2 - (a.x + a.w / 2)).toBeGreaterThan(0.01);
      expect(b.y - b.h / 2).toBeCloseTo(a.y + a.h / 2);
    }
    expect(MARKET_DECKS.some((r) => insideRect({ x: MARKET_STAIR.to.x + 0.2, z: MARKET_STAIR.to.z }, r))).toBe(true);
  });

  it('leaves the stairs and upper shop entrances open, with no duplicate corner posts', () => {
    for (let i = 0; i < MARKET_RAIL_POSTS.length; i++) for (let j = i + 1; j < MARKET_RAIL_POSTS.length; j++) expect(Math.hypot(MARKET_RAIL_POSTS[i][0] - MARKET_RAIL_POSTS[j][0], MARKET_RAIL_POSTS[i][2] - MARKET_RAIL_POSTS[j][2])).toBeGreaterThanOrEqual(0.1399);
    expect(MARKET_DECK_RAILS.some(({ from, to }) => Math.abs(from[0] - 16) < 0.1 && Math.abs(to[0] - 16) < 0.1 && Math.min(from[2], to[2]) < -3 && Math.max(from[2], to[2]) > -3)).toBe(false);
    expect(MARKET_DECK_RAILS.some(({ from, to }) => Math.abs(from[0] - 17.7) < 0.1 && Math.abs(to[0] - 17.7) < 0.1 && Math.min(from[2], to[2]) < -8 && Math.max(from[2], to[2]) > -8)).toBe(false);
  });

  it('keeps platform rails, support braces and stringers clear of the stair flight', () => {
    for (const { from, to } of MARKET_DECK_RAILS) {
      for (const t of [0, 0.5, 1]) expect(insideRect({ x: from[0] + (to[0] - from[0]) * t, z: from[2] + (to[2] - from[2]) * t }, MARKET_STAIR_OPENING)).toBe(false);
    }
    for (const pier of MARKET_PIERS) expect(insideRect(pier, MARKET_STAIR_OPENING, 0.8), `pier and braces at ${pier.x},${pier.z}`).toBe(false);
    for (const stringer of MARKET_STAIR_STRINGERS) {
      expect(Math.abs(stringer.from[2] - MARKET_STAIR.from.z) - 0.08).toBeGreaterThan(MARKET_STAIR.width / 2 + 0.04);
    }
    const posts = [...MARKET_RAIL_POSTS, ...MARKET_STAIR_POSTS];
    for (let i = 0; i < posts.length; i++) for (let j = i + 1; j < posts.length; j++) {
      expect(Math.hypot(...posts[i].map((v, axis) => v - posts[j][axis]))).toBeGreaterThanOrEqual(0.1399);
    }
  });

  it('keeps the upper landing walkable without stepping onto the removed side ledges', () => {
    for (const z of [-4.55, -1.45]) {
      const start = { x: 16.4, z, y: MARKET_UPPER_HEIGHT, yaw: 0 };
      const stopped = marketStep(start, { ...start, x: 14.6 }, 1.8);
      expect(stopped.x).toBeGreaterThanOrEqual(MARKET_STAIR.to.x);
      expect(stopped.y).toBe(MARKET_UPPER_HEIGHT);
      expect(MARKET_DECKS.some((deck) => insideRect(stopped, deck, 0.00002))).toBe(true);
    }
    const landing = { x: MARKET_STAIR.to.x, z: MARKET_STAIR.to.z, y: MARKET_UPPER_HEIGHT, yaw: 0 };
    const north = marketStep(landing, { ...landing, z: -8 }, 5);
    expect(north.z).toBeCloseTo(-8);
    expect(north.y).toBe(MARKET_UPPER_HEIGHT);
    const descended = marketStep(landing, { ...landing, x: MARKET_STAIR.from.x }, 8);
    expect(descended.x).toBeCloseTo(MARKET_STAIR.from.x);
    expect(descended.y).toBeCloseTo(0);
  });

  it('fills the central blocked courtyard without obstructing its surrounding paths or the skywalk', () => {
    const garden = MARKET_GARDENS[0];
    for (const bed of MARKET_GARDENS) for (const road of MARKET_ROADS.filter((r) => r.level === 0)) expect(overlapArea(bed, road)).toBe(0);
    const west = { x: -8, z: garden.z, y: 0, yaw: 0 };
    expect(marketStep(west, { x: garden.x, z: garden.z, yaw: 0 }, 8).x).toBeLessThan(-6.3);
    const upper = { x: -8, z: -14, y: MARKET_UPPER_HEIGHT, yaw: 0 };
    const crossed = marketStep(upper, { ...upper, x: -3 }, 5);
    expect(crossed.x).toBeCloseTo(-3);
    expect(crossed.y).toBe(MARKET_UPPER_HEIGHT);
  });

  it('makes the blocked entrance center a planted court and outlines only external street edges', () => {
    for (const x of [-2, 0, 2]) for (const z of [0, 1, 2]) expect(MARKET_GARDENS.some((g) => insideRect({ x, z }, g))).toBe(true);
    for (const garden of MARKET_GARDENS) for (const shop of MARKET_SHOPS.filter((s) => !s.elevation)) expect(overlapArea(garden, shopRoofBounds(shop)), `${garden.id} / ${shop.id}`).toBe(0);
    for (let i = 0; i < MARKET_GARDENS.length; i++) for (let j = i + 1; j < MARKET_GARDENS.length; j++) expect(overlapArea(MARKET_GARDENS[i], MARKET_GARDENS[j])).toBe(0);
    for (const { from, to } of MARKET_STREET_KERBS) {
      const x = (from[0] + to[0]) / 2, z = (from[2] + to[2]) / 2;
      const dx = from[0] === to[0] ? 0.12 : 0, dz = from[2] === to[2] ? 0.12 : 0;
      const sides = [-1, 1].map((side) => MARKET_GROUND_PAVING.some((paving) => insideRect({ x: x + side * dx, z: z + side * dz }, paving)));
      expect(sides.filter(Boolean), `curb inside a junction at ${x},${z}`).toHaveLength(1);
    }
  });

  it('fills blocked pockets without covering streets, gardens, or shop roofs', () => {
    for (const plot of MARKET_DECOR_PLOTS) {
      for (const road of MARKET_ROADS) expect(overlapArea(plot, road), `${plot.id} / ${road.name}`).toBe(0);
      for (const garden of MARKET_GARDENS) expect(overlapArea(plot, garden), plot.id).toBe(0);
      for (const shop of MARKET_SHOPS) expect(overlapArea(plot, shopRoofBounds(shop)), `${plot.id} / ${shop.id}`).toBe(0);
      for (const pier of MARKET_PIERS) expect(insideRect(pier, plot, 0.25), plot.id).toBe(false);
    }
    for (let i = 0; i < MARKET_DECOR_PLOTS.length; i++) for (let j = i + 1; j < MARKET_DECOR_PLOTS.length; j++) expect(overlapArea(MARKET_DECOR_PLOTS[i], MARKET_DECOR_PLOTS[j])).toBe(0);
  });

  it('joins craft frontages and tea seating to the bridge without a rail across their access', () => {
    for (const platform of MARKET_MERCHANT_PLATFORMS) {
      expect(MARKET_DECKS.some((deck) => insideRect(platform, deck)), `missing platform at ${platform.x}`).toBe(true);
      expect(MARKET_DECKS.some((deck) => insideRect({ x: platform.x, z: -15.65 }, deck))).toBe(true);
      for (const { from, to } of MARKET_DECK_RAILS) {
        // The frontage centerline crosses the rear edge of the east-west gallery.
        if (Math.abs(from[2] - to[2]) > 0.00001) continue;
        const crossesAccess = Math.min(from[0], to[0]) < platform.x && Math.max(from[0], to[0]) > platform.x && from[2] > -16 && from[2] < -15;
        expect(crossesAccess, `rail across frontage at ${platform.x}`).toBe(false);
      }
    }
  });

  it('keeps structural piers and the unreachable town clear of every pedestrian lane', () => {
    expect(MARKET_PIERS.length).toBeGreaterThan(8);
    for (const p of MARKET_PIERS) for (const road of MARKET_ROADS.filter((r) => r.level === 0)) expect(insideRect(p, road, 0.5)).toBe(false);
    for (const b of MARKET_BACKDROP_BUILDINGS) {
      const c = Math.abs(Math.cos(b.yaw)), s = Math.abs(Math.sin(b.yaw));
      const r = { x: b.x - Math.sin(b.yaw) * 0.6, z: b.z - Math.cos(b.yaw) * 0.6, w: c * (b.w + 1) + s * (b.d + 1), d: s * (b.w + 1) + c * (b.d + 1) };
      for (const road of MARKET_ROADS) expect(overlapArea(r, road), `background at ${b.x},${b.z}`).toBe(0);
    }
  });
});
