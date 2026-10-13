import { describe, expect, it } from 'vitest';
import { buildBedroom, collideRoom, FURNITURE, generateSeekMission, matchSpots, parseSpot, SPOTS } from '../shared/bedroom';
import { buildCafe, generateOrder, lineText, orderSentence, parseOrder, trayStatus } from '../shared/cafe';
import { estimateCefr } from '../shared/cefr';
import { buildTown, collide, generateRouteMission, headingOf, LOT, lotCenter, parseDirections, planRoute, relativeTurn, yawOf } from '../shared/city';
import { createRng } from '../shared/rng';
import { pathTo, segmentClear } from '../server/game/bots/bedroom';

describe('cafe: ordering', () => {
  it('parses numbers, sizes and plurals', () => {
    const p = parseOrder('Hi! Could I have two croissants and a large coffee, please?');
    expect(p.lines).toEqual([
      { kind: 'croissant', size: null, qty: 2, negated: false, plural: false },
      { kind: 'coffee', size: 'big', qty: 1, negated: false, plural: false },
    ]);
    expect(p.polite).toBe(true);
    expect(p.missingNumbers).toBe(false);
  });

  it('notices a plural with no number, negation, corrections and "that\'s all"', () => {
    expect(parseOrder('croissants please').lines[0]).toMatchObject({ kind: 'croissant', qty: null, plural: true });
    expect(parseOrder('no pizza, thanks').lines[0]).toMatchObject({ kind: 'pizza', negated: true });
    expect(parseOrder('make that three').correction).toBe(3);
    expect(parseOrder("That's all, thanks!").done).toBe(true);
    expect(parseOrder('two more doughnuts').lines[0]).toMatchObject({ kind: 'doughnut', qty: 2 });
    expect(parseOrder('a medium soda').oddSize).toBe(true);
  });

  it('writes natural order text', () => {
    expect(lineText({ kind: 'icecream', size: null, qty: 1 })).toBe('an ice cream');
    expect(lineText({ kind: 'pizza', size: null, qty: 2 })).toBe('two slices of pizza');
    expect(lineText({ kind: 'coffee', size: 'big', qty: 1 })).toBe('a large coffee');
    expect(orderSentence([{ kind: 'sandwich', size: null, qty: 3 }])).toBe('Hi! Could I have three sandwiches, please?');
  });

  it('only orders what the case can serve, and checks the tray', () => {
    for (let seed = 1; seed < 60; seed++) {
      const rng = createRng(seed);
      const cafe = buildCafe(rng);
      const order = generateOrder(cafe, 'tricky', rng);
      expect(order.length).toBeGreaterThanOrEqual(2);
      // Fill the tray with exactly the order.
      const tray: string[] = [];
      for (const l of order) {
        const ids = cafe.scene.objects.filter((o) => o.kind === l.kind && (l.size ? o.size === l.size : true) && !tray.includes(o.id)).slice(0, l.qty);
        expect(ids.length).toBe(l.qty);
        tray.push(...ids.map((o) => o.id));
      }
      expect(trayStatus({ ...cafe, tray }, order).complete).toBe(true);
      expect(trayStatus({ ...cafe, tray: tray.slice(1) }, order).complete).toBe(false);
    }
  });
});

describe('city: directions', () => {
  it('turns relative to the heading', () => {
    expect(relativeTurn('N', 'E')).toBe('right');
    expect(relativeTurn('S', 'E')).toBe('left');
    expect(relativeTurn('W', 'E')).toBe('around');
    expect(headingOf(yawOf('W'))).toBe('W');
  });

  it('plans walkable routes for every destination', () => {
    for (let seed = 1; seed < 40; seed++) {
      const town = buildTown(createRng(seed));
      expect(town.places).toHaveLength(9);
      for (const place of town.places) {
        const plan = planRoute(town, town.start, place.id);
        expect(plan).not.toBeNull();
        expect(plan!.text).toMatch(new RegExp(`The ${place.name} is on your (left|right)\\.$`));
        expect(plan!.text).not.toMatch(/north|south|east|west/);
      }
      const m = generateRouteMission(town, town.start, 0, createRng(seed));
      expect(m).not.toBeNull();
    }
  });

  it('understands direction sentences and flags map words', () => {
    const p = parseDirections('Go straight for two blocks, then turn left at the bank. It is on your right.');
    expect(p.steps).toEqual([
      { type: 'straight', blocks: 2, until: null },
      { type: 'turn', dir: 'left', at: 'bank', ordinal: null },
      { type: 'side', side: 'right', place: null },
    ]);
    expect(parseDirections('Take the second right.').steps[0]).toMatchObject({ type: 'turn', dir: 'right', ordinal: 2 });
    expect(parseDirections('Go north, then up the street').mapWords).toEqual(['north']);
    expect(parseDirections('Go up, then turn left').mapWords).toEqual(['up']);
  });

  it('keeps walkers out of buildings', () => {
    const c = lotCenter(1, 1);
    const pushed = collide({ x: c.x + 0.5, z: c.z + 0.3 });
    expect(Math.abs(pushed.x - c.x) >= LOT / 2 || Math.abs(pushed.z - c.z) >= LOT / 2).toBe(true);
  });
});

describe('bedroom: lost and found', () => {
  it('understands where things are', () => {
    expect(parseSpot("I think they're under the bed")).toMatchObject({ furniture: 'bed', prep: 'under' });
    expect(matchSpots(parseSpot('under the bed')).map((s) => s.id)).toEqual(['under-bed']);
    expect(matchSpots(parseSpot('on top of the wardrobe')).map((s) => s.id)).toEqual(['wardrobe-top']);
    expect(matchSpots(parseSpot('inside the toy box')).map((s) => s.id)).toEqual(['toybox']);
    expect(matchSpots(parseSpot('on the bookshelf')).map((s) => s.id).sort()).toEqual(['shelf-bottom', 'shelf-top']);
    expect(matchSpots(parseSpot('the top shelf')).map((s) => s.id)).toEqual(['shelf-top']);
    expect(parseSpot('my glasses').item).toBe('glasses');
    expect(parseSpot('over there').vague).toBe(true);
  });

  it('every spot can be reached on foot', () => {
    const start = { x: 0.3, z: 2.7 };
    for (const spot of SPOTS) {
      const goal = { x: spot.approach[0], z: spot.approach[1] };
      // Standing points are in free space...
      const c = collideRoom(goal);
      expect(Math.hypot(c.x - goal.x, c.z - goal.z)).toBeLessThan(0.05);
      // ...reachable directly or via the middle of the room.
      const path = [start, ...pathTo(start, spot)];
      for (let i = 0; i + 1 < path.length; i++) expect(segmentClear(path[i], path[i + 1])).toBe(true);
      // ...and close enough to pick the thing up.
      expect(Math.hypot(spot.pos[0] - goal.x, spot.pos[2] - goal.z)).toBeLessThan(2.6);
    }
    expect(FURNITURE.length).toBeGreaterThan(8);
  });

  it('hides tricky items in hard places', () => {
    for (let seed = 1; seed < 30; seed++) {
      const rng = createRng(seed);
      const room = buildBedroom(rng);
      expect(room.items.length).toBe(8);
      const m = generateSeekMission(room, 0, 'tricky', rng)!;
      expect(['under-bed', 'under-desk', 'wardrobe-top', 'shelf-top', 'toybox', 'windowsill']).toContain(m.spotId);
      expect(m.modelAnswer).toMatch(/^Can you find my /);
    }
  });
});

describe('CEFR estimate', () => {
  it('needs a few sentences and rewards richer English', () => {
    expect(estimateCefr(['left', 'yes'])).toBeNull();
    const a = estimateCefr(['rocket', 'left one', 'yes', 'no', 'that'])!;
    const b = estimateCefr([
      'Could you pick up the small rocket next to the lamp, please?',
      'Then put it between the plant and the red book, closer to you.',
      'Sorry, I mean on your left, not mine, because we face each other.',
      'If you see two mugs, take the one that is farther from you.',
    ])!;
    expect(a?.level ?? 'A1').toMatch(/A1|A2/);
    expect(['B1', 'B2', 'C1']).toContain(b.level);
    expect(b.score).toBeGreaterThan(a?.score ?? 0);
    expect(b.reasons.length).toBeGreaterThan(1);
  });
});

describe('agent-made levels (content/levels)', () => {
  it('every published level still passes its playability check', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { validateLevel } = await import('../agent/level');
    const files = readdirSync('content/levels').filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
      const bundle = JSON.parse(readFileSync(`content/levels/${f}`, 'utf8'));
      expect(bundle.level.generated.agent.generations).toBe(bundle.kinds.length);
      for (const k of bundle.kinds) expect(k.rodin.generationId).toMatch(/^[0-9a-f-]{36}$/);
      const v = validateLevel(bundle.level, bundle.kinds, 60);
      expect(v.ok, `${f}: ${v.lines.join(' | ')}`).toBe(true);
    }
  }, 60_000);
});

describe('Chinese lifeline helpers', () => {
  it('detects Chinese, translates with the offline glossary and prices lifelines', async () => {
    const { glossaryTranslate, hasChinese, lifelinePenalty, saidLifeline } = await import('../shared/lifeline');
    expect(hasChinese('我想要两个苹果')).toBe(true);
    expect(hasChinese('two apples, please')).toBe(false);
    expect(glossaryTranslate('我要一个甜甜圈')?.toLowerCase()).toContain('doughnut');
    expect(glossaryTranslate('在台灯的左边')?.toLowerCase()).toContain('left');
    expect(glossaryTranslate('嗯嗯嗯')).toBeNull();
    expect(lifelinePenalty(0)).toBe(0);
    expect(lifelinePenalty(1)).toBe(0);
    expect(lifelinePenalty(3)).toBe(8);
    expect(saidLifeline('Could I have a large coffee', 'could i have a large coffee please')).toBe(true);
    expect(saidLifeline('Could I have a large coffee', 'two doughnuts')).toBe(false);
  });
});

describe("players' own objects (Object Studio) in other levels", () => {
  it('sells them as the special of the day and hides them in the bedroom first', async () => {
    const { registerKinds } = await import('../shared/catalog');
    const { buildCafe, generateOrderMission, parseOrder } = await import('../shared/cafe');
    const { buildBedroom, generateSeekMission } = await import('../shared/bedroom');
    registerKinds([{ id: 'my-test01', name: 'panda mug', plural: 'panda mugs', synonyms: ['panda mug', 'panda mugs'], interest: 'everyday', emoji: '✨', model: '/generated/my-test01.glb', baseColor: 'white', footprint: 0.34, source: 'rodin' }]);
    const cafe = buildCafe(createRng(5), 'cafe', ['my-test01']);
    expect(cafe.scene.objects.some((o) => o.kind === 'my-test01')).toBe(true);
    const m = generateOrderMission(cafe, 0, 'normal', createRng(6), ['my-test01'])!;
    expect(m.order.some((l) => l.kind === 'my-test01')).toBe(true);
    // Understood in the room that sells it, and only there.
    expect(parseOrder('Two panda mugs, please', 'cafe', ['my-test01']).lines[0]?.kind).toBe('my-test01');
    expect(parseOrder('Two panda mugs, please', 'cafe').lines).toHaveLength(0);
    const room = buildBedroom(createRng(7), ['my-test01']);
    expect(room.items.some((i) => i.kind === 'my-test01')).toBe(true);
    expect(generateSeekMission(room, 0, 'normal', createRng(8), ['my-test01'])?.kind).toBe('my-test01');
  });

  it('keeps every quest order within the six tray slots', async () => {
    const { buildCafe, generateOrderMission, TRAY_SLOTS } = await import('../shared/cafe');
    for (const level of ['cafe', 'nightmarket']) {
      for (const quest of ['mixed', 'party', 'drinks'])
        for (const difficulty of ['easy', 'normal', 'tricky'] as const)
          for (let seed = 1; seed <= 60; seed++) {
            const m = generateOrderMission(buildCafe(createRng(seed), level), 0, difficulty, createRng(seed * 13), [], quest);
            expect(m).toBeTruthy();
            expect(m!.order.reduce((n, l) => n + l.qty, 0)).toBeLessThanOrEqual(TRAY_SLOTS);
          }
    }
  });
});
