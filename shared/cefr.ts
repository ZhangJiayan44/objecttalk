/**
 * A rough, transparent CEFR estimate from a handful of spoken game sentences.
 * It is NOT a placement test: it looks at length, variety and the structures a
 * learner reaches for (linking words, polite modals, place words, questions)
 * and says which band the sentences in this round sound like, with reasons
 * and one concrete next step. The optional Claude coach can refine it.
 */

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface CefrEstimate {
  level: CefrLevel;
  /** 0-100 within the whole scale. */
  score: number;
  reasons: string[];
  next: string;
  /** How many sentences the estimate is based on. */
  sample: number;
}

const LINKERS = /\b(then|after that|and then|first|next|finally|because|so that|so|if|when|until|while|which|that's why|before|after|otherwise|instead)\b/g;
const POLITE = /\b(could|would|may|might|please|i'd like|would you mind|thank you|thanks)\b/g;
const PLACE = /\b(next to|between|behind|in front of|under|underneath|inside|on top of|opposite|near|beside|above|below|closer to|farther from|on your (?:left|right)|at the corner|straight ahead|turn (?:left|right))\b/g;
const REPAIR = /\b(i mean|sorry|actually|wait|no,? the other|let me|in other words)\b/g;
const SUBJECT_VERB = /^(?:i|you|it|they|we|he|she|this|that|there)(?:'m|'re|'s|'d|'ll)?\s+\w+/;

const NEXT: Record<CefrLevel, string> = {
  A1: 'Try full sentences: "Pick up the red mug." instead of "red mug".',
  A2: 'Join two steps with "then" or "after that", and add one place word ("next to the lamp").',
  B1: 'Add precision: "the one closest to you", "between the bank and the school", and check with a question.',
  B2: 'Vary your structures: relative clauses ("the one that…"), conditionals ("if you see…, turn…").',
  C1: 'Great range. Keep it short and listener-friendly under time pressure.',
};

export function estimateCefr(lines: string[]): CefrEstimate | null {
  const clean = lines.map((l) => l.toLowerCase().replace(/[’']/g, "'").trim()).filter((l) => l.split(/\s+/).length >= 1);
  if (clean.length < 3) return null;
  const words = clean.flatMap((l) => l.match(/[a-z']+/g) ?? []);
  if (words.length < 8) return null;
  const wpl = words.length / clean.length;
  const sample = words.slice(0, 120);
  const ttr = new Set(sample).size / sample.length;
  const count = (re: RegExp) => clean.reduce((n, l) => n + (l.match(re)?.length ?? 0), 0);
  const linkers = count(LINKERS);
  const polite = count(POLITE);
  const places = new Set(clean.flatMap((l) => l.match(PLACE) ?? [])).size;
  const repairs = count(REPAIR);
  const questions = clean.filter((l) => l.includes('?') || /^(which|what|where|how|is|are|do|does|can|could|should)\b/.test(l)).length;
  const sentences = clean.filter((l) => SUBJECT_VERB.test(l) || /^(please |could |can |put |pick |take |go |turn |look |move )/.test(l)).length / clean.length;
  const long = words.filter((w) => w.length >= 7).length / words.length;

  const score = Math.round(
    Math.min(1, wpl / 12) * 28 +
      Math.min(1, ttr / 0.75) * 14 +
      Math.min(1, places / 5) * 16 +
      Math.min(1, linkers / clean.length / 0.5) * 14 +
      Math.min(1, polite / clean.length / 0.4) * 8 +
      Math.min(1, questions / 3) * 6 +
      Math.min(1, repairs / 2) * 4 +
      sentences * 6 +
      Math.min(1, long / 0.15) * 4,
  );
  const level: CefrLevel = score < 26 ? 'A1' : score < 46 ? 'A2' : score < 66 ? 'B1' : score < 84 ? 'B2' : 'C1';
  const reasons = [`${wpl.toFixed(1)} words per sentence on average`];
  reasons.push(places ? `${places} different place/direction phrase${places > 1 ? 's' : ''}` : 'no place or direction phrases yet');
  if (linkers) reasons.push(`linked ideas ${linkers} time${linkers > 1 ? 's' : ''} (then / because / if…)`);
  if (polite) reasons.push('polite forms (could / would / please)');
  if (questions) reasons.push(`${questions} question${questions > 1 ? 's' : ''} to check understanding`);
  if (repairs) reasons.push('self-corrected when needed');
  return { level, score, reasons: reasons.slice(0, 4), next: NEXT[level], sample: clean.length };
}
