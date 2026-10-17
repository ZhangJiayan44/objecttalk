import { describe, expect, it } from 'vitest';
import { MARKET_ROADS, MARKET_SHOPS, MARKET_UPPER_HEIGHT, marketStep } from '../shared/nightmarket';
import { MARKET_BACKDROP_BUILDINGS, MARKET_DECK_BOARDS, MARKET_DECK_RAILS, MARKET_DECKS, MARKET_GARDENS, MARKET_PIERS, MARKET_RAIL_POSTS, MARKET_STAIR, MARKET_STEPS, insideRect, overlapArea, shopRoofBounds } from '../shared/nightmarket-layout';

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
        if (x < MARKET_STAIR.to.x && x > MARKET_STAIR.from.x && Math.abs(z - MARKET_STAIR.from.z) < MARKET_STAIR.width / 2) continue;
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

  it('fills the central blocked courtyard without obstructing its surrounding paths or the skywalk', () => {
    const garden = MARKET_GARDENS[0];
    for (const bed of MARKET_GARDENS) for (const road of MARKET_ROADS.filter((r) => r.level === 0)) expect(overlapArea(bed, road)).toBe(0);
    const west = { x: -8, z: garden.z, y: 0, yaw: 0 };
    expect(marketStep(west, { x: garden.x, z: garden.z, yaw: 0 }, 8).x).toBeLessThan(-6.3);
    const upper = { x: -8, z: -7, y: MARKET_UPPER_HEIGHT, yaw: 0 };
    // This edition keeps the west upper arcade as a short merchant frontage;
    // the open courtyard crossing from the upstream layout is intentionally absent.
    const crossed = marketStep(upper, { ...upper, z: -14 }, 8);
    expect(crossed.z).toBeCloseTo(-14);
    expect(crossed.y).toBe(MARKET_UPPER_HEIGHT);
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
