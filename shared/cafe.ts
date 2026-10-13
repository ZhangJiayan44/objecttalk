import { getKind, kindsFor } from './catalog';
import type { Rng } from './rng';
import type { Cell, Difficulty, SceneObject, SceneState, SizeName } from './types';

/**
 * Corner Café: the customer (guide) holds an order card, the barista
 * (builder) fills a tray from the display case. The English practised is
 * ordering: numbers, plurals, sizes and polite requests.
 *
 * Case layout (COLS x ROWS cells): r=0 top glass shelf, r=1 bottom glass
 * shelf, r=2 the counter top where drinks stand.
 */

export const CAFE_COLS = 5;
export const CAFE_ROWS = 3;
export const TRAY_SLOTS = 6;

export interface OrderLine {
  kind: string;
  /** Only for drinks (`sized` kinds); food is always regular. */
  size: Exclude<SizeName, 'regular'> | null;
  qty: number;
}

export interface CafeState {
  scene: SceneState;
  tray: string[];
}

export interface OrderMission {
  id: string;
  index: number;
  type: 'order';
  order: OrderLine[];
  modelAnswer: string;
  hint: string;
}

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

export const sizeWord = (s: OrderLine['size']) => (s === 'big' ? 'large' : s === 'small' ? 'small' : '');

/** "a large coffee", "two croissants", "a slice of pizza", "three slices of cake". */
export function lineText(l: OrderLine): string {
  const k = getKind(l.kind);
  const name = l.qty === 1 ? (k?.name ?? l.kind) : (k?.plural ?? `${l.kind}s`);
  const size = sizeWord(l.size);
  const count = l.qty === 1 ? (/^[aeiou]/.test(size || name) ? 'an' : 'a') : NUM_WORDS[l.qty] ?? String(l.qty);
  return [count, size, name].filter(Boolean).join(' ');
}

export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A natural, polite order sentence. */
export function orderSentence(lines: OrderLine[], rng?: Rng): string {
  const body = joinList(lines.map(lineText));
  const openers = ['Could I have', 'Can I get', "I'd like", 'Could I get'];
  const opener = rng ? rng.pick(openers) : openers[0];
  return opener === "I'd like" ? `Hi! I'd like ${body}, please.` : `Hi! ${opener} ${body}, please?`;
}

export const lineKey = (l: Pick<OrderLine, 'kind' | 'size'>) => `${l.kind}|${l.size ?? ''}`;
export const objectKey = (o: Pick<SceneObject, 'kind' | 'size'>) => `${o.kind}|${o.size === 'regular' ? '' : o.size}`;

/** Fill the display case: food on the glass shelves, drinks (small + large) on the counter. */
/** `specials`: the player's own Rodin objects (Object Studio), sold as today's special. */
export function buildCafe(rng: Rng, level = 'cafe', specials: string[] = []): CafeState {
  const menu = kindsFor(level);
  const drinks = menu.filter((k) => k.sized);
  const own = specials.map((id) => getKind(id)).filter((k): k is NonNullable<typeof k> => !!k && !k.sized).slice(0, 2);
  const food = [...own, ...rng.shuffle(menu.filter((k) => !k.sized))].slice(0, 6);
  const objects: SceneObject[] = [];
  let n = 0;
  const add = (kind: string, size: SizeName, cell: Cell) => objects.push({ id: `c${++n}`, kind, size, color: getKind(kind)?.baseColor ?? 'white', cell, yaw: (rng.next() - 0.5) * 0.8 });
  // Shelves: 6 food kinds, with 1-3 copies each, over 10 shelf cells.
  const shelfCells = rng.shuffle(Array.from({ length: CAFE_COLS * 2 }, (_, i) => ({ c: i % CAFE_COLS, r: Math.floor(i / CAFE_COLS) })));
  const copies = [2, 2, 2, 1, 1, 1];
  let i = 0;
  food.forEach((k, idx) => {
    for (let c = 0; c < copies[idx] && i < shelfCells.length; c++) add(k.id, 'regular', shelfCells[i++]);
  });
  // Counter: small and large of each drink.
  const counterCells = rng.shuffle(Array.from({ length: CAFE_COLS }, (_, c) => ({ c, r: 2 })));
  let j = 0;
  for (const d of drinks) for (const size of ['small', 'big'] as const) if (j < counterCells.length) add(d.id, size, counterCells[j++]);
  return { scene: { layoutId: 'cafe', objects, landmarks: [] }, tray: [] };
}

/** How many of each kind+size are available on the shelves (not on the tray). */
function stock(state: CafeState) {
  const m = new Map<string, number>();
  for (const o of state.scene.objects) if (!state.tray.includes(o.id)) m.set(objectKey(o), (m.get(objectKey(o)) ?? 0) + 1);
  return m;
}

/** An order the case can actually serve. Harder levels: more lines, bigger numbers, sizes. */
export function generateOrder(state: CafeState, difficulty: Difficulty, rng: Rng, first: string[] = [], quest = 'mixed'): OrderLine[] {
  const avail = stock(state);
  // Today's special (a player-made object) comes first, then the rest in random order.
  const keys = [...first.map((k) => `${k}|`).filter((k) => avail.has(k)), ...rng.shuffle([...avail.keys()].filter((k) => !first.includes(k.split('|')[0])))];
  const nLines = quest === 'party' ? 2 : difficulty === 'easy' ? 2 : difficulty === 'normal' ? 2 + Number(rng.chance(0.4)) : 3;
  const lines: OrderLine[] = [];
  const usedKinds = new Set<string>();
  // Make sure normal/tricky orders include a sized drink, so "small or large?" matters.
  const drinkFirst = difficulty !== 'easy' || quest === 'drinks' ? keys.filter((k) => k.split('|')[1]) : [];
  let items = 0;
  for (const key of [...drinkFirst.slice(0, 1), ...keys]) {
    if (lines.length >= nLines) break;
    const [kind, size] = key.split('|');
    if (usedKinds.has(kind)) continue;
    // Everything must fit on the tray, leaving one slot per line still to come.
    const room = TRAY_SLOTS - items - (nLines - lines.length - 1);
    const cap = quest === 'party' ? (difficulty === 'easy' ? 2 : 3) : difficulty === 'easy' ? 1 : difficulty === 'normal' ? 2 : 3;
    const max = Math.min(avail.get(key) ?? 0, cap, room);
    if (max < 1) continue;
    usedKinds.add(kind);
    // A party order asks for at least two of each thing it can.
    const qty = quest === 'party' && max >= 2 ? 2 + rng.int(max - 1) : 1 + rng.int(max);
    items += qty;
    lines.push({ kind, size: (size || null) as OrderLine['size'], qty });
  }
  return lines;
}

export function generateOrderMission(state: CafeState, index: number, difficulty: Difficulty, rng: Rng, specials: string[] = [], quest = 'mixed'): OrderMission | null {
  const order = generateOrder(state, difficulty, rng, index === 0 ? specials : [], quest);
  if (!order.length) return null;
  const sizedLine = order.find((l) => l.size);
  const manyLine = order.find((l) => l.qty > 1);
  const hint = sizedLine
    ? `${getKind(sizedLine.kind)?.name ?? 'That'} comes in two sizes: say "a small …" or "a large …" before it.`
    : manyLine
      ? `Say the number first and use the plural: "${lineText(manyLine)}".`
      : 'Start politely: "Could I have …, please?"';
  return { id: `m${index + 1}`, index, type: 'order', order, modelAnswer: orderSentence(order), hint };
}

/** Compare tray contents with the order. */
export function trayStatus(state: CafeState, order: OrderLine[]) {
  const want = new Map(order.map((l) => [lineKey(l), l.qty]));
  const have = new Map<string, number>();
  const extra: string[] = [];
  for (const id of state.tray) {
    const o = state.scene.objects.find((x) => x.id === id);
    if (!o) continue;
    const key = objectKey(o);
    const n = (have.get(key) ?? 0) + 1;
    have.set(key, n);
    if (n > (want.get(key) ?? 0)) extra.push(id);
  }
  const missing: OrderLine[] = [];
  for (const l of order) {
    const got = have.get(lineKey(l)) ?? 0;
    if (got < l.qty) missing.push({ ...l, qty: l.qty - got });
  }
  return { complete: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Serve the tray: those items leave the case, and new stock fills the gaps. */
export function serveTray(state: CafeState, rng: Rng, level = 'cafe'): CafeState {
  const served = new Set(state.tray);
  const kept = state.scene.objects.filter((o) => !served.has(o.id));
  const used = new Set(kept.map((o) => `${o.cell.c},${o.cell.r}`));
  const food = kindsFor(level).filter((k) => !k.sized);
  let n = Math.max(0, ...state.scene.objects.map((o) => Number(o.id.slice(1)) || 0));
  for (const o of state.scene.objects.filter((x) => served.has(x.id))) {
    if (used.has(`${o.cell.c},${o.cell.r}`)) continue;
    const kind = o.cell.r === 2 ? o.kind : rng.pick(food).id;
    kept.push({ id: `c${++n}`, kind, size: o.cell.r === 2 ? o.size : 'regular', color: getKind(kind)?.baseColor ?? 'white', cell: o.cell, yaw: (rng.next() - 0.5) * 0.8 });
    used.add(`${o.cell.c},${o.cell.r}`);
  }
  return { scene: { ...state.scene, objects: kept }, tray: [] };
}

// ---------------------------------------------------------------------------
// Understanding orders
// ---------------------------------------------------------------------------

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, pair: 2, three: 3, four: 4, five: 5, six: 6, another: 1, more: 1 };
const SIZES: Record<string, 'small' | 'big'> = { small: 'small', little: 'small', short: 'small', large: 'big', big: 'big', tall: 'big', grande: 'big' };

export interface ParsedOrder {
  /** `plural`: the noun was plural ("croissants") with no number, so the quantity is unknown. */
  lines: { kind: string; size: OrderLine['size']; qty: number | null; negated: boolean; plural: boolean }[];
  done: boolean;
  /** Utterance mentions food but no number word ("croissants and a coffee"). */
  missingNumbers: boolean;
  polite: boolean;
  /** Said a size the cafe does not have ("medium", "regular"). */
  oddSize: boolean;
  /** "make that three": a quantity correction for the previous line. */
  correction: number | null;
}

const lexicons = new Map<string, { words: string[]; kind: string; plural: boolean }[]>();
/** `extra`: item kinds this room also sells (a player's own objects as today's special). */
function lexicon(level = 'cafe', extra: string[] = []) {
  const key = `${level}|${extra.join(',')}`;
  const hit = lexicons.get(key);
  if (hit) return hit;
  const list: { words: string[]; kind: string; plural: boolean }[] = [];
  const specials = extra.map((id) => getKind(id)).filter((k): k is NonNullable<typeof k> => !!k);
  for (const k of [...kindsFor(level), ...specials])
    for (const s of new Set([...k.synonyms, k.name, k.plural])) {
      const low = s.toLowerCase();
      const plural = low === k.plural.toLowerCase() || (low.endsWith('s') && low !== k.name.toLowerCase() && !/ss$/.test(low));
      list.push({ words: low.split(' '), kind: k.id, plural });
    }
  list.sort((a, b) => b.words.length - a.words.length);
  lexicons.set(key, list);
  return list;
}

/** Drop cached lexicons (after agent-made kinds are registered). */
export function resetOrderLexicon() {
  lexicons.clear();
}

/** Parse "two croissants and a large coffee, please" (also corrections like "no pizza", "make that three"). */
export function parseOrder(raw: string, level = 'cafe', extra: string[] = []): ParsedOrder {
  // Keep clause breaks as "|" so a "not" in one sentence never negates the next one.
  const text = raw
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.!?;,]+/g, ' | ')
    .replace(/[^a-z0-9'| ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(' ').filter(Boolean);
  const lines: ParsedOrder['lines'] = [];
  let qty: number | null = null;
  let size: OrderLine['size'] = null;
  let negated = false;
  let sawNumber = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === '|') {
      negated = false;
      continue;
    }
    if (w === 'no' || w === 'not' || w === 'without' || (w === "don't" && words[i + 1] === 'want')) negated = true;
    if (w in NUMBERS && !(w === 'a' && words[i + 1] === 'bit')) {
      // "two more croissants": "more" must not reset the number before it.
      if (!(w === 'more' && qty !== null)) qty = NUMBERS[w];
      sawNumber = true;
      continue;
    }
    if (/^\d+$/.test(w)) {
      qty = Number(w);
      sawNumber = true;
      continue;
    }
    if (w in SIZES) {
      size = SIZES[w];
      continue;
    }
    const lex = lexicon(level, extra).find((l) => l.words.every((x, k) => words[i + k] === x));
    if (lex) {
      const kind = getKind(lex.kind);
      lines.push({ kind: lex.kind, size: kind?.sized ? size : null, qty, negated, plural: lex.plural && qty === null });
      i += lex.words.length - 1;
      qty = null;
      size = null;
      negated = false;
    }
    if (w === 'and' || w === 'also' || w === 'plus') negated = false;
  }
  const plain = text.replace(/\s*\|\s*/g, ' ');
  // "make that three" applies to the previous line.
  const makeThat = /\b(?:make (?:it|that)|change (?:it|that) to)\s+(\w+)/.exec(plain);
  const correction = makeThat ? (NUMBERS[makeThat[1]] ?? (Number(makeThat[1]) || null)) : null;
  return {
    lines,
    correction,
    oddSize: /\b(medium|regular|normal size|extra large)\b/.test(plain),
    done: /\b(that'?s (?:all|it|everything)|nothing else|no thanks?|that will be all|i'm good)\b/.test(plain),
    missingNumbers: lines.length > 0 && !sawNumber,
    polite: /\b(please|could i|can i|i'd like|i would like|may i|thank)/.test(plain),
  };
}
