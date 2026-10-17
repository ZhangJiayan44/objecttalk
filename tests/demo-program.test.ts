import { describe, expect, it } from 'vitest';
import { CHAPTERS } from '../src/components/demo/timeline';
import { PROGRAM_CHAPTERS, PROGRAM_DURATION, OPENING_DURATION, programChapterAt, contentTimeAt, audioTimeAt } from '../src/components/demo/program';

describe('prepend-only explanatory opening', () => {
  it('adds a five-second definition without changing any original chapter cue or copy', () => {
    expect(OPENING_DURATION).toBe(5);
    expect(PROGRAM_DURATION).toBe(53);
    expect(PROGRAM_CHAPTERS[0].id).toBe('how-it-works');
    CHAPTERS.forEach((c, i) => expect(PROGRAM_CHAPTERS[i + 1]).toEqual({ ...c, start: c.start + OPENING_DURATION, end: c.end + OPENING_DURATION }));
    PROGRAM_CHAPTERS.forEach((c, i) => { if (i) expect(c.start).toBe(PROGRAM_CHAPTERS[i - 1].end); });
  });
  it('maps the appended body back to its original native, text and effect clock', () => {
    for (const t of [0, 3.2, 12.5, 28.3, 47.6, 48]) expect(contentTimeAt(t + OPENING_DURATION)).toBeCloseTo(t, 8);
    expect(contentTimeAt(0)).toBe(0);
    expect(programChapterAt(OPENING_DURATION - .01).id).toBe('how-it-works');
    expect(programChapterAt(OPENING_DURATION).id).toBe('intro');
    expect(programChapterAt(PROGRAM_DURATION).id).toBe('outro');
  });
  it('keeps music continuous across the opening boundary and throughout all 53 seconds', () => {
    expect(audioTimeAt(OPENING_DURATION - .1)).toBeCloseTo(OPENING_DURATION - .1, 8);
    expect(audioTimeAt(OPENING_DURATION)).toBe(OPENING_DURATION);
    expect(audioTimeAt(OPENING_DURATION + .1) - audioTimeAt(OPENING_DURATION - .1)).toBeCloseTo(.2, 8);
    expect(audioTimeAt(OPENING_DURATION + 28.3)).toBeCloseTo(OPENING_DURATION + 28.3, 8);
    expect(audioTimeAt(PROGRAM_DURATION)).toBe(53);
    expect(audioTimeAt(-10)).toBe(0);
    expect(audioTimeAt(PROGRAM_DURATION + 10)).toBe(PROGRAM_DURATION);
  });
});
