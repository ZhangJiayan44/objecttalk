import { analyzeSession } from '@shared/analysis';
import { buildCafe } from '@shared/cafe';
import { buildTown } from '@shared/city';
import { buildScene } from '@shared/missions';
import { buildMarket } from '@shared/nightmarket';
import { createRng } from '@shared/rng';
import { freeCells } from '@shared/spatial';
import type { FindMission } from '@shared/types';

// Identical seed and scene generator to Landing.HeroScene. No replacement geometry.
export const STUDY = buildScene({ seed: 8, interests: ['space', 'animals', 'food'], difficulty: 'normal' });
export const ROCKET =
  STUDY.objects.filter((o) => o.kind === 'rocket').sort((a, b) => a.cell.c - b.cell.c)[0] ?? STUDY.objects[0];
const books = STUDY.landmarks.find((l) => l.kind === 'redBook') ?? STUDY.landmarks[0];
export const DESTINATION = freeCells(STUDY, ROCKET.id).sort(
  (a, b) => Math.hypot(a.c - books.cell.c, a.r - books.cell.r) - Math.hypot(b.c - books.cell.c, b.r - books.cell.r),
)[0];
// This native preset actually stocks two croissants for the scripted order.
export const CAFE = buildCafe(createRng(0));
export const TOWN = buildTown(createRng(13));
export const MARKET = buildMarket(createRng(12));

const mission: FindMission = {
  id: 'film-example',
  index: 0,
  type: 'find',
  targetId: ROCKET.id,
  target: { kind: 'rocket' },
  modelAnswer: 'Pick up the rocket on your left.',
  hint: 'Check whose left.',
};
// The real post-round analyzer evaluates the scripted example, rather than invented skill bars.
export const DEMO_REPORT = analyzeSession({
  level: 'study',
  durationMs: 10000,
  missionsTotal: 1,
  missions: [{ mission, scene: STUDY, startT: 0, endT: 10000, success: true, mistakes: 0 }],
  messages: [
    { id: 'film-1', t: 1000, role: 'guide', text: 'Pick up the rocket on the left.' },
    { id: 'film-2', t: 3100, role: 'builder', text: 'Do you mean my left or your left?' },
    { id: 'film-3', t: 5100, role: 'guide', text: 'Pick up the rocket on your left.' },
  ],
});
