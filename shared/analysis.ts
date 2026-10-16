import { describeObject, describeCell, cap } from './reg';
import { GUIDE_VOICE } from './missions';
import { parseUtterance, type ParsedUtterance } from './nlu';
import { freeCells, readingsFor, resolvePlace, resolveRef, sceneEntities } from './spatial';
import { sameCell, type Mission, type Role, type SceneState } from './types';

/**
 * Post-game coach. Replays every instruction against the scene as it was at
 * that moment and checks it from the *listener's* side of the table:
 * does it point at exactly the target? if not, why not? and what would have
 * been a clearer way to say it?
 */

export type IssueType = 'perspective-flip' | 'unmarked-direction' | 'speaker-frame' | 'vague' | 'ambiguous' | 'misleading' | 'no-anchor';

export interface Issue {
  type: IssueType;
  message: string;
}

export type Verdict = 'clear' | 'ok' | 'unclear' | 'misleading' | 'chat';

export interface UtteranceReview {
  messageId: string;
  t: number;
  role: Role;
  text: string;
  missionIndex: number;
  verdict: Verdict;
  issues: Issue[];
  suggestion?: string;
  praise?: string;
}

export interface MissionRecord {
  mission: Mission;
  /** Scene at the moment the mission started. */
  scene: SceneState;
  startT: number;
  endT: number;
  success: boolean;
  mistakes: number;
}

export interface ChatRecord {
  id: string;
  t: number;
  role: Role;
  text: string;
}

export interface SkillScores {
  spatial: number;
  perspective: number;
  clarifying: number;
  speed: number;
}

export interface SessionReport {
  clarity: number;
  stars: 1 | 2 | 3;
  missionsDone: number;
  missionsTotal: number;
  mistakes: number;
  questions: number;
  durationMs: number;
  skills: SkillScores;
  reviews: UtteranceReview[];
  tips: string[];
  goodPhrases: string[];
}

const ISSUE_TEXT: Record<IssueType, string> = {
  'perspective-flip': 'You described it from YOUR side. Your partner faces you, so left/right and front/behind flip.',
  'unmarked-direction': 'A bare "left" or "in front of" has no owner. Say "your left" or "closer to you".',
  'speaker-frame': '"My left" is correct but makes your partner flip it in their head. "Your left" is kinder.',
  vague: 'Pointer words like "here", "there" or "that one" only work if your partner can see your finger.',
  ambiguous: 'More than one object fits that description. Add a landmark: "next to the lamp".',
  misleading: 'That description points to a different object or spot than the target.',
  'no-anchor': 'Give a landmark so your partner knows where to look.',
};

const TIP_TEXT: Record<IssueType, string> = {
  'perspective-flip': 'Before you say left/right, picture standing on your partner\'s side - or use landmarks instead.',
  'unmarked-direction': 'Always attach an owner to directions: "on YOUR left", "closer to YOU".',
  'speaker-frame': 'Switch "my left" to "your left" so your partner can act without mental rotation.',
  vague: 'Replace "here/there/this one" with object + landmark: "the mug next to the plant".',
  ambiguous: 'When there are two of something, add size, colour or a landmark to pick one out.',
  misleading: 'Double-check the landmark you mention is really next to the target before you say it.',
  'no-anchor': 'Anchor every instruction to something fixed: the lamp, the plant, or the books.',
};

function pickables(scene: SceneState) {
  return sceneEntities(scene);
}

/** Evaluate one guide instruction for a mission. */
function reviewInstruction(p: ParsedUtterance, rec: MissionRecord): Pick<UtteranceReview, 'verdict' | 'issues' | 'praise'> {
  const issues: Issue[] = [];
  const entities = pickables(rec.scene);
  const m = rec.mission;
  const add = (type: IssueType) => {
    if (!issues.some((i) => i.type === type)) issues.push({ type, message: ISSUE_TEXT[type] });
  };

  // Which description should be checked: the object for find, the destination (and object) for place.
  const checks: { kind: 'object' | 'cell'; ok: Record<Role, boolean>; count: Record<Role, number> }[] = [];
  if (p.target && (m.type === 'find' || !p.place)) {
    const ok = { guide: false, builder: false };
    const count = { guide: 0, builder: 0 };
    for (const reading of readingsFor(p.target, 'builder')) {
      const hits = resolveRef(p.target, entities, reading).filter((e) => !e.landmark);
      const wanted = m.type === 'find' ? m.targetId : m.itemId;
      ok[reading] = hits.length === 1 && hits[0].id === wanted;
      count[reading] = hits.length;
    }
    if (!p.target.rel && !p.target.sup && readingsFor(p.target, 'builder').length === 1) {
      ok.guide = ok.builder;
      count.guide = count.builder;
    }
    checks.push({ kind: 'object', ok, count });
  }
  if (p.place && m.type === 'place') {
    const ok = { guide: false, builder: false };
    const count = { guide: 0, builder: 0 };
    const cells = freeCells(rec.scene, m.itemId);
    for (const reading of readingsFor(p.place, 'builder')) {
      const hits = resolvePlace(p.place, entities, cells, reading, m.itemId);
      ok[reading] = hits.length === 1 && sameCell(hits[0], m.targetCell);
      count[reading] = hits.length;
    }
    if (p.place.rel.view !== 'unmarked') {
      ok.guide = ok.builder;
      count.guide = count.builder;
    }
    checks.push({ kind: 'cell', ok, count });
  }

  if (p.vague.length && !p.target?.kind && !p.place) add('vague');
  if (p.speakerFrame.length) add('speaker-frame');

  if (!checks.length) {
    if (p.vague.length) add('vague');
    return { verdict: issues.length ? 'unclear' : 'chat', issues };
  }

  const main = checks[checks.length - 1];
  const builderOk = checks.every((c) => c.ok.builder);
  const guideOk = checks.every((c) => c.ok.guide);

  if (builderOk) {
    if (p.unmarked.length) add('unmarked-direction');
    const verdict: Verdict = issues.some((i) => i.type === 'unmarked-direction') ? 'ok' : 'clear';
    return {
      verdict,
      issues,
      praise: verdict === 'clear' ? (p.listenerFrame.length ? 'Great: you used your partner\'s perspective.' : 'Clear and unique - nice landmark use!') : undefined,
    };
  }
  if (guideOk && p.unmarked.length) {
    add('perspective-flip');
    return { verdict: 'misleading', issues };
  }
  if (p.unmarked.length) add('unmarked-direction');
  if (main.count.builder > 1) add('ambiguous');
  else if (main.count.builder === 1) add('misleading');
  else if (!p.target?.rel && !p.place && !p.target?.sup) add('no-anchor');
  else add('misleading');
  return { verdict: issues.some((i) => i.type === 'misleading' || i.type === 'perspective-flip') ? 'misleading' : 'unclear', issues };
}

function suggestionFor(rec: MissionRecord): string {
  const m = rec.mission;
  if (m.type === 'find') {
    const best = describeObject(rec.scene, m.targetId, GUIDE_VOICE)[0];
    return best ? cap(`pick up ${best.text}.`) : m.modelAnswer;
  }
  const item = describeObject(rec.scene, m.itemId, GUIDE_VOICE)[0];
  const cell = describeCell(rec.scene, m.targetCell, m.itemId, GUIDE_VOICE)[0];
  return item && cell ? cap(`put ${item.text} ${cell.text}.`) : m.modelAnswer;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Analyse a finished run. `humanRoles` limits coaching to the human players. */
export function analyzeSession(input: { missions: MissionRecord[]; messages: ChatRecord[]; durationMs: number; missionsTotal: number; humanRoles?: Role[] }): SessionReport {
  const humans = new Set<Role>(input.humanRoles ?? ['guide', 'builder']);
  const reviews: UtteranceReview[] = [];
  const issueCounts = new Map<IssueType, number>();
  const goodPhrases = new Set<string>();
  let instructional = 0;
  let clarityPoints = 0;
  let directional = 0;
  let directionalBad = 0;
  let withAnchor = 0;
  let questions = 0;
  let clearCount = 0;

  const missionAt = (t: number) => input.missions.find((r) => t >= r.startT && t <= r.endT + 1500) ?? null;

  for (const msg of input.messages) {
    const rec = missionAt(msg.t);
    if (!rec) continue;
    if (msg.role === 'builder') {
      // Only a human builder's questions count: the AI partner's prompts are not the player's skill.
      if (!humans.has('builder')) continue;
      const p = parseUtterance(msg.text, { speaker: 'builder', listener: 'guide' });
      if (p.intent === 'question') {
        questions++;
        reviews.push({
            messageId: msg.id,
            t: msg.t,
            role: 'builder',
            text: msg.text,
            missionIndex: rec.mission.index,
            verdict: 'clear',
            issues: [],
            praise: p.question === 'frame' ? 'Perfect clarifying question - you checked whose left!' : 'Good: asking beats guessing.',
          });
      }
      continue;
    }
    if (!humans.has('guide')) continue;
    const p = parseUtterance(msg.text, GUIDE_VOICE);
    const review = reviewInstruction(p, rec);
    const isInstruction = !!(p.target || p.place) && review.verdict !== 'chat';
    if (isInstruction) {
      instructional++;
      clarityPoints += review.verdict === 'clear' ? 1 : review.verdict === 'ok' ? 0.65 : review.verdict === 'unclear' ? 0.25 : 0;
      if (review.verdict === 'clear') clearCount++;
      if (p.target?.rel || p.place) withAnchor++;
      if (p.unmarked.length || p.speakerFrame.length || p.listenerFrame.length) {
        directional++;
        if (review.issues.some((i) => i.type === 'perspective-flip' || i.type === 'unmarked-direction')) directionalBad++;
      }
      for (const phrase of p.listenerFrame) goodPhrases.add(phrase);
      if (p.place?.rel.type === 'between' || p.target?.rel?.type === 'between') goodPhrases.add('between ... and ...');
      if (p.target?.rel?.type === 'nextTo' || p.place?.rel.type === 'nextTo') goodPhrases.add('next to ...');
    }
    for (const i of review.issues) issueCounts.set(i.type, (issueCounts.get(i.type) ?? 0) + 1);
    reviews.push({
      messageId: msg.id,
      t: msg.t,
      role: 'guide',
      text: msg.text,
      missionIndex: rec.mission.index,
      ...review,
      suggestion: review.verdict === 'clear' || review.verdict === 'chat' ? undefined : suggestionFor(rec),
    });
  }

  const missionsDone = input.missions.filter((m) => m.success).length;
  const mistakes = input.missions.reduce((s, m) => s + m.mistakes, 0);
  const avgMissionMs = input.missions.length ? input.missions.reduce((s, m) => s + (m.endT - m.startT), 0) / input.missions.length : 60000;

  // With no transcript (e.g. players talked face to face without the mic) fall back to outcomes.
  const outcome = input.missionsTotal ? (missionsDone / input.missionsTotal) * 100 : 0;
  const clarityRaw = instructional ? (clarityPoints / instructional) * 100 : outcome;
  const clarity = clamp(clarityRaw - mistakes * 6 + (missionsDone === input.missionsTotal ? 5 : 0));

  const skills: SkillScores = {
    spatial: clamp(instructional ? 35 + (withAnchor / instructional) * 65 : outcome * 0.7),
    perspective: clamp(directional ? 100 - (directionalBad / directional) * 80 : instructional ? 85 : 60),
    // A human builder is scored on asking; a human guide on needing no repair (first-try clarity).
    clarifying: humans.has('builder')
      ? clamp(45 + questions * 18 - Math.max(0, mistakes - questions) * 8)
      : clamp(instructional ? 50 + (clearCount / instructional) * 50 - mistakes * 10 : 50),
    speed: clamp(100 - Math.max(0, avgMissionMs - 12000) / 600),
  };

  const tips = [...issueCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => TIP_TEXT[type]);
  if (!instructional && humans.has('guide')) tips.push('Turn on the mic (hold Space) or type your instructions so the coach can review your wording.');
  if (mistakes > questions && humans.has('builder')) tips.push('When you are not sure, ask before you grab: "Do you mean my left or your left?"');
  if (!tips.length) tips.push('Excellent teamwork! Try "Tricky" difficulty next time for perspective traps.');

  const stars: 1 | 2 | 3 = missionsDone === input.missionsTotal && clarity >= 75 ? 3 : missionsDone >= Math.ceil(input.missionsTotal / 2) ? 2 : 1;

  return {
    clarity,
    stars,
    missionsDone,
    missionsTotal: input.missionsTotal,
    mistakes,
    questions,
    durationMs: input.durationMs,
    skills,
    reviews,
    tips: tips.slice(0, 3),
    goodPhrases: [...goodPhrases].slice(0, 6),
  };
}
