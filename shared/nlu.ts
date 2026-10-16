import { allKinds, LANDMARK_DEFS } from './catalog';
import type { ColorName, PlaceDesc, RefDesc, RelType, Role, SuperlativeType, ViewSpec } from './types';

/**
 * Rule-based English understanding for spatial instructions. It turns
 * "put the small rocket behind the red book, closer to you" into a
 * structured RefDesc / PlaceDesc and records *how* the speaker talked
 * (unmarked "left", vague "over there", ...) for the post-game coach.
 * No network, no model: deterministic and instant, so the game works offline.
 * The study rule brain, the LLM agent's guardrail (vetSay) and the coach all
 * read sentences through it.
 */

export type Intent = 'pick' | 'place' | 'question' | 'confirm' | 'deny' | 'other';
export type QuestionType = 'which' | 'frame' | 'where' | 'repeat' | 'check' | 'other';

export interface ParsedUtterance {
  text: string;
  intent: Intent;
  question?: QuestionType;
  target?: RefDesc;
  place?: PlaceDesc;
  /** Directions used without an owner ("left", "in front of"): ambiguous across the table. */
  unmarked: string[];
  /** Directions the speaker anchored to themselves ("my left"). */
  speakerFrame: string[];
  /** Directions anchored to the listener ("your left") - the clearest form. */
  listenerFrame: string[];
  /** Pointer words that only work if you can see the speaker's finger. */
  vague: string[];
  /** Kinds mentioned anywhere, in order. */
  mentions: string[];
}

interface Ctx {
  speaker: Role;
  listener: Role;
}

const COLORS: Record<string, ColorName> = {
  red: 'red',
  blue: 'blue',
  yellow: 'yellow',
  green: 'green',
  pink: 'pink',
  purple: 'purple',
  violet: 'purple',
  lilac: 'purple',
  lavender: 'purple',
  orange: 'orange',
  white: 'white',
  brown: 'brown',
};
const SIZES: Record<string, 'small' | 'big'> = {
  small: 'small',
  smaller: 'small',
  smallest: 'small',
  little: 'small',
  tiny: 'small',
  mini: 'small',
  big: 'big',
  bigger: 'big',
  biggest: 'big',
  large: 'big',
  larger: 'big',
  largest: 'big',
  huge: 'big',
  giant: 'big',
};
const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'other', 'another', 'same', 'my', 'your']);
const PICK_VERBS = new Set(['pick', 'grab', 'take', 'get', 'find', 'choose', 'select', 'touch', 'lift', 'click', 'hold', 'tap', 'catch', 'collect']);
const PLACE_VERBS = new Set(['put', 'place', 'move', 'set', 'drop', 'bring', 'leave', 'stand', 'slide', 'push', 'shift', 'carry', 'lay']);

type Token =
  | { t: 'word'; w: string }
  | { t: 'rel'; rel: RelType; view: ViewSpec; raw: string }
  | { t: 'sup'; sup: SuperlativeType; view: ViewSpec; raw: string }
  | { t: 'frame'; view: Role; dir?: 'left' | 'right'; raw: string }
  | { t: 'sep' };

interface Lexeme {
  words: string[];
  kind: string;
}

let lexiconCache: { key: string; list: Lexeme[] } | null = null;

/** Longest-first phrase lexicon from the live catalog (so generated items are understood too). */
function lexicon(): Lexeme[] {
  const kinds = allKinds();
  const key = kinds.map((k) => k.id).join('|');
  if (lexiconCache?.key === key) return lexiconCache.list;
  const list: Lexeme[] = [];
  for (const k of kinds) for (const s of new Set([...k.synonyms, k.name, k.plural])) list.push({ words: s.split(' '), kind: k.id });
  for (const [kind, def] of Object.entries(LANDMARK_DEFS)) for (const s of def.synonyms) list.push({ words: s.split(' '), kind });
  for (const s of ['book', 'books']) list.push({ words: [s], kind: 'book' });
  list.sort((a, b) => b.words.length - a.words.length);
  lexiconCache = { key, list };
  return list;
}

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[’`]/g, "'")} `
    .replace(/\b(it|that|what|where|there|here|who|let)'s\b/g, '$1 is')
    .replace(/\b(\w+)n't\b/g, '$1 not')
    .replace(/\b(you|we|they)'re\b/g, '$1 are')
    .replace(/\bi'm\b/g, 'i am')
    .replace(/[^a-z0-9?,.' ]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const ownerOf = (word: string, ctx: Ctx): Role => (word === 'your' || word === 'you' ? ctx.listener : ctx.speaker);

/**
 * Replace multi-word spatial phrases with structured tokens. Order matters:
 * frame-marked forms first, then relations, then bare superlatives, so that
 * "right next to" never reads as "right" and "close to you" never reads as "near".
 */
function tokenize(text: string, ctx: Ctx, notes: Pick<ParsedUtterance, 'unmarked' | 'speakerFrame' | 'listenerFrame'>): Token[] {
  const out: Token[] = [];
  const rules: { re: RegExp; make: (m: RegExpExecArray) => Token }[] = [
    {
      re: /^(?:the )?(?:closest|nearest|closer|nearer) to (you|me)\b/,
      make: (m) => ({ t: 'sup', sup: 'nearest', view: ownerOf(m[1], ctx), raw: m[0] }),
    },
    {
      re: /^(?:the )?(?:farthest|furthest|farther|further)(?: away)? from (you|me)\b/,
      make: (m) => ({ t: 'sup', sup: 'farthest', view: ownerOf(m[1], ctx), raw: m[0] }),
    },
    { re: /^(?:far|away) from (you|me)\b/, make: (m) => ({ t: 'sup', sup: 'farthest', view: ownerOf(m[1], ctx), raw: m[0] }) },
    { re: /^(?:close to|near|next to|by) (you|me)\b/, make: (m) => ({ t: 'sup', sup: 'nearest', view: ownerOf(m[1], ctx), raw: m[0] }) },
    { re: /^on (your|my) side(?: of the table)?\b/, make: (m) => ({ t: 'sup', sup: 'nearest', view: ownerOf(m[1], ctx), raw: m[0] }) },
    {
      re: /^from (your|my) (?:side|view|point of view|perspective|position|angle)\b/,
      make: (m) => ({ t: 'frame', view: ownerOf(m[1], ctx), raw: m[0] }),
    },
    {
      re: /^(?:from where|where) (you|i) (?:are|am|stand|standing|sit|sitting)\b/,
      make: (m) => ({ t: 'frame', view: m[1] === 'you' ? ctx.listener : ctx.speaker, raw: m[0] }),
    },
    {
      re: /^(?:to|on) (your|my) (left|right)(?: hand)?(?: side)? of\b/,
      make: (m) => ({ t: 'rel', rel: m[2] === 'left' ? 'leftOf' : 'rightOf', view: ownerOf(m[1], ctx), raw: m[0] }),
    },
    {
      re: /^(?:(?:just|directly) )?(?:to|on|at) the (left|right)(?: hand)?(?: side)? of\b/,
      make: (m) => ({ t: 'rel', rel: m[1] === 'left' ? 'leftOf' : 'rightOf', view: 'unmarked', raw: m[0] }),
    },
    { re: /^(left|right) of\b/, make: (m) => ({ t: 'rel', rel: m[1] === 'left' ? 'leftOf' : 'rightOf', view: 'unmarked', raw: m[0] }) },
    { re: /^(?:(?:just|right|directly) )?in front of\b/, make: (m) => ({ t: 'rel', rel: 'inFrontOf', view: 'unmarked', raw: m[0] }) },
    {
      re: /^(?:(?:just|right|directly) )?(?:behind|in back of|at the back of|back of)\b/,
      make: (m) => ({ t: 'rel', rel: 'behind', view: 'unmarked', raw: m[0] }),
    },
    {
      re: /^(?:right next to|next to|beside|besides|alongside|by the side of|right by|right beside|by)\b/,
      make: (m) => ({ t: 'rel', rel: 'nextTo', view: 'none', raw: m[0] }),
    },
    { re: /^(?:in between|between)\b/, make: (m) => ({ t: 'rel', rel: 'between', view: 'none', raw: m[0] }) },
    { re: /^(?:on|to) (your|my) (left|right)(?: hand)?(?: side)?\b/, make: (m) => ({ t: 'sup', sup: m[2] === 'left' ? 'leftmost' : 'rightmost', view: ownerOf(m[1], ctx), raw: m[0] }) },
    { re: /^(your|my) (left|right)\b/, make: (m) => ({ t: 'frame', view: ownerOf(m[1], ctx), dir: m[2] as 'left' | 'right', raw: m[0] }) },
    { re: /^(?:on|to|at) the (left|right)(?: side)?\b/, make: (m) => ({ t: 'sup', sup: m[1] === 'left' ? 'leftmost' : 'rightmost', view: 'unmarked', raw: m[0] }) },
    { re: /^at the front\b/, make: (m) => ({ t: 'sup', sup: 'nearest', view: 'unmarked', raw: m[0] }) },
    { re: /^at the back\b/, make: (m) => ({ t: 'sup', sup: 'farthest', view: 'unmarked', raw: m[0] }) },
    { re: /^(left|right)(?:most)?\b/, make: (m) => ({ t: 'sup', sup: m[1] === 'left' ? 'leftmost' : 'rightmost', view: 'unmarked', raw: m[0] }) },
    // Last: "on"/"near" only count as a relation when an object follows ("on the plant" ~ near it).
    {
      re: /^(?:near|close to|close by|nearby|around|on top of|on)\b(?= the| a| that| this)/,
      make: (m) => ({ t: 'rel', rel: 'near', view: 'none', raw: m[0] }),
    },
  ];

  let rest = text.trim();
  while (rest.length) {
    if (rest[0] === ',' || rest[0] === '.' || rest[0] === '?') {
      out.push({ t: 'sep' });
      rest = rest.slice(1).trimStart();
      continue;
    }
    let matched = false;
    for (const rule of rules) {
      const m = rule.re.exec(rest);
      if (m) {
        const tok = rule.make(m);
        out.push(tok);
        if (tok.t === 'rel' || tok.t === 'sup') {
          if (tok.view === 'unmarked') notes.unmarked.push(tok.raw);
          else if (tok.view === ctx.speaker) notes.speakerFrame.push(tok.raw);
          else if (tok.view === ctx.listener) notes.listenerFrame.push(tok.raw);
        } else if (tok.t === 'frame') {
          (tok.view === ctx.speaker ? notes.speakerFrame : notes.listenerFrame).push(tok.raw);
        }
        rest = rest.slice(m[0].length).trimStart();
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const m = /^[^ ,.?]+/.exec(rest);
    const w = m ? m[0] : rest[0];
    out.push({ t: 'word', w });
    rest = rest.slice(w.length).trimStart();
  }
  return out;
}

interface NP {
  start: number;
  end: number;
  desc: RefDesc;
}

/** Find a noun phrase starting at token i (determiners + size/colour + kind, or a pointer word). */
function readNP(tokens: Token[], i: number): NP | null {
  let j = i;
  const desc: RefDesc = {};
  let sawDet = false;
  const word = (k: number) => {
    const t = tokens[k];
    return t && t.t === 'word' ? t.w : undefined;
  };
  while (word(j) && DETERMINERS.has(word(j)!)) {
    sawDet = true;
    j++;
  }
  let mods = 0;
  while (word(j) && (COLORS[word(j)!] || SIZES[word(j)!])) {
    const w = word(j)!;
    if (COLORS[w]) desc.color = COLORS[w];
    else desc.size = SIZES[w];
    j++;
    mods++;
  }
  for (const lex of lexicon()) {
    if (lex.words.every((w, k) => word(j + k) === w)) {
      desc.kind = lex.kind;
      j += lex.words.length;
      if (desc.kind === 'book' && desc.color === 'red') desc.kind = 'redBook';
      if (desc.kind === 'book' && desc.color === 'blue') desc.kind = 'blueBook';
      if (desc.kind === 'redBook' || desc.kind === 'blueBook') delete desc.color;
      return { start: i, end: j, desc };
    }
  }
  if (word(j) === 'one' || word(j) === 'ones') return { start: i, end: j + 1, desc: { ...desc, deictic: !mods } };
  if (mods > 0) return { start: i, end: j, desc };
  if (!sawDet && (word(i) === 'it' || word(i) === 'them')) return { start: i, end: i + 1, desc: { deictic: true } };
  if (sawDet && j > i && (word(i) === 'this' || word(i) === 'that')) return { start: i, end: j, desc: { deictic: true } };
  return null;
}

const VAGUE_PATTERNS: [RegExp, string][] = [
  [/\b(?:over )?there\b/, 'there'],
  [/\b(?:right )?here\b/, 'here'],
  [/\b(?:this|that) one\b/, 'this/that one'],
  [/\b(?:a (?:little )?bit|slightly|somewhere|kind of|sort of)\b/, 'a bit / somewhere'],
  [/\b(?:thing|thingy|stuff)\b/, 'thing'],
];

/** Parse an utterance said by `ctx.speaker` to `ctx.listener`. */
/** Openers that carry no instruction ("Okay!", "Here we go!", "Ready?") and would otherwise look like questions. */
const OPENER = /^\s*(?:ok(?:ay)?|alright|all right|here we go|ready|great|cool|so|well|now|right|let'?s go|next one|no problem|no worries)\s*[,.!?]+\s+(?=\S)/i;

export function parseUtterance(raw: string, ctx: Ctx): ParsedUtterance {
  let body = raw;
  while (OPENER.test(body)) body = body.replace(OPENER, '');
  const text = normalize(body);
  const result: ParsedUtterance = { text: raw, intent: 'other', unmarked: [], speakerFrame: [], listenerFrame: [], vague: [], mentions: [] };

  for (const [re, label] of VAGUE_PATTERNS) if (re.test(text)) result.vague.push(label);

  const trimmed = text.trim();
  if (/^(?:yes|yeah|yep|yup|correct|exactly|perfect|great|good|right|that is it|that is the one|bingo|ok that one|nice)\b(?!.* (?:of|next|side|left))/.test(trimmed) && trimmed.split(' ').length <= 5) {
    result.intent = 'confirm';
  } else if (/^(?:no(?! problem| worries)|nope|not that|not this|wrong|the other one|other one|not quite)\b/.test(trimmed)) {
    result.intent = 'deny';
  }

  const tokens = tokenize(text, ctx, result);
  const words = tokens.filter((t): t is Extract<Token, { t: 'word' }> => t.t === 'word').map((t) => t.w);
  const hasPlaceVerb = words.some((w) => PLACE_VERBS.has(w));
  const hasPickVerb = words.some((w) => PICK_VERBS.has(w));
  // Only the last sentence decides: "Ready? Pick up the mug." is an instruction, not a question.
  const lastSentence = trimmed.split(/(?<=[.?])\s+/).filter(Boolean).pop() ?? trimmed;
  const isQuestion =
    lastSentence.includes('?') ||
    /^(?:which|what|where|who|how|is it|is this|is that|do you|did you|can you|could you|should i|my left|your left|my right|your right|this one|that one)\b/.test(lastSentence) ||
    /^here\??$/.test(lastSentence);

  // Collect NPs and attach relations / superlatives / frame markers.
  const nps: NP[] = [];
  for (let i = 0; i < tokens.length; ) {
    const np = readNP(tokens, i);
    if (np && np.end > np.start) {
      nps.push(np);
      if (np.desc.kind) result.mentions.push(np.desc.kind);
      i = np.end;
    } else i++;
  }

  // Walk tokens to build: subject (+sup/rel) and destination relation.
  let subject: RefDesc | undefined;
  let subjectEnd = -1;
  let dest: PlaceDesc | undefined;
  let lastRel: { rel: PlaceDesc['rel']; raw: string } | undefined;
  const unmark = (raw: string) => {
    const at = result.unmarked.indexOf(raw);
    if (at >= 0) result.unmarked.splice(at, 1);
  };
  const npAt = (i: number) => nps.find((n) => n.start === i);
  const verbIndex = tokens.findIndex((t) => t.t === 'word' && PLACE_VERBS.has(t.w));

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const np = npAt(i);
    if (np && !subject) {
      subject = { ...np.desc };
      subjectEnd = np.end;
      i = np.end - 1;
      continue;
    }
    if (tok.t === 'rel') {
      const refs: RefDesc[] = [];
      let k = i + 1;
      const first = npAt(k) ?? (tokens[k]?.t === 'word' && DETERMINERS.has((tokens[k] as { w: string }).w) ? npAt(k) : undefined);
      if (first) {
        refs.push(first.desc);
        k = first.end;
        if (tok.rel === 'between') {
          if (tokens[k]?.t === 'word' && (tokens[k] as { w: string }).w === 'and') k++;
          const second = npAt(k);
          if (second) {
            refs.push(second.desc);
            k = second.end;
          }
        }
      }
      if (!refs.length) continue;
      // A trailing superlative right after a ref describes the ref ("the rocket on your left").
      const after = tokens[k];
      if (after?.t === 'sup' && refs.length === 1 && refs[0].kind) {
        refs[0] = { ...refs[0], sup: { type: after.sup, view: after.view } };
        k++;
      }
      const rel = { type: tok.rel, view: tok.view, refs };
      // Destination if the speaker used a placing verb before this relation; otherwise it modifies the subject.
      const isDest = hasPlaceVerb && (verbIndex < i || !subject) && !dest;
      if (isDest) {
        dest = { rel };
        lastRel = { rel: dest.rel, raw: tok.raw };
      } else if (subject && !subject.rel) {
        subject.rel = rel;
        lastRel = { rel: subject.rel, raw: tok.raw };
      } else if (!dest) {
        dest = { rel };
        lastRel = { rel: dest.rel, raw: tok.raw };
      }
      i = k - 1;
      continue;
    }
    if (tok.t === 'frame') {
      // "(your left)" / "from my side" pins down the most recent unmarked direction.
      if (lastRel && lastRel.rel.view === 'unmarked') {
        lastRel.rel.view = tok.view;
        unmark(lastRel.raw);
      } else if (subject?.sup && subject.sup.view === 'unmarked') {
        subject.sup.view = tok.view;
        result.unmarked.pop();
      } else if (tok.dir && subject && !subject.sup) {
        subject.sup = { type: tok.dir === 'left' ? 'leftmost' : 'rightmost', view: tok.view };
      }
      continue;
    }
    if (tok.t === 'sup') {
      // "in front of the lamp, closer to you" turns an unmarked front/behind into an explicit one.
      if (lastRel && (lastRel.rel.type === 'inFrontOf' || lastRel.rel.type === 'behind') && lastRel.rel.view === 'unmarked' && (tok.sup === 'nearest' || tok.sup === 'farthest') && tok.view !== 'unmarked') {
        lastRel.rel.type = tok.sup === 'nearest' ? 'inFrontOf' : 'behind';
        lastRel.rel.view = tok.view;
        unmark(lastRel.raw);
        // The marker itself was logged as a frame-marked superlative; it is a clarifier here.
        continue;
      }
      if (subject && !subject.sup && (i >= subjectEnd || !dest)) subject.sup = { type: tok.sup, view: tok.view };
      else if (!subject) subject = { sup: { type: tok.sup, view: tok.view } };
    }
  }

  result.target = subject;
  result.place = dest;
  if (result.intent === 'confirm' || result.intent === 'deny') return result;
  if (isQuestion) {
    result.intent = 'question';
    if (/\b(?:my|your) (?:left|right|front|in front|behind|back|side)\b.*\bor\b|\bwhose\b|\bor (?:yours|mine)\b|\bfrom (?:your|my) (?:side|view)\b.*\?/.test(text)) result.question = 'frame';
    else if (/\bwhich\b/.test(text)) result.question = 'which';
    else if (/\bwhere\b/.test(text)) result.question = 'where';
    else if (/\b(?:again|repeat|sorry|pardon|what did you say|say that)\b/.test(text)) result.question = 'repeat';
    else if (/\b(?:this|that|here|it)\b/.test(text)) result.question = 'check';
    else result.question = 'other';
    return result;
  }
  if (hasPlaceVerb || (dest && !hasPickVerb)) result.intent = 'place';
  else if (hasPickVerb || subject) result.intent = subject ? 'pick' : 'other';
  if (hasPickVerb && hasPlaceVerb) result.intent = 'place';
  return result;
}
