import { ISSUE_TEXT, TIP_TEXT, type ChatRecord, type Issue, type IssueType, type SessionReport, type SkillScores, type UtteranceReview, type Verdict } from './analysis';
import { matchSpots, parseSpot, spotById, type SeekMission } from './bedroom';
import { lineText, orderSentence, parseOrder, type OrderLine, type OrderMission } from './cafe';
import { getKind, kindsFor } from './catalog';
import { estimateCefr } from './cefr';
import { parseDirections, planRoute, type Pose, type RouteMission, type Town } from './city';
import type { Role, SceneState } from './types';

/**
 * Post-game coaches for the café, the town and the bedroom. Same idea as the
 * tabletop coach (shared/analysis.ts): replay every sentence against the
 * world as it was at that moment, judge it from the listener's side, and
 * suggest a model sentence.
 */

export interface CafeRecord {
  mission: OrderMission;
  scene: SceneState;
  startT: number;
  endT: number;
  success: boolean;
  mistakes: number;
  serves: { t: number; tray: string[]; ok: boolean }[];
}

export interface CityRecord {
  mission: RouteMission;
  startPose: Pose;
  startT: number;
  endT: number;
  success: boolean;
  mistakes: number;
}

export interface BedroomRecord {
  mission: SeekMission;
  startPose: Pose;
  startT: number;
  endT: number;
  success: boolean;
  mistakes: number;
  wrongPicks: string[];
}

interface BaseInput {
  messages: ChatRecord[];
  durationMs: number;
  missionsTotal: number;
  humanRoles: Role[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const QUESTION = /\?|^(which|what|where|how|is|are|do|does|can|could|should|small or|left or|am i)\b/i;

function issue(type: IssueType): Issue {
  return { type, message: ISSUE_TEXT[type] };
}

/** Shared scoring tail: clarity, stars, tips. */
function finish(args: {
  level: string;
  skillNames: Record<keyof SkillScores, string>;
  reviews: UtteranceReview[];
  records: { success: boolean; mistakes: number; startT: number; endT: number }[];
  input: BaseInput;
  points: number;
  instructional: number;
  questions: number;
  skills: Omit<SkillScores, 'speed'>;
  goodPhrases: Set<string>;
  extraTips: string[];
}): SessionReport {
  const { records, input } = args;
  const missionsDone = records.filter((r) => r.success).length;
  const mistakes = records.reduce((s, r) => s + r.mistakes, 0);
  const outcome = input.missionsTotal ? (missionsDone / input.missionsTotal) * 100 : 0;
  const clarityRaw = args.instructional ? (args.points / args.instructional) * 100 : outcome;
  const clarity = clamp(clarityRaw - mistakes * 6 + (missionsDone === input.missionsTotal ? 5 : 0));
  const avgMs = records.length ? records.reduce((s, r) => s + (r.endT - r.startT), 0) / records.length : 60000;
  const counts = new Map<IssueType, number>();
  for (const r of args.reviews) for (const i of r.issues) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  const tips = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => TIP_TEXT[t]);
  tips.push(...args.extraTips);
  if (!tips.length) tips.push('Excellent! Try "Tricky" difficulty next time.');
  const humans = new Set(input.humanRoles);
  const stars: 1 | 2 | 3 = missionsDone === input.missionsTotal && clarity >= 75 ? 3 : missionsDone >= Math.ceil(input.missionsTotal / 2) ? 2 : 1;
  return {
    level: args.level,
    skillNames: args.skillNames,
    cefr: estimateCefr(input.messages.filter((m) => humans.has(m.role) && !m.assisted).map((m) => m.text)),
    clarity,
    stars,
    missionsDone,
    missionsTotal: input.missionsTotal,
    mistakes,
    questions: args.questions,
    durationMs: input.durationMs,
    skills: { ...args.skills, speed: clamp(100 - Math.max(0, avgMs - 20000) / 700) },
    reviews: args.reviews,
    tips: [...new Set(tips)].slice(0, 3),
    goodPhrases: [...args.goodPhrases].slice(0, 6),
  };
}

function recordAt<T extends { startT: number; endT: number }>(records: T[], t: number): T | null {
  return records.find((r) => t >= r.startT && t <= r.endT + 1500) ?? null;
}

const verdictPoints: Record<Verdict, number> = { clear: 1, ok: 0.65, unclear: 0.25, misleading: 0, chat: 0 };

// ---------------------------------------------------------------------------
// Cafe
// ---------------------------------------------------------------------------

/** "two croissant" style agreement slips. */
function pluralSlip(text: string, level: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  for (const k of kindsFor(level)) {
    const sing = k.name.toLowerCase();
    if (sing === k.plural.toLowerCase()) continue;
    if (new RegExp(`\\b(two|three|four|five|six|2|3|4|5|6) (?:small |large |big )?${sing}\\b(?!s)`).test(lower) && !lower.includes(k.plural.toLowerCase())) return true;
  }
  return false;
}

export function analyzeCafe(input: BaseInput & { records: CafeRecord[]; level?: string }): SessionReport {
  const level = input.level ?? 'cafe';
  const humans = new Set(input.humanRoles);
  const reviews: UtteranceReview[] = [];
  const good = new Set<string>();
  let points = 0;
  let instructional = 0;
  let questions = 0;
  let numbered = 0;
  let ordered = 0;
  let accurate = 0;
  let polite = 0;
  let baristaChecks = 0;
  let lastBaristaAsk = '';

  for (const msg of input.messages) {
    const rec = recordAt(input.records, msg.t);
    if (!rec) continue;
    const order = rec.mission.order;
    if (msg.role === 'builder') {
      if (QUESTION.test(msg.text.trim())) lastBaristaAsk = msg.text.toLowerCase();
      if (!humans.has('builder')) continue;
      const lower = msg.text.toLowerCase();
      const isQ = QUESTION.test(msg.text.trim());
      const readBack = parseOrder(msg.text, level).lines.length > 0;
      if (isQ || readBack) {
        questions++;
        if (/small or large|large or small|what size/.test(lower)) good.add('Small or large?');
        if (/how many/.test(lower)) good.add('How many …?');
        if (/anything else/.test(lower)) good.add('Anything else?');
        baristaChecks++;
        reviews.push({
          messageId: msg.id,
          t: msg.t,
          role: 'builder',
          text: msg.text,
          missionIndex: rec.mission.index,
          verdict: 'clear',
          issues: [],
          praise: readBack ? 'Great: reading the order back catches mistakes early.' : 'Good: asking beats guessing.',
        });
      }
      continue;
    }
    if (!humans.has('guide')) continue;
    const p = parseOrder(msg.text, level);
    const isOrder = p.lines.length > 0;
    if (!isOrder) {
      if (p.done) good.add("That's all, thanks.");
      continue;
    }
    instructional++;
    ordered++;
    const issues: Issue[] = [];
    const answeringSize = /small|large|size/.test(lastBaristaAsk);
    for (const l of p.lines) {
      if (l.negated) continue;
      const want = order.find((o) => o.kind === l.kind);
      if (!want) issues.push(issue('not-on-card'));
      else {
        if (l.qty !== null && l.qty !== want.qty) issues.push(issue('wrong-amount'));
        if (want.size && !l.size && !answeringSize) issues.push(issue('missing-size'));
        if (l.qty === null && l.plural) issues.push(issue('missing-number'));
        if (l.qty !== null || !l.plural) accurate++;
      }
      if (l.qty !== null) numbered++;
    }
    if (pluralSlip(msg.text, level)) issues.push(issue('plural'));
    if (p.polite) {
      polite++;
      const m = /\b(could i (?:have|get)|can i (?:have|get)|i'd like|i would like|may i have)\b/i.exec(msg.text);
      if (m) good.add(m[1].replace(/^./, (c) => c.toUpperCase()) + ' …');
    } else issues.push(issue('impolite'));
    const uniq = issues.filter((x, i) => issues.findIndex((y) => y.type === x.type) === i);
    const verdict: Verdict = uniq.some((i) => i.type === 'not-on-card' || i.type === 'wrong-amount')
      ? 'misleading'
      : uniq.some((i) => i.type === 'missing-number' || i.type === 'plural')
        ? 'unclear'
        : uniq.length
          ? 'ok'
          : 'clear';
    points += verdictPoints[verdict];
    reviews.push({
      messageId: msg.id,
      t: msg.t,
      role: 'guide',
      text: msg.text,
      missionIndex: rec.mission.index,
      verdict,
      issues: uniq,
      praise: verdict === 'clear' ? 'Clear, complete and polite. Exactly what the counter needs to hear!' : undefined,
      suggestion: verdict === 'clear' ? undefined : orderSentence(order),
    });
  }
  const extraTips: string[] = [];
  if (!instructional && humans.has('guide')) extraTips.push('Say your order out loud (hold Space) so the coach can check it.');
  if (humans.has('builder') && !baristaChecks) extraTips.push('Behind the counter, ask: "Small or large?", "How many?", "Anything else?"');
  return finish({
    level,
    skillNames: { spatial: 'Food words & numbers', perspective: 'Sizes & plurals', clarifying: humans.has('builder') ? 'Asking & confirming' : 'Polite requests', speed: 'Speed' },
    reviews,
    records: input.records,
    input,
    points,
    instructional,
    questions,
    skills: {
      spatial: clamp(ordered ? 40 + (numbered / Math.max(1, ordered)) * 60 : 55),
      perspective: clamp(ordered ? (accurate / Math.max(1, ordered)) * 100 - reviews.filter((r) => r.issues.some((i) => i.type === 'plural')).length * 15 : 60),
      clarifying: humans.has('builder') ? clamp(45 + baristaChecks * 15) : clamp(ordered ? 40 + (polite / ordered) * 60 : 50),
    },
    goodPhrases: good,
    extraTips,
  });
}

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------

function poseAt(trail: [number, number, number, number][], t: number, fallback: Pose): Pose {
  let best: [number, number, number, number] | null = null;
  for (const s of trail) {
    if (s[0] > t) break;
    best = s;
  }
  return best ? { x: best[1], z: best[2], yaw: best[3] } : fallback;
}

export function analyzeCity(input: BaseInput & { records: CityRecord[]; town: Town; trail: [number, number, number, number][] }): SessionReport {
  const humans = new Set(input.humanRoles);
  const reviews: UtteranceReview[] = [];
  const good = new Set<string>();
  let points = 0;
  let instructional = 0;
  let questions = 0;
  let mapWordLines = 0;
  let turnLines = 0;
  let wrongTurns = 0;
  let landmarkLines = 0;

  for (const msg of input.messages) {
    const rec = recordAt(input.records, msg.t);
    if (!rec) continue;
    const pose = poseAt(input.trail, msg.t, rec.startPose);
    if (msg.role === 'builder') {
      if (!humans.has('builder')) continue;
      const lower = msg.text.toLowerCase();
      const isQ = QUESTION.test(msg.text.trim()) || /\bexcuse me\b/.test(lower);
      const describes = /\bi (?:can )?see\b|\bi'?m (?:at|near|next to)\b/.test(lower);
      if (isQ || describes) {
        questions++;
        if (/how (?:do|can) i get to/.test(lower)) good.add('How do I get to …?');
        if (/excuse me/.test(lower)) good.add('Excuse me, …');
        if (/left or right/.test(lower)) good.add('Left or right?');
        if (describes) good.add('I can see the …');
        reviews.push({
          messageId: msg.id,
          t: msg.t,
          role: 'builder',
          text: msg.text,
          missionIndex: rec.mission.index,
          verdict: 'clear',
          issues: [],
          praise: describes ? 'Describing what you see helps the navigator find you on the map.' : 'Good: asking keeps you on track.',
        });
      }
      continue;
    }
    if (!humans.has('guide')) continue;
    const parsed = parseDirections(msg.text);
    const plan = planRoute(input.town, pose, rec.mission.destination);
    if (!parsed.steps.length && !parsed.mapWords.length) continue;
    instructional++;
    const issues: Issue[] = [];
    if (parsed.mapWords.length) {
      issues.push(issue('map-words'));
      mapWordLines++;
    }
    const firstTurn = parsed.steps.find((s) => s.type === 'turn');
    if (firstTurn && firstTurn.type === 'turn' && parsed.steps[0] === firstTurn && !firstTurn.at && !firstTurn.ordinal && plan) {
      turnLines++;
      const want = plan.firstTurn;
      if (want !== 'straight' && firstTurn.dir !== want) {
        issues.push(issue('wrong-turn'));
        wrongTurns++;
      }
    }
    if (parsed.landmarks.length || parsed.steps.some((s) => s.type === 'turn' && s.at)) {
      landmarkLines++;
      good.add('turn … at the …');
    } else if (parsed.steps.length >= 2) issues.push(issue('no-landmark'));
    if (parsed.steps.some((s) => s.type === 'side')) good.add("It's on your left/right");
    if (/\bthen\b|\bafter that\b/i.test(msg.text)) good.add('… then …');
    const verdict: Verdict = issues.some((i) => i.type === 'wrong-turn') ? 'misleading' : issues.some((i) => i.type === 'map-words') ? 'unclear' : issues.length ? 'ok' : 'clear';
    points += verdictPoints[verdict];
    reviews.push({
      messageId: msg.id,
      t: msg.t,
      role: 'guide',
      text: msg.text,
      missionIndex: rec.mission.index,
      verdict,
      issues,
      praise: verdict === 'clear' ? 'Clear directions from the walker’s point of view!' : undefined,
      suggestion: verdict === 'clear' || !plan ? undefined : plan.text,
    });
  }
  const extraTips: string[] = [];
  if (!instructional && humans.has('guide')) extraTips.push('Give directions out loud (hold Space): "Go straight, then turn left at the bank."');
  if (humans.has('builder') && !questions) extraTips.push('Walkers ask: "Excuse me, how do I get to …?" and "Left or right?"');
  return finish({
    level: 'city',
    skillNames: { spatial: 'Direction words', perspective: "Walker's point of view", clarifying: humans.has('builder') ? 'Asking the way' : 'Landmarks', speed: 'Speed' },
    reviews,
    records: input.records,
    input,
    points,
    instructional,
    questions,
    skills: {
      spatial: clamp(instructional ? 45 + (1 - mapWordLines / instructional) * 55 : 55),
      perspective: clamp(turnLines ? 100 - (wrongTurns / turnLines) * 80 : instructional ? 80 : 60),
      clarifying: humans.has('builder') ? clamp(45 + questions * 15) : clamp(instructional ? 40 + (landmarkLines / instructional) * 60 : 50),
    },
    goodPhrases: good,
    extraTips,
  });
}

// ---------------------------------------------------------------------------
// Bedroom
// ---------------------------------------------------------------------------

export function analyzeBedroom(input: BaseInput & { records: BedroomRecord[] }): SessionReport {
  const humans = new Set(input.humanRoles);
  const reviews: UtteranceReview[] = [];
  const good = new Set<string>();
  let points = 0;
  let instructional = 0;
  let questions = 0;
  let placed = 0;
  let correctPrep = 0;
  let namedThing = 0;

  for (const msg of input.messages) {
    const rec = recordAt(input.records, msg.t);
    if (!rec) continue;
    const g = parseSpot(msg.text);
    if (msg.role === 'builder') {
      if (!humans.has('builder')) continue;
      if (QUESTION.test(msg.text.trim()) || (g.furniture && /\?$/.test(msg.text.trim()))) {
        questions++;
        if (g.furniture && g.prep) good.add(`${g.prep} the …?`);
        reviews.push({
          messageId: msg.id,
          t: msg.t,
          role: 'builder',
          text: msg.text,
          missionIndex: rec.mission.index,
          verdict: 'clear',
          issues: [],
          praise: g.furniture ? 'Nice: checking a place with a question.' : 'Good: asking saves time.',
        });
      }
      continue;
    }
    if (!humans.has('guide')) continue;
    if (!g.furniture && !g.item && !g.vague) continue;
    instructional++;
    const issues: Issue[] = [];
    const spot = spotById(rec.mission.spotId)!;
    if (g.item === rec.mission.kind) namedThing++;
    if (g.furniture) {
      placed++;
      const hits = matchSpots(g);
      if (hits.some((s) => s.id === spot.id)) {
        correctPrep++;
        if (g.prep) good.add(`${g.prep} the ${spot.furniture === 'toybox' ? 'toy box' : spot.furniture}`);
      } else if (g.furniture === spot.furniture) issues.push(issue('wrong-prep'));
      else issues.push(issue('wrong-place'));
    } else if (g.vague) issues.push(issue('vague'));
    else issues.push(issue('no-anchor'));
    const verdict: Verdict = issues.some((i) => i.type === 'wrong-place' || i.type === 'wrong-prep') ? 'misleading' : issues.length ? 'unclear' : 'clear';
    points += verdictPoints[verdict];
    reviews.push({
      messageId: msg.id,
      t: msg.t,
      role: 'guide',
      text: msg.text,
      missionIndex: rec.mission.index,
      verdict,
      issues,
      praise: verdict === 'clear' ? 'Exactly the right preposition and furniture!' : undefined,
      suggestion: verdict === 'clear' ? undefined : rec.mission.modelAnswer,
    });
  }
  const extraTips: string[] = [];
  if (!instructional && humans.has('guide')) extraTips.push('Tell your friend out loud where to look: "It\'s under the bed."');
  if (humans.has('builder') && !questions) extraTips.push('Seekers check: "Is it under the bed?" "On the top shelf?"');
  return finish({
    level: 'bedroom',
    skillNames: { spatial: 'Prepositions', perspective: 'Furniture words', clarifying: humans.has('builder') ? 'Checking questions' : 'Naming the thing', speed: 'Speed' },
    reviews,
    records: input.records,
    input,
    points,
    instructional,
    questions,
    skills: {
      spatial: clamp(placed ? 30 + (correctPrep / placed) * 70 : 50),
      perspective: clamp(instructional ? 35 + (placed / instructional) * 65 : 50),
      clarifying: humans.has('builder') ? clamp(45 + questions * 15) : clamp(instructional ? 40 + Math.min(1, namedThing / Math.max(1, input.records.length)) * 60 : 50),
    },
    goodPhrases: good,
    extraTips,
  });
}

/** For the agent and tests: the canonical order sentence for a list of lines. */
export const describeOrder = (lines: OrderLine[]) => lines.map(lineText).join(', ');
export const kindLabel = (kind: string) => getKind(kind)?.name ?? kind;
