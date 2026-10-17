import { CHAPTERS, FILM_DURATION } from './timeline';

// The original 48-second film keeps its own clock and every existing cue.
export const OPENING_DURATION = 5;
export const PROGRAM_DURATION = OPENING_DURATION + FILM_DURATION;
export const PROGRAM_CHAPTERS = [
  { id: 'how-it-works', start: 0, end: OPENING_DURATION, label: 'Meet ObjectTalk', caption: '' },
  ...CHAPTERS.map(c => ({ ...c, start: c.start + OPENING_DURATION, end: c.end + OPENING_DURATION })),
] as const;
export const clampProgram = (t: number) => Math.max(0, Math.min(PROGRAM_DURATION, Number.isFinite(t) ? t : 0));
export const contentTimeAt = (t: number) => Math.max(0, Math.min(FILM_DURATION, t - OPENING_DURATION));
// Music follows the whole 53-second program, including its five-second opening.
export const audioTimeAt = clampProgram;
export const programChapterAt = (t: number) => PROGRAM_CHAPTERS.find(c => clampProgram(t) < c.end) ?? PROGRAM_CHAPTERS[PROGRAM_CHAPTERS.length - 1];
