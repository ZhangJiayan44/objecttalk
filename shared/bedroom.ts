import { getKind, kindsFor } from './catalog';
import type { Rng } from './rng';
import type { Difficulty } from './types';

/**
 * Messy Bedroom: the owner (guide) remembers where they left their things;
 * the seeker (builder) walks around the room and picks them up. The English
 * practised is 3D place language: under, inside, on top of, behind, between.
 *
 * Room: x in [-W/2, W/2], z in [-D/2, D/2] (north wall at -z). Units: metres.
 */

export const ROOM_W = 9;
export const ROOM_D = 7;

export type FurnitureId = 'bed' | 'nightstand' | 'wardrobe' | 'desk' | 'chair' | 'bookshelf' | 'toybox' | 'beanbag' | 'window' | 'rug';

export interface Furniture {
  id: FurnitureId;
  name: string;
  synonyms: string[];
  /** Centre on the floor and footprint (x, z) + height. */
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Solid for walking. */
  solid: boolean;
}

export const FURNITURE: Furniture[] = [
  { id: 'bed', name: 'bed', synonyms: ['bed'], x: -2.4, z: -2.35, w: 1.9, d: 2.2, h: 0.62, solid: true },
  { id: 'nightstand', name: 'nightstand', synonyms: ['nightstand', 'night stand', 'bedside table', 'little table', 'lamp table'], x: -0.85, z: -3.05, w: 0.55, d: 0.5, h: 0.58, solid: true },
  { id: 'wardrobe', name: 'wardrobe', synonyms: ['wardrobe', 'closet', 'cupboard', 'cabinet'], x: 3.95, z: -2.1, w: 0.7, d: 1.5, h: 2.1, solid: true },
  { id: 'desk', name: 'desk', synonyms: ['desk', 'table', 'study table'], x: -4.0, z: 0.95, w: 0.8, d: 1.5, h: 0.76, solid: true },
  { id: 'chair', name: 'chair', synonyms: ['chair', 'desk chair', 'seat'], x: -3.25, z: 0.95, w: 0.5, d: 0.5, h: 0.9, solid: true },
  { id: 'bookshelf', name: 'bookshelf', synonyms: ['bookshelf', 'bookcase', 'shelves', 'shelf'], x: -2.6, z: 3.2, w: 1.5, d: 0.4, h: 1.85, solid: true },
  { id: 'toybox', name: 'toy box', synonyms: ['toy box', 'toybox', 'box', 'chest', 'toy chest'], x: 3.6, z: 2.95, w: 0.9, d: 0.6, h: 0.5, solid: true },
  { id: 'beanbag', name: 'beanbag', synonyms: ['beanbag', 'bean bag', 'cushion', 'pouf'], x: 2.0, z: 1.5, w: 1.0, d: 1.0, h: 0.55, solid: true },
  { id: 'window', name: 'window', synonyms: ['window', 'windowsill', 'window sill', 'curtain', 'curtains'], x: -4.42, z: -0.6, w: 0.16, d: 1.6, h: 2.0, solid: false },
  { id: 'rug', name: 'rug', synonyms: ['rug', 'carpet', 'mat'], x: 0.3, z: 0.2, w: 3.2, d: 2.2, h: 0.02, solid: false },
];

export type Prep = 'under' | 'on' | 'on top of' | 'inside' | 'between' | 'behind' | 'next to';

export interface Spot {
  id: string;
  furniture: FurnitureId;
  prep: Prep;
  /** Accepted prepositions for this spot (people say "on the wardrobe" for "on top of"). */
  accepts: Prep[];
  phrase: string;
  /** Where the item rests. */
  pos: [number, number, number];
  /** Where a seeker should stand to reach it. */
  approach: [number, number];
}

export const SPOTS: Spot[] = [
  { id: 'under-bed', furniture: 'bed', prep: 'under', accepts: ['under'], phrase: 'under the bed', pos: [-1.58, 0.05, -1.95], approach: [-0.9, -1.0] },
  { id: 'pillows', furniture: 'bed', prep: 'between', accepts: ['between', 'on', 'on top of', 'next to'], phrase: 'on the bed, between the pillows', pos: [-2.4, 0.66, -3.1], approach: [-1.0, -2.1] },
  { id: 'nightstand', furniture: 'nightstand', prep: 'on', accepts: ['on', 'on top of', 'next to'], phrase: 'on the nightstand, next to the lamp', pos: [-0.72, 0.6, -2.95], approach: [-0.4, -2.0] },
  { id: 'wardrobe-top', furniture: 'wardrobe', prep: 'on top of', accepts: ['on top of', 'on'], phrase: 'on top of the wardrobe', pos: [3.85, 2.12, -2.1], approach: [2.8, -2.1] },
  { id: 'desk', furniture: 'desk', prep: 'on', accepts: ['on', 'on top of', 'next to'], phrase: 'on the desk, next to the laptop', pos: [-4.0, 0.78, 1.4], approach: [-2.95, 1.6] },
  { id: 'under-desk', furniture: 'desk', prep: 'under', accepts: ['under'], phrase: 'under the desk', pos: [-4.05, 0.05, 0.55], approach: [-2.9, 0.2] },
  { id: 'chair', furniture: 'chair', prep: 'on', accepts: ['on', 'on top of'], phrase: 'on the chair', pos: [-3.25, 0.5, 0.95], approach: [-2.4, 1.0] },
  { id: 'shelf-top', furniture: 'bookshelf', prep: 'on top of', accepts: ['on top of', 'on'], phrase: 'on the top shelf of the bookshelf', pos: [-2.95, 1.62, 3.18], approach: [-2.8, 2.15] },
  { id: 'shelf-bottom', furniture: 'bookshelf', prep: 'on', accepts: ['on', 'under', 'inside'], phrase: 'on the bottom shelf of the bookshelf', pos: [-2.25, 0.42, 3.18], approach: [-2.3, 2.2] },
  { id: 'toybox', furniture: 'toybox', prep: 'inside', accepts: ['inside', 'on'], phrase: 'inside the toy box', pos: [3.6, 0.32, 2.95], approach: [2.6, 2.75] },
  { id: 'beanbag', furniture: 'beanbag', prep: 'on', accepts: ['on', 'on top of', 'next to'], phrase: 'on the beanbag', pos: [2.0, 0.56, 1.5], approach: [1.0, 0.9] },
  { id: 'windowsill', furniture: 'window', prep: 'behind', accepts: ['behind', 'on', 'next to'], phrase: 'on the windowsill, behind the curtain', pos: [-4.36, 1.08, -0.15], approach: [-3.3, -0.3] },
];

export const spotById = (id: string) => SPOTS.find((s) => s.id === id);

export interface BedroomItem {
  id: string;
  kind: string;
  spot: string;
}

export interface BedroomState {
  items: BedroomItem[];
  found: string[];
}

export const START_POSE = { x: 0.3, z: 2.7, yaw: 0 };
export const REACH = 2.6;

/** `extra`: the player's own Rodin objects (Object Studio). They are always in the room. */
export function buildBedroom(rng: Rng, extra: string[] = []): BedroomState {
  const own = extra.filter((k) => getKind(k)).slice(0, 2);
  const kinds = [...own, ...rng.shuffle(kindsFor('bedroom').map((k) => k.id).filter((k) => !own.includes(k)))].slice(0, 8);
  const spots = rng.shuffle(SPOTS.map((s) => s.id));
  return { items: kinds.map((kind, i) => ({ id: `b${i + 1}`, kind, spot: spots[i] })), found: [] };
}

export function itemPos(item: BedroomItem): [number, number, number] {
  return spotById(item.spot)?.pos ?? [0, 0, 0];
}

/** Can a seeker at (x, z) reach the item? */
export function canReach(pose: { x: number; z: number }, item: BedroomItem): boolean {
  const [ix, , iz] = itemPos(item);
  return Math.hypot(pose.x - ix, pose.z - iz) <= REACH;
}

export function itemName(kind: string) {
  return getKind(kind)?.name ?? kind;
}

/** "my keys" / "my glasses" / "my phone": owners talk about their own things. */
export function possessive(kind: string) {
  if (kind === 'key') return 'my keys';
  return `my ${getKind(kind)?.name ?? kind}`;
}

/** "it" or "they" for the lost thing ("they're under the bed"). */
export function pronoun(kind: string): { it: string; is: string } {
  const k = getKind(kind);
  const plural = kind === 'key' || (!!k && k.name === k.plural);
  return plural ? { it: 'they', is: 'they are' } : { it: 'it', is: 'it is' };
}

/** Spots that are hard to see from the middle of the room. */
export const HIDDEN_SPOTS = new Set(['under-bed', 'under-desk', 'wardrobe-top', 'shelf-top', 'toybox', 'windowsill']);

export interface SeekMission {
  id: string;
  index: number;
  type: 'seek';
  targetId: string;
  kind: string;
  spotId: string;
  modelAnswer: string;
  hint: string;
}

/** Choose a lost item: easy ones lie in the open, tricky ones are tucked away. */
export function generateSeekMission(state: BedroomState, index: number, difficulty: Difficulty, rng: Rng, prefer: string[] = []): SeekMission | null {
  const left = state.items.filter((i) => !state.found.includes(i.id));
  if (!left.length) return null;
  // The player's own object is the first thing to find (that is why they made it).
  const mine = left.find((i) => prefer.includes(i.kind));
  if (mine) return seekMissionFor(mine, index);
  const hidden = left.filter((i) => HIDDEN_SPOTS.has(i.spot));
  const open = left.filter((i) => !HIDDEN_SPOTS.has(i.spot));
  const pool = difficulty === 'easy' ? (open.length ? open : left) : difficulty === 'tricky' ? (hidden.length ? hidden : left) : rng.chance(0.6) && hidden.length ? hidden : left;
  return seekMissionFor(rng.pick(pool), index);
}

function seekMissionFor(item: BedroomItem, index: number): SeekMission {
  const spot = spotById(item.spot)!;
  const p = pronoun(item.kind);
  const modelAnswer = `Can you find ${possessive(item.kind)}? I think ${p.is === 'they are' ? "they're" : "it's"} ${spot.phrase}.`;
  const hint =
    spot.prep === 'under'
      ? '"Under" means below something: "under the bed", "under the desk".'
      : spot.prep === 'inside'
        ? '"Inside" or "in": the seeker has to open it first.'
        : spot.prep === 'on top of'
          ? '"On top of" for high places: the seeker may have to look up.'
          : spot.prep === 'behind'
            ? '"Behind" hides things: "behind the curtain".'
            : 'Name the furniture first, then a detail: "on the desk, next to the laptop".';
  return { id: `m${index + 1}`, index, type: 'seek', targetId: item.id, kind: item.kind, spotId: spot.id, modelAnswer, hint };
}

/** Keep the seeker inside the room and out of furniture. */
export function collideRoom(pos: { x: number; z: number }, radius = 0.35): { x: number; z: number } {
  let x = Math.max(-ROOM_W / 2 + radius, Math.min(ROOM_W / 2 - radius, pos.x));
  let z = Math.max(-ROOM_D / 2 + radius, Math.min(ROOM_D / 2 - radius, pos.z));
  for (const f of FURNITURE) {
    if (!f.solid) continue;
    const hx = f.w / 2 + radius;
    const hz = f.d / 2 + radius;
    const dx = x - f.x;
    const dz = z - f.z;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = f.x + Math.sign(dx || 1) * hx;
      else z = f.z + Math.sign(dz || 1) * hz;
    }
  }
  return { x, z };
}

// ---------------------------------------------------------------------------
// Understanding "where is it"
// ---------------------------------------------------------------------------

const PREPS: [RegExp, Prep][] = [
  [/\b(?:on top of|on the top of|top of|above)\b/, 'on top of'],
  [/\b(?:under|underneath|beneath|below)\b/, 'under'],
  [/\b(?:inside|in)\b/, 'inside'],
  [/\b(?:between)\b/, 'between'],
  [/\b(?:behind|in back of)\b/, 'behind'],
  [/\b(?:next to|beside|near|by)\b/, 'next to'],
  [/\b(?:on)\b/, 'on'],
];

export interface ParsedSpot {
  furniture: FurnitureId | null;
  prep: Prep | null;
  shelf: 'top' | 'bottom' | null;
  item: string | null;
  vague: boolean;
}

export function parseSpot(raw: string): ParsedSpot {
  // "No, not on the bed. It's under the desk": negated clauses name the wrong place, so skip them.
  const clauses = raw
    .toLowerCase()
    .split(/[.;!?]+|,\s*(?:but\s+)?|\bbut\b/)
    .map((c) => c.trim())
    .filter(Boolean);
  const negated = (c: string) => /\b(not|no|isn'?t|aren'?t|wasn'?t|never)\b/.test(c);
  // A clause right after a negated one that only adds a detail ("not on the bed, between the pillows") is negated too.
  const kept = clauses.filter((c, i) => !negated(c) && !(i > 0 && negated(clauses[i - 1]) && /^(?:between|next to|near|behind|under|on|in|inside|beside)\b/.test(c)));
  const source = kept.length ? kept.join(' . ') : raw.toLowerCase();
  const text = ` ${source.replace(/[^a-z' ]+/g, ' ')} `;
  let furniture: FurnitureId | null = null;
  let at = Infinity;
  for (const f of FURNITURE)
    for (const s of f.synonyms) {
      const i = text.indexOf(` ${s}`);
      if (i >= 0 && i < at) {
        at = i;
        furniture = f.id;
      }
    }
  if (/\bpillow/.test(text) && !furniture) furniture = 'bed';
  if (/\blaptop|computer/.test(text) && !furniture) furniture = 'desk';
  if (/\blamp\b/.test(text) && !furniture) furniture = 'nightstand';
  let prep: Prep | null = null;
  for (const [re, p] of PREPS) if (re.test(text)) {
    prep = p;
    break;
  }
  // The thing they want: the one after "lost / need / find my …", else the last one mentioned.
  const full = ` ${raw.toLowerCase().replace(/[^a-z' ]+/g, ' ')} `;
  const mentions: { kind: string; at: number }[] = [];
  for (const k of kindsFor('bedroom'))
    for (const s of k.synonyms) {
      const at = full.lastIndexOf(` ${s}`);
      if (at >= 0) mentions.push({ kind: k.id, at });
    }
  mentions.sort((a, b) => a.at - b.at);
  const cue = /\b(?:lost|lose|need|find|looking for|missing|where (?:is|are)|can'?t find)\b(?:\s+\w+){0,3}?\s*$/;
  const wanted = mentions.find((m) => cue.test(full.slice(0, m.at + 1)));
  const item: string | null = (wanted ?? mentions[mentions.length - 1])?.kind ?? null;
  return {
    furniture,
    prep,
    shelf: /\btop shelf\b/.test(text) ? 'top' : /\bbottom shelf\b|\blower shelf\b/.test(text) ? 'bottom' : null,
    item,
    vague: /\b(over there|there|here|somewhere|that place|this place)\b/.test(text) && !furniture,
  };
}

/** Spots a description can mean (furniture + preposition, with sensible equivalences). */
export function matchSpots(p: ParsedSpot): Spot[] {
  if (!p.furniture) return [];
  return SPOTS.filter((s) => {
    if (s.furniture !== p.furniture) return false;
    if (p.shelf === 'top' && s.id !== 'shelf-top') return false;
    if (p.shelf === 'bottom' && s.id !== 'shelf-bottom') return false;
    return !p.prep || s.accepts.includes(p.prep);
  });
}
