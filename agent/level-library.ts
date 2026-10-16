import type { Palette } from '../shared/levels';
import type { ColorName, InterestId } from '../shared/types';

/**
 * Offline level library for the Scene Agent. With an LLM configured, it plans
 * levels for any theme in this same shape; without it the agent picks the
 * closest theme here. Every `fluent` value is a Microsoft Fluent Emoji 3D
 * asset folder (MIT) that was checked to exist.
 */

export interface LevelItem {
  id: string;
  name: string;
  plural: string;
  synonyms: string[];
  emoji: string;
  /** Folder name under microsoft/fluentui-emoji/assets. */
  fluent: string;
  /** One line for Rodin about the unseen back side. */
  prompt: string;
  baseColor: ColorName;
  /** Largest side of a regular instance, metres. */
  footprint: number;
  /** Rotate the reference (degrees) so the object stands upright. */
  rotate?: number;
  /** Lay the model flat on the table (phones, keys…). */
  lie?: boolean;
  /** Comes in small / large (order levels: the counter row). */
  sized?: boolean;
  interest: InterestId | 'everyday';
}

export interface LevelPlan {
  id: string;
  theme: string;
  engine: 'tabletop' | 'order';
  title: string;
  tagline: string;
  emoji: string;
  sign: string;
  palette: Palette;
  durationSec: number;
  skills: string[];
  roles: { guide: { name: string; icon: string; sees: string; does: string }; builder: { name: string; icon: string; sees: string; does: string } };
  quick: { guide: string[]; builder: string[] };
  phrases: { title: string; items: [string, string][] }[];
  items: LevelItem[];
  planner: 'llm' | 'library';
  /** Which model planned it (LLM plans only). */
  plannerModel?: string;
}

const it = (p: Omit<LevelItem, 'plural' | 'footprint' | 'interest'> & { plural?: string; footprint?: number; interest?: LevelItem['interest'] }): LevelItem => ({
  plural: p.plural ?? `${p.name}s`,
  footprint: p.footprint ?? 0.32,
  interest: p.interest ?? 'everyday',
  ...p,
});

const CLARIFY: [string, string][] = [
  ['Which one do you mean?', '你说的是哪一个？'],
  ['My left or your left?', '我的左边还是你的左边？'],
  ['Can you say that again, please?', '能再说一遍吗？'],
];

export const LEVEL_LIBRARY: Record<string, { keywords: string[]; plan: Omit<LevelPlan, 'theme' | 'planner'> }> = {
  music: {
    keywords: ['music', 'band', 'concert', 'instrument', 'song', 'orchestra'],
    plan: {
      id: 'music-room',
      engine: 'tabletop',
      title: 'Music Room',
      tagline: 'Find & place instruments',
      emoji: '🎸',
      sign: 'Band practice!',
      palette: { wall: '#e6e6fa', wallLow: '#9b7bf2', floor: '#d9a46c', accent: '#ffd166' },
      durationSec: 90,
      skills: ['instrument names', 'your left / my left', 'next to / between'],
      roles: {
        guide: { name: 'Band leader', icon: '🎼', sees: 'the gold target', does: 'explains which instrument and where it goes' },
        builder: { name: 'Roadie', icon: '🧰', sees: 'no target', does: 'picks up and places the instruments' },
      },
      quick: {
        builder: ['Which one?', 'My left or your left?', 'Is it this one?', 'The big one or the small one?', 'Got it!'],
        guide: ['Yes, that one!', 'No, the other one.', 'Closer to you.', 'Farther from you.', 'On YOUR left.', 'On YOUR right.'],
      },
      phrases: [
        {
          title: '🎸 Instruments',
          items: [
            ['the guitar next to the drum', '鼓旁边的吉他'],
            ['the small trumpet', '小号（小的那个）'],
            ['between the violin and the lamp', '在小提琴和台灯之间'],
          ],
        },
        {
          title: '🔄 Your partner’s view',
          items: [
            ['on your left / on your right', '在你的左边 / 右边'],
            ['closer to you / farther from you', '离你近 / 远'],
          ],
        },
        { title: '❓ Clarify', items: CLARIFY },
      ],
      items: [
        it({ id: 'guitar', name: 'guitar', synonyms: ['guitar', 'electric guitar'], emoji: '🎸', fluent: 'Guitar', prompt: 'A cute red electric guitar, stylized 3D toy style', baseColor: 'red', footprint: 0.42, rotate: -45, interest: 'games' }),
        it({ id: 'trumpet', name: 'trumpet', synonyms: ['trumpet', 'horn'], emoji: '🎺', fluent: 'Trumpet', prompt: 'A cute golden trumpet lying on its side, stylized 3D toy style', baseColor: 'yellow', footprint: 0.36, rotate: 35, interest: 'games' }),
        it({ id: 'drum', name: 'drum', synonyms: ['drum', 'snare drum'], emoji: '🥁', fluent: 'Drum', prompt: 'A cute red toy drum with two drumsticks, stylized 3D toy style', baseColor: 'red', footprint: 0.32, interest: 'games' }),
        it({ id: 'violin', name: 'violin', synonyms: ['violin', 'fiddle'], emoji: '🎻', fluent: 'Violin', prompt: 'A cute brown violin with a bow, stylized 3D toy style', baseColor: 'brown', footprint: 0.4, rotate: -45, interest: 'games' }),
        it({ id: 'saxophone', name: 'saxophone', synonyms: ['saxophone', 'sax'], emoji: '🎷', fluent: 'Saxophone', prompt: 'A cute golden saxophone, stylized 3D toy style', baseColor: 'yellow', footprint: 0.38, interest: 'games' }),
        it({ id: 'maracas', name: 'pair of maracas', plural: 'pairs of maracas', synonyms: ['pair of maracas', 'maracas', 'maraca', 'shakers'], emoji: '🪇', fluent: 'Maracas', prompt: 'A cute pair of colorful maracas, stylized 3D toy style', baseColor: 'orange', footprint: 0.3, interest: 'games' }),
        it({ id: 'microphone', name: 'microphone', synonyms: ['microphone', 'mic'], emoji: '🎤', fluent: 'Microphone', prompt: 'A cute handheld microphone standing on its handle, stylized 3D toy style', baseColor: 'purple', footprint: 0.3, rotate: -45, interest: 'games' }),
        it({ id: 'accordion', name: 'accordion', synonyms: ['accordion'], emoji: '🪗', fluent: 'Accordion', prompt: 'A cute red accordion, stylized 3D toy style', baseColor: 'red', footprint: 0.34, interest: 'games' }),
      ],
    },
  },
  market: {
    keywords: ['market', 'fruit', 'vegetable', 'grocery', 'greengrocer', 'shop', 'shopping', 'farm'],
    plan: {
      id: 'fruit-market',
      engine: 'order',
      title: 'Fruit Market',
      tagline: 'Buy fruit & veg by the piece',
      emoji: '🍎',
      sign: 'Sunny Fruit Market',
      palette: { wall: '#fff3d6', wallLow: '#22c55e', floor: '#e8cfae', accent: '#ff9f43' },
      durationSec: 120,
      skills: ['fruit & vegetable words', 'plural -s / -es', 'how many', 'small or large'],
      roles: {
        guide: { name: 'Shopper', icon: '🛍️', sees: 'their shopping list', does: 'asks for everything on it, politely' },
        builder: { name: 'Stallholder', icon: '🧑‍🌾', sees: 'the fruit stall', does: 'puts the right things in the basket' },
      },
      quick: {
        builder: ['What would you like?', 'How many?', 'Small or large?', 'Anything else?', 'Here you are!'],
        guide: ['Could I have…', 'Three, please.', 'Just one, please.', 'That’s all, thanks!', 'No, I didn’t ask for that.'],
      },
      phrases: [
        {
          title: '🛍️ Asking',
          items: [
            ['Could I have three apples, please?', '请给我三个苹果好吗？'],
            ['I’d like two tomatoes.', '我想要两个西红柿。'],
            ['A large watermelon, please.', '请给我一个大西瓜。'],
            ['That’s all, thanks.', '就这些，谢谢。'],
          ],
        },
        {
          title: '🔢 Plurals',
          items: [
            ['an apple → two apples', '加 s'],
            ['a peach → three peaches', '加 es'],
            ['a tomato → two tomatoes', 'o 结尾加 es'],
            ['a strawberry → strawberries', 'y 变 ies'],
          ],
        },
        {
          title: '🧑‍🌾 Selling',
          items: [
            ['How many would you like?', '您要几个？'],
            ['Small or large?', '小的还是大的？'],
            ['Anything else?', '还要别的吗？'],
          ],
        },
      ],
      items: [
        it({ id: 'apple', name: 'apple', synonyms: ['red apple', 'apples', 'apple'], emoji: '🍎', fluent: 'Red apple', prompt: 'A shiny red apple with a leaf, stylized 3D toy style', baseColor: 'red', footprint: 0.2, interest: 'food' }),
        it({ id: 'banana', name: 'banana', synonyms: ['bananas', 'banana'], emoji: '🍌', fluent: 'Banana', prompt: 'A cute yellow banana, stylized 3D toy style', baseColor: 'yellow', footprint: 0.26, interest: 'food' }),
        it({ id: 'pear', name: 'pear', synonyms: ['pears', 'pear'], emoji: '🍐', fluent: 'Pear', prompt: 'A cute green pear, stylized 3D toy style', baseColor: 'green', footprint: 0.22, interest: 'food' }),
        it({ id: 'peach', name: 'peach', plural: 'peaches', synonyms: ['peaches', 'peach'], emoji: '🍑', fluent: 'Peach', prompt: 'A cute fuzzy peach with a leaf, stylized 3D toy style', baseColor: 'orange', footprint: 0.2, interest: 'food' }),
        it({ id: 'lemon', name: 'lemon', synonyms: ['lemons', 'lemon'], emoji: '🍋', fluent: 'Lemon', prompt: 'A cute yellow lemon, stylized 3D toy style', baseColor: 'yellow', footprint: 0.2, interest: 'food' }),
        it({ id: 'strawberry', name: 'strawberry', plural: 'strawberries', synonyms: ['strawberries', 'strawberry'], emoji: '🍓', fluent: 'Strawberry', prompt: 'A cute red strawberry, stylized 3D toy style', baseColor: 'red', footprint: 0.18, interest: 'food' }),
        it({ id: 'tomato', name: 'tomato', plural: 'tomatoes', synonyms: ['tomatoes', 'tomato'], emoji: '🍅', fluent: 'Tomato', prompt: 'A cute ripe red tomato, stylized 3D toy style', baseColor: 'red', footprint: 0.2, interest: 'food' }),
        it({ id: 'carrot', name: 'carrot', synonyms: ['carrots', 'carrot'], emoji: '🥕', fluent: 'Carrot', prompt: 'A cute orange carrot with green leaves lying on its side, stylized 3D toy style', baseColor: 'orange', footprint: 0.26, rotate: 45, interest: 'food' }),
        it({ id: 'mushroom', name: 'mushroom', synonyms: ['mushrooms', 'mushroom'], emoji: '🍄', fluent: 'Mushroom', prompt: 'A cute red-capped mushroom with white spots, stylized 3D toy style', baseColor: 'red', footprint: 0.2, interest: 'food' }),
        it({ id: 'avocado', name: 'avocado', synonyms: ['avocados', 'avocado'], emoji: '🥑', fluent: 'Avocado', prompt: 'A cute avocado cut in half with its pit, stylized 3D toy style', baseColor: 'green', footprint: 0.22, interest: 'food' }),
        it({ id: 'watermelon', name: 'watermelon', synonyms: ['watermelons', 'watermelon', 'melon'], emoji: '🍉', fluent: 'Watermelon', prompt: 'A cute slice of watermelon, stylized 3D toy style', baseColor: 'green', footprint: 0.26, sized: true, interest: 'food' }),
        it({ id: 'pineapple', name: 'pineapple', synonyms: ['pineapples', 'pineapple'], emoji: '🍍', fluent: 'Pineapple', prompt: 'A cute upright pineapple with green leaves, stylized 3D toy style', baseColor: 'yellow', footprint: 0.28, rotate: 25, sized: true, interest: 'food' }),
      ],
    },
  },
  lab: {
    keywords: ['science', 'lab', 'laboratory', 'chemistry', 'experiment', 'physics'],
    plan: {
      id: 'science-lab',
      engine: 'tabletop',
      title: 'Science Lab',
      tagline: 'Find & place lab tools',
      emoji: '🔬',
      sign: 'Safety first!',
      palette: { wall: '#e3f4fb', wallLow: '#4f8ef7', floor: '#dfe6ee', accent: '#98ff98' },
      durationSec: 90,
      skills: ['science words', 'your left / my left', 'between / next to'],
      roles: {
        guide: { name: 'Scientist', icon: '🧑‍🔬', sees: 'the gold target', does: 'explains which tool and where it goes' },
        builder: { name: 'Assistant', icon: '🥽', sees: 'no target', does: 'picks up and places the tools' },
      },
      quick: {
        builder: ['Which one?', 'My left or your left?', 'Is it this one?', 'Got it!'],
        guide: ['Yes, that one!', 'No, the other one.', 'Closer to you.', 'Farther from you.', 'On YOUR left.', 'On YOUR right.'],
      },
      phrases: [{ title: '❓ Clarify', items: CLARIFY }],
      items: [
        it({ id: 'microscope', name: 'microscope', synonyms: ['microscope'], emoji: '🔬', fluent: 'Microscope', prompt: 'A cute toy microscope, stylized 3D toy style', baseColor: 'blue', footprint: 0.36 }),
        it({ id: 'test-tube', name: 'test tube', synonyms: ['test tube', 'tube'], emoji: '🧪', fluent: 'Test tube', prompt: 'A glass test tube with green liquid, stylized 3D toy style', baseColor: 'green', footprint: 0.3, rotate: -40 }),
        it({ id: 'magnet', name: 'magnet', synonyms: ['magnet', 'horseshoe magnet'], emoji: '🧲', fluent: 'Magnet', prompt: 'A red horseshoe magnet with silver tips, stylized 3D toy style', baseColor: 'red', footprint: 0.28 }),
        it({ id: 'telescope', name: 'telescope', synonyms: ['telescope'], emoji: '🔭', fluent: 'Telescope', prompt: 'A cute toy telescope on a tripod, stylized 3D toy style', baseColor: 'blue', footprint: 0.4 }),
        it({ id: 'light-bulb', name: 'light bulb', synonyms: ['light bulb', 'bulb', 'lightbulb'], emoji: '💡', fluent: 'Light bulb', prompt: 'A cute glowing light bulb, stylized 3D toy style', baseColor: 'yellow', footprint: 0.26 }),
        it({ id: 'abacus', name: 'abacus', plural: 'abacuses', synonyms: ['abacus'], emoji: '🧮', fluent: 'Abacus', prompt: 'A cute wooden abacus with colorful beads, stylized 3D toy style', baseColor: 'brown', footprint: 0.34 }),
      ],
    },
  },
};

export function levelPlanFromLibrary(theme: string): LevelPlan {
  const t = theme.toLowerCase();
  const [, def] = Object.entries(LEVEL_LIBRARY).find(([k, v]) => t.includes(k) || v.keywords.some((w) => t.includes(w))) ?? Object.entries(LEVEL_LIBRARY)[0];
  return { ...structuredClone(def.plan), theme, planner: 'library' };
}
