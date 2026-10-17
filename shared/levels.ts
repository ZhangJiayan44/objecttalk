import type { ItemKind, Role } from './types';

/**
 * Level registry. Each level is an everyday situation that needs a different
 * kind of English, running on one of four engines:
 *   tabletop   - find / place things described in space (study)
 *   order      - order food with quantities and sizes (cafe)
 *   walknav    - give and follow directions through a town (city)
 *   walksearch - find lost things in a room (bedroom)
 */

export type LevelId = 'study' | 'pets' | 'cafe' | 'nightmarket' | 'city' | 'bedroom';
export type EngineKind = 'tabletop' | 'order' | 'walknav' | 'walksearch';

export interface RoleCopy {
  name: string;
  icon: string;
  sees: string;
  does: string;
}

/** Which 3D set a level is drawn in (the engine decides the rules, the look decides the place). */
export type SceneLook = 'study' | 'petshop' | 'cafe' | 'market' | 'night';

/** Room colours for an agent-made level (walls, lower wall / trim, floor, accent). */
export interface Palette {
  wall: string;
  wallLow: string;
  floor: string;
  accent: string;
}

/** Extra data for levels made by the Scene Agent (agent/level.ts). */
export interface GeneratedInfo {
  theme: string;
  createdAt: number;
  /** Item kinds generated for this level (registered with `levels: [level.id]`). */
  kinds: string[];
  palette: Palette;
  /** Shop sign / room name painted in the scene. */
  sign: string;
  /** How the level was made: planner, 3D backend, review verdict, Rodin generations. */
  agent: { planner: string; backend: string; review: string; generations: number; validation: string };
}

/** A level file on disk: the level plus the item kinds that belong to it. */
export interface LevelBundle {
  level: LevelMeta;
  kinds: ItemKind[];
}

export interface LevelMeta {
  /** A built-in LevelId, or `gen-…` for agent-made levels. */
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  engine: EngineKind;
  skills: string[];
  roles: Record<Role, RoleCopy>;
  /** Player movement; guides with a map/dollhouse view keep their overview. */
  controls: 'stand' | 'walk';
  /** What the guide looks at: their own standing view, a town map, or a dollhouse view of the room. */
  guideView: 'stand' | 'map' | 'dollhouse';
  durationSec: number;
  missions: number;
  color: string;
  quick: Record<Role, string[]>;
  phrases: { title: string; items: [string, string][] }[];
  /** The 3D set (defaults: study for tabletop, cafe for order levels). */
  scene?: SceneLook;
  generated?: GeneratedInfo;
}

const CLARIFY: [string, string][] = [
  ['Which one do you mean?', '你说的是哪一个？'],
  ['My left or your left?', '我的左边还是你的左边？'],
  ['Can you say that again, please?', '能再说一遍吗？'],
  ['Is it this one?', '是这个吗？'],
];

export const LEVELS: Record<LevelId, LevelMeta & { id: LevelId }> = {
  study: {
    id: 'study',
    title: 'Cozy Study',
    tagline: 'Find & place things on the desk',
    emoji: '📚',
    engine: 'tabletop',
    skills: ['prepositions', 'your left / my left', 'describing objects'],
    roles: {
      guide: { name: 'Guide', icon: '🧭', sees: 'the gold target', does: 'explains which object and where' },
      builder: { name: 'Builder', icon: '🛠️', sees: 'no target', does: 'picks up and places objects' },
    },
    controls: 'stand',
    guideView: 'stand',
    durationSec: 90,
    missions: 3,
    color: 'bg-peach',
    quick: {
      builder: ['Which one?', 'My left or your left?', 'Is it this one?', 'Can you say that again?', 'Got it!'],
      guide: ['Yes, that one!', 'No, the other one.', 'Closer to you.', 'Farther from you.', 'On YOUR left.', 'On YOUR right.'],
    },
    phrases: [
      {
        title: '📍 Point it out',
        items: [
          ['next to the lamp', '在台灯旁边'],
          ['between the plant and the red book', '在植物和红书之间'],
          ['the small one / the big one', '小的那个 / 大的那个'],
        ],
      },
      {
        title: '🔄 Use your partner’s view',
        items: [
          ['on your left / on your right', '在你的左边 / 右边'],
          ['closer to you / farther from you', '离你更近 / 更远'],
          ['from where you are standing', '从你站的位置看'],
        ],
      },
      { title: '❓ Clarify', items: CLARIFY },
    ],
  },
  pets: {
    id: 'pets',
    title: 'Pet Shop',
    tagline: 'Find & place the animals',
    emoji: '🐶',
    engine: 'tabletop',
    scene: 'petshop',
    skills: ['animal words', 'your left / my left', 'next to / between'],
    roles: {
      guide: { name: 'Shop owner', icon: '🧑‍🔧', sees: 'which pet a customer wants', does: 'explains which animal and where it goes' },
      builder: { name: 'Helper', icon: '🧤', sees: 'no target', does: 'picks up and moves the animals' },
    },
    controls: 'walk',
    guideView: 'stand',
    durationSec: 90,
    missions: 3,
    color: 'bg-mint',
    quick: {
      builder: ['Which one?', 'My left or your left?', 'Is it this one?', 'The big one or the small one?', 'Got it!'],
      guide: ['Yes, that one!', 'No, the other one.', 'Closer to you.', 'Farther from you.', 'On YOUR left.', 'On YOUR right.'],
    },
    phrases: [
      {
        title: '🐾 Animals',
        items: [
          ['the puppy next to the lamp', '台灯旁边的小狗'],
          ['the small bunny / the big bunny', '小兔子 / 大兔子'],
          ['between the turtle and the plant', '在乌龟和植物之间'],
          ['Put the kitten in front of you.', '把小猫放在你面前。'],
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
  },
  cafe: {
    id: 'cafe',
    title: 'Corner Café',
    tagline: 'Order food and drinks',
    emoji: '☕',
    engine: 'order',
    skills: ['ordering politely', 'quantities & plurals', 'food words', 'sizes'],
    roles: {
      guide: { name: 'Customer', icon: '🙋', sees: 'their order card', does: 'orders politely, with numbers and sizes' },
      builder: { name: 'Barista', icon: '🧑‍🍳', sees: 'the display case', does: 'puts the right food on the tray' },
    },
    controls: 'walk',
    guideView: 'stand',
    durationSec: 120,
    missions: 3,
    color: 'bg-sun',
    quick: {
      builder: ['What can I get you?', 'Small or large?', 'How many?', 'Anything else?', 'Here you are!'],
      guide: ['Could I have…', 'Two of those, please.', 'Just one, please.', 'That’s all, thanks!', 'No, I didn’t order that.'],
    },
    phrases: [
      {
        title: '🙋 Ordering',
        items: [
          ['Could I have two croissants, please?', '请给我两个可颂好吗？'],
          ['I’d like a large coffee.', '我想要一杯大杯咖啡。'],
          ['Can I get a slice of cake?', '能给我一块蛋糕吗？'],
          ['That’s all, thanks.', '就这些，谢谢。'],
        ],
      },
      {
        title: '🧑‍🍳 Serving',
        items: [
          ['What can I get you?', '您想要点什么？'],
          ['Small or large?', '小杯还是大杯？'],
          ['Anything else?', '还需要别的吗？'],
          ['Here you are!', '给您！'],
        ],
      },
      {
        title: '🔢 Numbers & plurals',
        items: [
          ['one doughnut → two doughnuts', '一个 → 两个（加 s）'],
          ['a sandwich → three sandwiches', '加 es'],
          ['a slice of pizza → two slices of pizza', '片、块的复数'],
        ],
      },
    ],
  },
  nightmarket: {
    id: 'nightmarket',
    title: 'Night Market',
    tagline: 'Follow your partner through Lantern Street and shop for friends',
    emoji: '🏮',
    engine: 'order',
    scene: 'night',
    skills: ['directions & shop names', 'a bowl of / a bag of', 'how many', 'small or large'],
    roles: {
      guide: { name: 'Shopping partner', icon: '🧭', sees: 'the secret shopping list and the street map', does: 'directs the shopper to each shop, with numbers and sizes' },
      builder: { name: 'Shopper', icon: '🛍️', sees: 'the street and shop menus', does: 'walks to shopkeepers, buys food and returns to the entrance gate' },
    },
    controls: 'walk',
    guideView: 'map',
    durationSec: 300,
    missions: 3,
    color: 'bg-grape',
    quick: {
      builder: ['Where should I go?', 'What should I buy?', 'How many?', 'Small or large?', 'What should I do next?', 'Should I come back now?'],
      guide: ['Go straight along the main street.', 'Turn left at the next lane.', 'Turn right at the next lane.', 'Buy two of those, please.', 'A large one, please.', 'Bring the shopping bag back to the entrance gate.'],
    },
    phrases: [
      {
        title: '🏮 Ordering',
        items: [
          ['Go to Moon Noodle House and buy two bowls of noodles.', '去月来面馆买两碗面。'],
          ['Which shop should I go to next?', '接下来去哪家店？'],
          ['Turn right into the side lane.', '右转进入支巷。'],
          ['Could I have a bowl of noodles, please?', '请给我一碗面好吗？'],
          ['Two skewers and a large bubble tea, please.', '两串烤串和一杯大杯奶茶。'],
          ['A bag of chestnuts, please.', '一袋糖炒栗子。'],
          ['That’s all, thanks!', '就这些，谢谢！'],
        ],
      },
      {
        title: '🥢 Counting street food',
        items: [
          ['a bowl of noodles → two bowls of noodles', '一碗面 → 两碗面'],
          ['an ear of corn → three ears of corn', '一根玉米 → 三根玉米'],
          ['a dumpling → six dumplings', '饺子：加 s'],
          ['a sweet potato → two sweet potatoes', 'o 结尾加 es'],
        ],
      },
      {
        title: '🧑‍🍳 Selling',
        items: [
          ['What would you like?', '您想要点什么？'],
          ['Small or large?', '小杯还是大杯？'],
          ['How many would you like?', '要几个？'],
          ['Here you go! Enjoy!', '给您，慢用！'],
        ],
      },
    ],
  },
  city: {
    id: 'city',
    title: 'Toy Town',
    tagline: 'Ask for and give directions',
    emoji: '🏙️',
    engine: 'walknav',
    skills: ['directions', 'turn left / right', 'landmarks', 'sequencing'],
    roles: {
      guide: { name: 'Navigator', icon: '🗺️', sees: 'the town map and the destination', does: 'gives turn-by-turn directions' },
      builder: { name: 'Walker', icon: '🚶', sees: 'only the street in front of them', does: 'walks (WASD) and asks for help' },
    },
    controls: 'walk',
    guideView: 'map',
    durationSec: 150,
    missions: 3,
    color: 'bg-sky',
    quick: {
      builder: ['Where should I go?', 'Left or right?', 'I can see the bank.', 'Am I close?', 'I think I’m lost.'],
      guide: ['Go straight ahead.', 'Turn left.', 'Turn right.', 'Turn around.', 'Stop! It’s here.', 'It’s on your right.'],
    },
    phrases: [
      {
        title: '🧭 Giving directions',
        items: [
          ['Go straight ahead.', '一直往前走。'],
          ['Turn left at the bank.', '在银行左转。'],
          ['Take the second right.', '在第二个路口右转。'],
          ['It’s on your left, next to the school.', '在你左边，学校旁边。'],
        ],
      },
      {
        title: '🚶 Asking',
        items: [
          ['Excuse me, how do I get to the hospital?', '请问去医院怎么走？'],
          ['Is it far from here?', '离这里远吗？'],
          ['I can see a fountain. Where am I?', '我看到一个喷泉，我在哪？'],
        ],
      },
      { title: '❓ Clarify', items: CLARIFY },
    ],
  },
  bedroom: {
    id: 'bedroom',
    title: 'Messy Bedroom',
    tagline: 'Find lost things',
    emoji: '🛏️',
    engine: 'walksearch',
    skills: ['under / inside / on top of', 'furniture words', 'warmer & colder'],
    roles: {
      guide: { name: 'Owner', icon: '🤔', sees: 'where they left each thing', does: 'describes where to look' },
      builder: { name: 'Seeker', icon: '🔦', sees: 'the room, but not the lost item', does: 'walks around and picks it up' },
    },
    controls: 'walk',
    guideView: 'dollhouse',
    durationSec: 120,
    missions: 3,
    color: 'bg-lavender',
    quick: {
      builder: ['Where did you leave it?', 'Under the bed?', 'Is it this one?', 'I can’t find it.', 'Found it!'],
      guide: ['Look under the bed.', 'It’s on top of the wardrobe.', 'You’re getting warmer!', 'Colder…', 'Yes, that’s it!'],
    },
    phrases: [
      {
        title: '🛏️ Where is it?',
        items: [
          ['under the bed', '在床底下'],
          ['on top of the wardrobe', '在衣柜顶上'],
          ['inside the toy box', '在玩具箱里面'],
          ['between the pillows', '在两个枕头之间'],
          ['behind the curtain', '在窗帘后面'],
        ],
      },
      {
        title: '🔥 Warmer / colder',
        items: [
          ['You’re getting warmer!', '越来越近了！'],
          ['Colder, go back.', '远了，往回走。'],
          ['Look down. / Look up.', '往下看 / 往上看。'],
        ],
      },
      { title: '❓ Clarify', items: CLARIFY },
    ],
  },
};

export const LEVEL_ORDER: LevelId[] = ['study', 'pets', 'cafe', 'nightmarket', 'city', 'bedroom'];

/** Agent-made levels, merged in at runtime (server: data/levels, client: /api/levels). */
const generatedLevels = new Map<string, LevelMeta>();

export function registerLevels(levels: LevelMeta[]) {
  // Older published bundles used standing controls; their shared sets now support bounded walking.
  for (const l of levels) if (l.generated && !(l.id in LEVELS)) generatedLevels.set(l.id, { ...l, controls: 'walk' });
}

export function generatedLevelList(): LevelMeta[] {
  return [...generatedLevels.values()].sort((a, b) => (b.generated?.createdAt ?? 0) - (a.generated?.createdAt ?? 0));
}

export const isLevel = (id: string | undefined): boolean => !!id && (id in LEVELS || generatedLevels.has(id));

export const levelOf = (id: string | undefined): LevelMeta => (id && (LEVELS[id as LevelId] ?? generatedLevels.get(id))) || LEVELS.study;

/** Which item-kind pool a level draws from (every level has its own: kinds list it in `levels`). */
export const kindPoolOf = (level: LevelMeta): string => level.id;

/** The 3D set a level is drawn in. */
export const sceneOf = (level: LevelMeta): SceneLook => level.scene ?? (level.engine === 'order' ? (level.generated ? 'market' : 'cafe') : 'study');
