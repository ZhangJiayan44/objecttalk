import { allKinds } from './catalog';

/**
 * The "Chinese lifeline" (中文求助). Learners sometimes simply do not know a
 * word, and pushing them to "just say it in English" leaves them stuck in
 * silence. So a player may say or type the idea in Chinese: the game quietly
 * hands back an English sentence, privately, and the player says it out loud
 * themselves. Nothing Chinese ever reaches the partner, the lifeline costs a
 * few points, and the post-game report lists the borrowed phrases so the
 * player learns them (they also go into the word book for review).
 */

export interface Lifeline {
  /** ms since the run started. */
  t: number;
  zh: string;
  en: string;
  /** Where the English came from. */
  source: 'llm' | 'glossary';
  /** The player then said the English (or something close to it) to the partner. */
  used: boolean;
}

/** Score points a lifeline costs (the first one is free: asking for help is a skill too). */
export const LIFELINE_COST = 4;
export const FREE_LIFELINES = 1;
export const MAX_LIFELINES = 8;

/** Contains Chinese characters (CJK Unified Ideographs + Extension A). */
export const hasChinese = (text: string) => /[㐀-䶿一-鿿]/.test(text);

export function lifelinePenalty(count: number): number {
  return Math.max(0, count - FREE_LIFELINES) * LIFELINE_COST;
}

/**
 * Everyday words the offline glossary knows, for when no LLM is configured.
 * Item names come from the catalog (`zh` on each kind); these cover the glue
 * words players most often get stuck on.
 */
const PHRASES: [RegExp, string][] = [
  [/左边|左/, 'on your left'],
  [/右边|右/, 'on your right'],
  [/前面|前边/, 'in front of'],
  [/后面|后边/, 'behind'],
  [/中间|之间/, 'between'],
  [/旁边|边上/, 'next to'],
  [/上面|上边/, 'on top of'],
  [/下面|下边|底下/, 'under'],
  [/里面|里边/, 'inside'],
  [/离你近|靠近你/, 'closer to you'],
  [/离你远|远离你/, 'farther from you'],
  [/直走|一直走/, 'go straight'],
  [/左转|向左拐|左拐/, 'turn left'],
  [/右转|向右拐|右拐/, 'turn right'],
  [/路口/, 'at the corner'],
  [/大杯|大的/, 'a large one'],
  [/小杯|小的/, 'a small one'],
  [/就这些|没了|够了/, "that's all, thanks"],
  [/再说一遍|再说一次|没听清/, 'can you say that again, please?'],
  [/哪一个|哪个/, 'which one?'],
  [/是这个吗/, 'is it this one?'],
  [/谢谢/, 'thank you'],
  [/对不起|不好意思/, 'sorry'],
  [/不是这个|不对/, 'no, not that one'],
  [/对|是的/, 'yes, that one'],
  [/我想要|我要|给我/, 'could I have'],
  [/多少/, 'how many'],
];

const NUMBERS: [RegExp, string][] = [
  [/一(个|份|杯|碗|串|块)?/, 'one'],
  [/两|二/, 'two'],
  [/三/, 'three'],
  [/四/, 'four'],
];

/** Best-effort offline translation: item names + glue phrases, in the order they appear. */
export function glossaryTranslate(zh: string): string | null {
  const hits: { at: number; en: string }[] = [];
  const kinds = allKinds().filter((k) => k.zh);
  for (const k of kinds)
    for (const w of k.zh!.split('/')) {
      const at = zh.indexOf(w);
      if (w && at >= 0) {
        hits.push({ at, en: k.name });
        break;
      }
    }
  for (const [re, en] of PHRASES) {
    const m = re.exec(zh);
    if (m && !hits.some((h) => h.at <= m.index && m.index < h.at + 2)) hits.push({ at: m.index, en });
  }
  const num = NUMBERS.find(([re]) => re.test(zh));
  if (!hits.length) return null;
  const words = hits.sort((a, b) => a.at - b.at).map((h) => h.en);
  const out = (num && !words.some((w) => /\bone\b/.test(w)) ? [num[1], ...words] : words).join(' ');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Did the player go on to say the English they were given? (loose: most content words appear) */
export function saidLifeline(en: string, said: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  const want = [...words(en)].filter((w) => !['the', 'and', 'please', 'could', 'have', 'your', 'you'].includes(w));
  if (!want.length) return false;
  const got = words(said);
  return want.filter((w) => got.has(w)).length / want.length >= 0.6;
}
