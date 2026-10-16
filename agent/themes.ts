import type { ColorName, InterestId } from '../shared/types';

/**
 * Offline theme library for the Scene Agent planner. Each item names a
 * Microsoft Fluent Emoji 3D asset folder (MIT) as its reference image, so a
 * pack can be generated end to end without any image search.
 */

export interface PlannedItem {
  id: string;
  name: string;
  plural: string;
  synonyms: string[];
  interest: InterestId | 'everyday';
  /** Folder name under microsoft/fluentui-emoji/assets, e.g. "Ringed planet". */
  fluent: string;
  prompt: string;
  baseColor: ColorName;
  footprint: number;
  /** Degrees to rotate the reference so the object stands upright. */
  rotate?: number;
}

export interface PackPlan {
  pack: string;
  theme: string;
  items: PlannedItem[];
  planner: 'llm' | 'library';
}

const item = (p: Omit<PlannedItem, 'plural' | 'footprint'> & { plural?: string; footprint?: number }): PlannedItem => ({
  plural: p.plural ?? `${p.name}s`,
  footprint: p.footprint ?? 0.32,
  ...p,
});

export const THEMES: Record<string, { keywords: string[]; items: PlannedItem[] }> = {
  breakfast: {
    keywords: ['breakfast', 'kitchen', 'food', 'morning', 'cafe', 'bakery'],
    items: [
      item({ id: 'croissant', name: 'croissant', synonyms: ['croissant', 'pastry'], interest: 'food', fluent: 'Croissant', prompt: 'A cute golden croissant, stylized 3D toy style', baseColor: 'orange' }),
      item({ id: 'pancakes', name: 'pancake stack', plural: 'pancake stacks', synonyms: ['pancakes', 'pancake', 'pancake stack'], interest: 'food', fluent: 'Pancakes', prompt: 'A cute stack of pancakes with butter and syrup, stylized 3D toy style', baseColor: 'brown' }),
      item({ id: 'bread', name: 'loaf of bread', plural: 'loaves', synonyms: ['bread', 'loaf', 'loaf of bread'], interest: 'food', fluent: 'Bread', prompt: 'A cute loaf of bread, stylized 3D toy style', baseColor: 'brown' }),
      item({ id: 'banana', name: 'banana', synonyms: ['banana'], interest: 'food', fluent: 'Banana', prompt: 'A cute yellow banana, stylized 3D toy style', baseColor: 'yellow' }),
    ],
  },
  classroom: {
    keywords: ['classroom', 'school', 'study', 'desk', 'office', 'stationery'],
    items: [
      item({ id: 'globe', name: 'globe', synonyms: ['globe', 'world globe'], interest: 'everyday', fluent: 'Globe showing Americas', prompt: 'A cute desk globe on a stand, stylized 3D toy style', baseColor: 'blue' }),
      item({ id: 'pencil', name: 'pencil', synonyms: ['pencil'], interest: 'everyday', fluent: 'Pencil', prompt: 'A cute yellow pencil standing upright, stylized 3D toy style', baseColor: 'yellow', rotate: 45 }),
      item({ id: 'backpack', name: 'backpack', synonyms: ['backpack', 'school bag', 'bag'], interest: 'everyday', fluent: 'Backpack', prompt: 'A cute pink school backpack, stylized 3D toy style', baseColor: 'pink' }),
      item({ id: 'alarm-clock', name: 'alarm clock', synonyms: ['alarm clock', 'clock'], interest: 'everyday', fluent: 'Alarm clock', prompt: 'A cute red twin-bell alarm clock, stylized 3D toy style', baseColor: 'red' }),
    ],
  },
  space: {
    keywords: ['space', 'planet', 'galaxy', 'astronaut', 'universe', 'star'],
    items: [
      item({ id: 'planet', name: 'planet', synonyms: ['planet', 'ringed planet', 'saturn'], interest: 'space', fluent: 'Ringed planet', prompt: 'A cute ringed planet on a small stand, stylized 3D toy style', baseColor: 'orange' }),
      item({ id: 'ufo', name: 'flying saucer', synonyms: ['ufo', 'flying saucer', 'spaceship'], interest: 'space', fluent: 'Flying saucer', prompt: 'A cute flying saucer toy, stylized 3D toy style', baseColor: 'green' }),
      item({ id: 'satellite', name: 'satellite', synonyms: ['satellite'], interest: 'space', fluent: 'Satellite', prompt: 'A cute toy satellite with solar panels, stylized 3D toy style', baseColor: 'white' }),
      item({ id: 'telescope', name: 'telescope', synonyms: ['telescope'], interest: 'space', fluent: 'Telescope', prompt: 'A cute toy telescope on a tripod, stylized 3D toy style', baseColor: 'blue' }),
    ],
  },
  music: {
    keywords: ['music', 'band', 'concert', 'song', 'instrument'],
    items: [
      item({ id: 'guitar', name: 'guitar', synonyms: ['guitar', 'electric guitar'], interest: 'games', fluent: 'Guitar', prompt: 'A cute red electric guitar, stylized 3D toy style', baseColor: 'red', rotate: -45 }),
      item({ id: 'headphones', name: 'headphones', plural: 'headphones', synonyms: ['headphones', 'headset'], interest: 'games', fluent: 'Headphone', prompt: 'Cute over-ear headphones, stylized 3D toy style', baseColor: 'white' }),
      item({ id: 'trumpet', name: 'trumpet', synonyms: ['trumpet', 'horn'], interest: 'games', fluent: 'Trumpet', prompt: 'A cute golden trumpet, stylized 3D toy style', baseColor: 'yellow' }),
      item({ id: 'drum', name: 'drum', synonyms: ['drum'], interest: 'games', fluent: 'Drum', prompt: 'A cute toy drum with sticks, stylized 3D toy style', baseColor: 'red' }),
    ],
  },
  sports: {
    keywords: ['sport', 'sports', 'gym', 'ball', 'football', 'soccer', 'basketball'],
    items: [
      item({ id: 'soccer-ball', name: 'football', synonyms: ['football', 'soccer ball', 'ball'], interest: 'sports', fluent: 'Soccer ball', prompt: 'A cute soccer ball, stylized 3D toy style', baseColor: 'white', footprint: 0.26 }),
      item({ id: 'skateboard', name: 'skateboard', synonyms: ['skateboard', 'board'], interest: 'sports', fluent: 'Skateboard', prompt: 'A cute purple skateboard, stylized 3D toy style', baseColor: 'purple', rotate: 40 }),
      item({ id: 'trophy', name: 'trophy', synonyms: ['trophy', 'cup', 'prize'], interest: 'sports', fluent: 'Trophy', prompt: 'A cute golden trophy cup, stylized 3D toy style', baseColor: 'yellow' }),
      item({ id: 'medal', name: 'medal', synonyms: ['medal'], interest: 'sports', fluent: 'Sports medal', prompt: 'A cute gold medal with ribbon, stylized 3D toy style', baseColor: 'yellow' }),
    ],
  },
};

export function libraryPlan(theme: string, count: number): PackPlan {
  const t = theme.toLowerCase();
  const [key, def] =
    Object.entries(THEMES).find(([k, v]) => t.includes(k) || v.keywords.some((w) => t.includes(w))) ?? Object.entries(THEMES)[0];
  return { pack: key, theme, items: def.items.slice(0, count), planner: 'library' };
}
