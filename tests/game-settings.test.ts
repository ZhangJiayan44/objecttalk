import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameControlsPanel } from '../src/components/game/GameControlsPanel';
import { GRAPHICS_EVENT, readGraphicsMode } from '../src/lib/graphics';
import { readMouseSensitivity } from '../src/lib/settings';

let trees: ReactTestRenderer[];
let stored: Map<string, string>;
let returnFocus: ReturnType<typeof vi.fn>;

beforeEach(() => {
  trees = [];
  stored = new Map();
  returnFocus = vi.fn();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { search: '', pathname: '/room/TEST', hash: '' } }));
  vi.stubGlobal('document', { activeElement: { isConnected: true, focus: returnFocus } });
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) });
});
afterEach(() => {
  act(() => trees.forEach((tree) => tree.unmount()));
  vi.unstubAllGlobals();
});

function panel() {
  const onClose = vi.fn(), focusSettings = vi.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(GameControlsPanel, { onClose, children: createElement('button', { 'aria-label': 'Original tool' }, 'Phrasebook') }), {
      createNodeMock: (element) => element.type === 'button' && (element.props as { 'aria-label'?: string })['aria-label'] === 'Settings' ? { focus: focusSettings } : null,
    });
  });
  trees.push(tree);
  const click = (label: string) => act(() => tree.root.findByProps({ 'aria-label': label }).props.onClick());
  return { tree, onClose, focusSettings, click };
}

describe('in-game settings drawer', () => {
  it('opens settings inside the existing drawer and restores tools on back', () => {
    const p = panel();
    expect(p.tree.root.findAllByType('select')).toHaveLength(0);
    expect(p.tree.root.findByProps({ 'aria-label': 'Original tool' })).toBeDefined();
    expect(p.focusSettings).toHaveBeenCalledOnce();
    p.click('Settings');
    expect(p.tree.root.findAllByType('aside')).toHaveLength(1);
    expect(p.tree.root.findAllByProps({ 'aria-label': 'Original tool' })).toHaveLength(0);
    expect(p.tree.root.findByType('input').props.type).toBe('range');
    expect(p.tree.root.findByType('select').findAllByType('option')).toHaveLength(4);
    p.click('Back to controls');
    expect(p.tree.root.findAllByType('select')).toHaveLength(0);
    expect(p.tree.root.findByProps({ 'aria-label': 'Original tool' })).toBeDefined();
    expect(p.focusSettings).toHaveBeenCalledTimes(2);
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('applies changes immediately and keeps them when settings reopen', () => {
    const p = panel();
    const graphicsChanged = vi.fn();
    window.addEventListener(GRAPHICS_EVENT, graphicsChanged);
    p.click('Settings');
    act(() => p.tree.root.findByType('input').props.onChange({ target: { value: '1.6' } }));
    act(() => p.tree.root.findByType('select').props.onChange({ target: { value: 'off' } }));
    expect(readMouseSensitivity()).toBe(1.6);
    expect(readGraphicsMode()).toBe('off');
    expect(graphicsChanged).toHaveBeenCalledOnce();
    p.click('Back to controls');
    p.click('Settings');
    expect(p.tree.root.findByType('input').props.value).toBe(1.6);
    expect(p.tree.root.findByType('select').props.value).toBe('off');
    p.click('Reset mouse sensitivity');
    expect(readMouseSensitivity()).toBe(1);
    expect(p.tree.root.findByType('select').props.value).toBe('off');
  });

  it('isolates form keys from gameplay and lets Escape dismiss settings', () => {
    const p = panel();
    p.click('Settings');
    const key = (value: string) => {
      const event = { key: value, stopPropagation: vi.fn(), preventDefault: vi.fn() };
      act(() => p.tree.root.findByType('aside').props.onKeyDown(event));
      expect(event.stopPropagation).toHaveBeenCalledOnce();
      return event;
    };
    expect(key('Tab').preventDefault).not.toHaveBeenCalled();
    expect(key('ArrowRight').preventDefault).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(key('Escape').preventDefault).toHaveBeenCalledOnce();
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it('restores focus to the game control that opened the drawer', () => {
    const p = panel();
    p.click('Settings');
    p.click('Close settings');
    expect(p.onClose).toHaveBeenCalledOnce();
    act(() => p.tree.unmount());
    trees = [];
    expect(returnFocus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });
});
