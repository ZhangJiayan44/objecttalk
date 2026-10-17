import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Progress from '../src/pages/Progress';
import { addSession, getSessions, type SessionSummary } from '../src/lib/profile';

vi.mock('../src/components/ui', () => ({ Navbar: () => null, Footer: () => null, btn: () => '' }));
vi.mock('../src/components/game/Results', () => ({ SkillBars: () => null }));

let stored: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  stored = new Map();
  setItem = vi.fn((key: string, value: string) => stored.set(key, value));
  vi.stubGlobal('localStorage', { getItem: (key: string) => stored.get(key) ?? null, setItem });
});
afterEach(() => vi.unstubAllGlobals());

const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Progress)));
const metric = (html: string, label: string) => html.match(new RegExp(`<dt[^>]*>${label}</dt><dd[^>]*>([^<]*)</dd>`))?.[1];
const session = (replayId: string, clarity: number, missionsDone = 0): SessionSummary => ({
  replayId, at: Date.UTC(2026, 9, 17, 12), role: 'guide', partner: 'ai', clarity,
  stars: 1, missionsDone, missionsTotal: 3, mistakes: 0,
  skills: { spatial: 40, perspective: 50, clarifying: 60, speed: 70 }, level: 'study',
});

describe('personal progress', () => {
  it('shows an honest empty state without scores, history or sample records in a new browser', () => {
    const html = render();
    expect(metric(html, 'Games played')).toBe('0');
    expect(metric(html, 'Missions completed')).toBe('0');
    expect(metric(html, 'Average clarity')).toBe('—');
    expect(metric(html, 'Best clarity')).toBe('—');
    expect(html).toContain('No games completed yet');
    expect(html).not.toContain('Clarity scores:');
    expect(html).not.toContain('<table');
    expect(html).not.toMatch(/sample data|NaN|Infinity/);
    expect(getSessions()).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('uses only stored completed games and keeps them on subsequent visits', () => {
    addSession(session('first', 0));
    addSession(session('second', 75, 2));
    // Coaching may update the same game's report after the result first arrives.
    addSession(session('second', 80, 3));
    for (let visit = 0; visit < 2; visit++) {
      const html = render();
      expect(metric(html, 'Games played')).toBe('2');
      expect(metric(html, 'Average clarity')).toBe('40');
      expect(metric(html, 'Best clarity')).toBe('80');
      expect(metric(html, 'Missions completed')).toBe('3');
      expect(html).toContain('href="/replay/first"');
      expect(html).toContain('href="/replay/second"');
      expect(html).not.toContain('No games completed yet');
    }
  });

  it('treats an actual score of zero as a completed game', () => {
    addSession(session('zero-score', 0));
    const html = render();
    expect(metric(html, 'Games played')).toBe('1');
    expect(metric(html, 'Average clarity')).toBe('0');
    expect(metric(html, 'Best clarity')).toBe('0');
    expect(html).toContain('Clarity scores: 0');
  });

  it('stays empty when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage blocked'); } });
    const html = render();
    expect(metric(html, 'Games played')).toBe('0');
    expect(html).toContain('No games completed yet');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
