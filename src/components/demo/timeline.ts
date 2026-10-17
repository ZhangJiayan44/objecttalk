/** One clock drives playback, camera moves, captions and frame-by-frame export. */
export const FILM_DURATION = 48;
export const CHAPTERS = [
  { id: 'intro', start: 0, end: 5, label: 'English, in play.', caption: 'Less memorizing. More living.' },
  {
    id: 'partners',
    start: 5,
    end: 10,
    label: 'Two perspectives',
    caption: 'One sees the goal. One moves the objects. You need each other.',
  },
  {
    id: 'play',
    start: 10,
    end: 19,
    label: 'Say it. Try it.',
    caption: 'Look around. Get specific. Click to make it happen.',
  },
  {
    id: 'worlds',
    start: 19,
    end: 35,
    label: 'Everyday adventures',
    caption: 'Find your words in worlds worth talking about.',
  },
  {
    id: 'coach',
    start: 35,
    end: 43,
    label: 'A little better, together',
    caption: 'Turn a misunderstanding into your next breakthrough.',
  },
  { id: 'outro', start: 43, end: 48, label: 'Let’s play', caption: 'Say it clearly, so your teammate can win.' },
] as const;
export type ChapterId = (typeof CHAPTERS)[number]['id'];
export const clampTime = (t: number) => Math.max(0, Math.min(FILM_DURATION, Number.isFinite(t) ? t : 0));
export const chapterAt = (t: number) => CHAPTERS.find((c) => clampTime(t) < c.end) ?? CHAPTERS[CHAPTERS.length - 1];
export const progress = (t: number, start: number, duration: number) =>
  Math.max(0, Math.min(1, (t - start) / duration));
export const ease = (n: number) => {
  const p = Math.max(0, Math.min(1, n));
  return 1 - Math.pow(1 - p, 3);
};
export const enter = (t: number, start = 0, duration = 0.65) => ({
  opacity: progress(t, start, duration),
  transform: `translateY(${(1 - ease(progress(t, start, duration))) * 42}px)`,
});

export const ACTION = { pick: 15.05, move: 15.2, moveDuration: 1.15, drop: 16.45, success: 16.65 } as const;
