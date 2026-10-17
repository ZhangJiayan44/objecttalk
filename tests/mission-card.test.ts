import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MissionCard, missionChip } from '../src/components/game/MissionCard';
import { DEFAULT_SETTINGS, type ClientMission, type ClientRoomState } from '../shared/protocol';

function state(level: string, mission: ClientMission, overrides: Partial<ClientRoomState> = {}): ClientRoomState {
  return {
    settings: { ...DEFAULT_SETTINGS, level },
    mission,
    scene: null,
    world: null,
    ...overrides,
  } as ClientRoomState;
}

function render(st: ClientRoomState, view: 'guide' | 'builder' = 'guide') {
  return renderToStaticMarkup(createElement(MissionCard, { st, view, pose: null, onClose() {} }));
}

function mainText(html: string) {
  // Native details hide everything below their summary until the learner opens Tips.
  return html.replace(/<details[\s\S]*?<\/details>/g, '').replace(/<[^>]*>/g, '');
}

describe('visual guide missions', () => {
  it('adds night-market shop directions while keeping the local visual task and hidden answers', () => {
    const st = state('nightmarket', {
      id: 'market1', index: 0, type: 'order', title: 'Shopping list 1',
      brief: 'Guide your partner to the shops and back to the entrance gate.',
      order: [{ kind: 'bubble-tea', size: 'big', qty: 2 }],
      modelAnswer: 'Go to Jade Tea Shop and buy two large bubble teas.', hint: 'Give one shop at a time.',
    }, { world: { kind: 'cafe', tray: [], served: 0, market: { pose: { x: 0, z: 16, yaw: 0 } } }, scene: { layoutId: 'nightmarket', landmarks: [], objects: [] } });
    const guide = render(st);
    expect(mainText(guide)).toContain('Jade Tea Shop');
    expect(mainText(guide)).toContain('× 2');
    expect(guide).toContain('aria-label="Large size"');
    expect(guide).not.toContain(st.mission!.modelAnswer);
    expect(mainText(guide)).not.toMatch(/bubble tea|large/i);
    expect(mainText(render(st, 'builder'))).not.toContain('Jade Tea Shop');
    expect(mainText(render(st, 'builder'))).toContain('entrance gate');
  });

  it('shows an order as pictures, numeric quantities and size cues, with optional collapsed tips', () => {
    const st = state('cafe', {
      id: 'm1', index: 0, type: 'order', title: 'Order 1',
      brief: 'Order the pictured items in the quantities and sizes shown.',
      order: [{ kind: 'coffee', size: 'big', qty: 2 }],
      hint: 'Coffee comes in two sizes: say a small or a large before it.',
      modelAnswer: 'Could I have two large coffees, please?',
    }, { world: { kind: 'cafe', tray: [], served: 0 }, scene: { layoutId: 'cafe', landmarks: [], objects: [] } });
    const html = render(st);
    expect(mainText(html)).toContain('× 2');
    expect(mainText(html)).not.toMatch(/coffee|small|large/i);
    expect(html).toContain('aria-label="Large size"');
    expect(html).toMatch(/<details\b[^>]*>/);
    expect(html).not.toMatch(/<details\b[^>]*\bopen/);
    expect(html).toContain('Coffee comes in two sizes');
    expect(html).not.toContain('Could I have two large coffees');
    expect(html).not.toContain('That&#x27;s all');
  });

  it('keeps tabletop targets visual instead of printing their names or full instructions', () => {
    const st = state('study', {
      id: 'm1', index: 0, type: 'find', title: 'Find it', brief: 'Help your partner pick up the highlighted object.',
      targetId: 'o1', modelAnswer: 'Pick up the small rocket next to the lamp.', hint: 'Describe where it is.',
    }, { scene: { layoutId: 'test', landmarks: [], objects: [{ id: 'o1', kind: 'rocket', color: 'red', size: 'small', cell: { c: 0, r: 0 }, yaw: 0 }] } });
    const html = render(st);
    expect(html).toContain('<img');
    expect(mainText(html)).not.toContain('rocket');
    expect(html).not.toContain('Pick up the small rocket');
  });

  it('does not spell out a bedroom object or its hiding place in the guide card', () => {
    const st = state('bedroom', {
      id: 'm1', index: 0, type: 'seek', title: 'Find my keys', brief: 'Help your partner find the pictured object.',
      targetId: 'b1', spotId: 'under-bed', modelAnswer: 'My keys are under the bed.', hint: 'Describe the hiding place.',
    }, { world: { kind: 'bedroom', items: [{ id: 'b1', kind: 'key', spot: 'under-bed' }], found: [], open: [], pose: { x: 0, z: 0, yaw: 0 } } });
    const html = render(st);
    expect(mainText(html)).not.toMatch(/keys|under the bed/);
    expect(missionChip(st)).not.toContain('keys');
    expect(html).not.toContain('My keys are under the bed');
  });

  it('uses the marked destination for guides while keeping the walker’s destination readable', () => {
    const st = state('city', {
      id: 'm1', index: 0, type: 'route', title: 'Guide the way',
      brief: 'Guide your partner to the highlighted destination.', destination: 'hospital',
      modelAnswer: 'Turn left at the bank, then go straight.', hint: 'Use the walker’s point of view.',
    });
    expect(mainText(render(st))).not.toContain('hospital');
    expect(render(st)).not.toContain('Turn left at the bank');
    expect(mainText(render(st, 'builder'))).toContain('hospital');
  });

  it('retains the visual ready check when a matching order has been prepared', () => {
    const st = state('cafe', {
      id: 'm1', index: 0, type: 'order', title: 'Order 1', brief: 'Order the pictured items.',
      order: [{ kind: 'coffee', size: 'small', qty: 1 }],
    }, {
      world: { kind: 'cafe', tray: ['c1'], served: 0 },
      scene: { layoutId: 'cafe', landmarks: [], objects: [{ id: 'c1', kind: 'coffee', color: 'white', size: 'small', cell: { c: 0, r: 2 }, yaw: 0 }] },
    });
    expect(render(st)).toContain('aria-label="Ready"');
  });
});
