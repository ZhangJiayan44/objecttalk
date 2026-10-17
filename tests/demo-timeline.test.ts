import { describe, expect, it } from 'vitest';
import { CHAPTERS, FILM_DURATION, chapterAt, clampTime } from '../src/components/demo/timeline';

describe('promotional film timeline', () => {
  it('covers the full 48-second film without gaps or overlaps', () => {
    expect(CHAPTERS[0].start).toBe(0);
    expect(CHAPTERS.at(-1)?.end).toBe(FILM_DURATION);
    CHAPTERS.forEach((chapter, index) => {
      expect(chapter.end).toBeGreaterThan(chapter.start);
      if (index) expect(chapter.start).toBe(CHAPTERS[index - 1].end);
    });
  });
  it('switches on the precise chapter boundary, including when seeking backwards', () => {
    for (const chapter of [...CHAPTERS].reverse()) {
      expect(chapterAt(chapter.start).id).toBe(chapter.id);
      expect(chapterAt(chapter.end - 1 / 30).id).toBe(chapter.id);
    }
  });
  it('holds the final brand frame and clamps invalid transport input', () => {
    expect(chapterAt(FILM_DURATION).id).toBe('outro');
    expect(clampTime(100)).toBe(FILM_DURATION);
    expect(clampTime(-10)).toBe(0);
    expect(clampTime(Number.NaN)).toBe(0);
  });
});
