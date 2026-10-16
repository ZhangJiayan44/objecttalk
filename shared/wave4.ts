import type { ColorName, InterestId, ItemKind } from './types';

/**
 * Wave 4 of Rodin objects (2026-10-14, 73 Gen-2.5-High generations through the
 * REST API, references from Microsoft Fluent Emoji 3D, every reference and
 * every finished model checked by eye from the front and the back):
 *   pets         the Pet Shop level (tabletop engine) + animals around town
 *   nightmarket  the Night Market level (order engine): Chinese street food
 *   cafe         a bigger Corner Café menu
 *   decor        plants, vehicles, toys and gadgets that make every scene richer
 * Item kinds below can be mission targets; DECOR is scenery only.
 */

const gen = (generationId: string, prompt: string, reference: string): ItemKind['rodin'] => ({
  generationId,
  tier: 'Gen-2.5-High',
  prompt,
  reference: `Fluent Emoji 3D "${reference}" (MIT), via the Rodin REST API`,
});

const kind = (
  group: string,
  id: string,
  p: { name: string; plural?: string; synonyms: string[]; zh: string; emoji: string; color: ColorName; footprint: number; interest?: InterestId | 'everyday'; levels: string[]; sized?: boolean; rodin: ItemKind['rodin'] },
): ItemKind => ({
  id,
  name: p.name,
  plural: p.plural ?? `${p.name}s`,
  synonyms: [...new Set([...p.synonyms, p.name, p.plural ?? `${p.name}s`])],
  zh: p.zh,
  interest: p.interest ?? 'everyday',
  emoji: p.emoji,
  model: `/models/${group}/${id}.glb`,
  ref: `/models/${group}/${id}.png`,
  baseColor: p.color,
  footprint: p.footprint,
  levels: p.levels,
  sized: p.sized,
  source: 'rodin',
  rodin: p.rodin,
});

const pet = (id: string, p: Omit<Parameters<typeof kind>[2], 'levels' | 'interest'> & { levels?: string[] }) => kind('pets', id, { interest: 'animals', levels: ['pets', ...(p.levels ?? [])], ...p });
const street = (id: string, p: Omit<Parameters<typeof kind>[2], 'levels' | 'interest'>) => kind('nightmarket', id, { interest: 'food', levels: ['nightmarket'], ...p });
const menu = (id: string, p: Omit<Parameters<typeof kind>[2], 'levels' | 'interest'>) => kind('cafe', id, { interest: 'food', levels: ['cafe'], ...p });

export const WAVE4_KINDS: ItemKind[] = [
  // --- Pet Shop -------------------------------------------------------------
  pet('puppy', { name: 'puppy', plural: 'puppies', synonyms: ['puppy', 'puppies', 'dog', 'dogs', 'doggy'], zh: '小狗/狗', emoji: '🐶', color: 'yellow', footprint: 0.34, rodin: gen('a0e227e8-9281-47ec-9381-b7643808701e', 'A cute golden puppy standing on four legs, side view, stylized 3D toy figure', 'Dog') }),
  pet('kitten', { name: 'kitten', synonyms: ['kitten', 'kittens', 'cat', 'cats', 'kitty'], zh: '小猫/猫', emoji: '🐱', color: 'orange', footprint: 0.32, rodin: gen('60b17b92-15bf-4063-9050-e70344375471', 'A cute orange tabby kitten standing on four legs, stylized 3D toy figure', 'Cat') }),
  pet('bunny', { name: 'bunny', plural: 'bunnies', synonyms: ['bunny', 'bunnies', 'rabbit', 'rabbits'], zh: '兔子/小兔子', emoji: '🐰', color: 'white', footprint: 0.3, rodin: gen('cc6ff20e-cebd-405d-a04d-bd095e9de65b', 'A cute white bunny rabbit sitting, long ears, stylized 3D toy figure', 'Rabbit') }),
  pet('pig', { name: 'pig', synonyms: ['piglet', 'piglets', 'pig', 'pigs', 'mini pig', 'piggy'], zh: '小猪/猪', emoji: '🐷', color: 'pink', footprint: 0.32, rodin: gen('ee984885-b2f8-4afa-bfe8-80736ee24f38', 'A cute pink mini pig standing on four legs, stylized 3D toy figure', 'Pig') }),
  pet('parrot', { name: 'parrot', synonyms: ['parrot', 'parrots', 'bird', 'birds'], zh: '鹦鹉', emoji: '🦜', color: 'red', footprint: 0.32, rodin: gen('53d91258-51fc-4847-983e-4a0e4ca3beee', 'A cute colorful parrot standing on its feet, stylized 3D toy figure', 'Parrot') }),
  pet('turtle', { name: 'turtle', synonyms: ['turtle', 'turtles', 'tortoise'], zh: '乌龟', emoji: '🐢', color: 'green', footprint: 0.32, rodin: gen('b3e8ac1a-efe1-4043-a79b-2866257e4b36', 'A cute green turtle with a round shell, stylized 3D toy figure', 'Turtle') }),
  pet('hedgehog', { name: 'hedgehog', synonyms: ['hedgehog', 'hedgehogs'], zh: '刺猬', emoji: '🦔', color: 'brown', footprint: 0.3, rodin: gen('fe216fcc-d518-43f6-b349-ccccfe4b9aec', 'A cute brown hedgehog with soft spikes, stylized 3D toy figure', 'Hedgehog') }),
  pet('mouse', { name: 'mouse', plural: 'mice', synonyms: ['mouse', 'mice', 'hamster', 'hamsters'], zh: '老鼠/小鼠/仓鼠', emoji: '🐭', color: 'white', footprint: 0.28, rodin: gen('da106bf8-67be-493f-8a9f-5a613588e8d2', 'A cute grey pet mouse with a pink tail, stylized 3D toy figure', 'Mouse') }),
  pet('chick', { name: 'chick', synonyms: ['chick', 'chicks', 'baby chick', 'baby chicks'], zh: '小鸡', emoji: '🐤', color: 'yellow', footprint: 0.26, rodin: gen('995f2769-bf31-4109-85c3-a3e15c529a0e', 'A cute fluffy yellow baby chick, stylized 3D toy figure', 'Baby chick') }),
  pet('duck', { name: 'duck', synonyms: ['duck', 'ducks', 'duckling'], zh: '鸭子/小鸭', emoji: '🦆', color: 'green', footprint: 0.32, rodin: gen('89fd0f2a-e127-4ab0-b8b8-1f96889faa74', 'A cute mallard duck with a green head, stylized 3D toy figure', 'Duck') }),

  // --- Night Market (order engine) ---------------------------------------------
  street('dumpling', { name: 'dumpling', synonyms: ['dumpling', 'dumplings', 'jiaozi', 'steamed dumpling'], zh: '饺子', emoji: '🥟', color: 'yellow', footprint: 0.22, rodin: gen('a99c5b41-6647-46c4-8167-437df93e35b2', 'A cute steamed Chinese dumpling sitting on its flat bottom, pleated crest on top, stylized 3D toy style', 'Dumpling') }),
  street('noodles', { name: 'bowl of noodles', plural: 'bowls of noodles', synonyms: ['bowl of noodles', 'bowls of noodles', 'noodle soup', 'noodles', 'noodle', 'ramen'], zh: '面条/一碗面/面', emoji: '🍜', color: 'red', footprint: 0.28, rodin: gen('aaa99456-4afd-48d3-82dc-5f196e9b52ce', 'A red bowl of noodle soup with chopsticks, stylized 3D toy style', 'Steaming bowl') }),
  street('chicken-leg', { name: 'chicken leg', synonyms: ['chicken leg', 'chicken legs', 'fried chicken', 'drumstick', 'drumsticks', 'chicken'], zh: '鸡腿/炸鸡', emoji: '🍗', color: 'orange', footprint: 0.26, rodin: gen('166b0831-eeff-466d-a371-46ffae5017b1', 'A golden fried chicken leg lying on its side, stylized 3D toy style', 'Poultry leg') }),
  street('skewer', { name: 'skewer', synonyms: ['skewer', 'skewers', 'kebab', 'kebabs', 'stick', 'fish ball', 'fish balls'], zh: '串/烤串/串串', emoji: '🍢', color: 'purple', footprint: 0.28, rodin: gen('311324ad-92ad-40df-bfe8-6fdf3f5c881a', 'A street food skewer with balls and a triangle cake on a wooden stick, lying flat, stylized 3D toy style', 'Oden') }),
  street('sweet-potato', { name: 'sweet potato', plural: 'sweet potatoes', synonyms: ['roasted sweet potato', 'roasted sweet potatoes', 'sweet potatoes', 'sweet potato', 'yam', 'yams'], zh: '烤红薯/红薯/地瓜', emoji: '🍠', color: 'red', footprint: 0.28, rodin: gen('c8a76f98-fcb9-4bd7-90e2-f7b706c97c86', 'A roasted sweet potato lying on its side, stylized 3D toy style', 'Roasted sweet potato') }),
  street('corn', { name: 'ear of corn', plural: 'ears of corn', synonyms: ['corn on the cob', 'grilled corn', 'ears of corn', 'ear of corn', 'corncob', 'corn'], zh: '玉米/烤玉米', emoji: '🌽', color: 'yellow', footprint: 0.28, rodin: gen('5ac78ca3-cb6b-42bf-98c5-c0f221b5d22e', 'A grilled ear of corn with green husk leaves, lying on its side, stylized 3D toy style', 'Ear of corn') }),
  street('mooncake', { name: 'mooncake', synonyms: ['mooncake', 'mooncakes', 'moon cake', 'moon cakes'], zh: '月饼', emoji: '🥮', color: 'brown', footprint: 0.24, rodin: gen('e1711396-acb2-416c-9a04-b7db49c5137d', 'A round golden Chinese mooncake with a pattern on top, stylized 3D toy style', 'Moon cake') }),
  street('chestnut', { name: 'bag of chestnuts', plural: 'bags of chestnuts', synonyms: ['bag of chestnuts', 'bags of chestnuts', 'roasted chestnuts', 'chestnuts', 'chestnut'], zh: '糖炒栗子/栗子', emoji: '🌰', color: 'brown', footprint: 0.22, rodin: gen('c91ed008-3cfa-4207-ad14-0228df624654', 'A shiny roasted chestnut, stylized 3D toy style', 'Chestnut') }),
  street('tea-egg', { name: 'tea egg', synonyms: ['tea egg', 'tea eggs', 'egg', 'eggs'], zh: '茶叶蛋/鸡蛋', emoji: '🥚', color: 'brown', footprint: 0.18, rodin: gen('f4a003ae-4e93-41f7-bc96-1f9d0d61079a', 'A brown tea egg standing upright, stylized 3D toy style', 'Egg') }),
  street('shaved-ice', { name: 'shaved ice', plural: 'shaved ices', synonyms: ['shaved ice', 'shaved ices', 'snow cone', 'snow cones', 'ice dessert'], zh: '刨冰/雪花冰', emoji: '🍧', color: 'pink', footprint: 0.24, rodin: gen('8ac8e537-288d-44a5-b16b-6be4d947af47', 'A pink shaved ice dessert in a blue paper cone with a spoon, stylized 3D toy style', 'Shaved ice') }),
  street('bubble-tea', { name: 'bubble tea', plural: 'bubble teas', synonyms: ['bubble tea', 'bubble teas', 'boba', 'milk tea', 'milk teas', 'pearl milk tea'], zh: '奶茶/珍珠奶茶', emoji: '🧋', color: 'brown', footprint: 0.26, sized: true, rodin: gen('ce5b8aab-4f84-4ffe-ba05-ae69f45cd9a1', 'A plastic cup of bubble milk tea with tapioca pearls and a straw, stylized 3D toy style', 'Bubble tea') }),
  street('soy-milk', { name: 'soy milk', plural: 'soy milks', synonyms: ['soy milk', 'soy milks', 'soya milk', 'soymilk', 'milk'], zh: '豆浆', emoji: '🥛', color: 'white', footprint: 0.24, sized: true, rodin: gen('16e4f844-5b05-40e2-9276-fbd4f238cfb4', 'A tall glass of white soy milk, stylized 3D toy style', 'Glass of milk') }),

  // --- Corner Café: more on the menu ---------------------------------------------
  menu('pancakes', { name: 'stack of pancakes', plural: 'stacks of pancakes', synonyms: ['stack of pancakes', 'stacks of pancakes', 'pancakes', 'pancake'], zh: '松饼/煎饼/薄煎饼', emoji: '🥞', color: 'yellow', footprint: 0.26, rodin: gen('671eda89-e9e7-477e-877a-e8b9c9703183', 'A stack of pancakes with butter and syrup on a plate, stylized 3D toy style', 'Pancakes') }),
  menu('waffle', { name: 'waffle', synonyms: ['waffle', 'waffles'], zh: '华夫饼', emoji: '🧇', color: 'yellow', footprint: 0.26, rodin: gen('82ee7d38-e2ea-4861-9fa2-ce453c8494bd', 'A golden square waffle with butter, stylized 3D toy style', 'Waffle') }),
  menu('cookie', { name: 'cookie', synonyms: ['cookie', 'cookies', 'chocolate chip cookie', 'biscuit', 'biscuits'], zh: '曲奇/饼干', emoji: '🍪', color: 'brown', footprint: 0.22, rodin: gen('072d4af2-35af-4a62-a438-23e9eadf7e65', 'A round chocolate chip cookie, stylized 3D toy style', 'Cookie') }),
  menu('pudding', { name: 'pudding', synonyms: ['pudding', 'puddings', 'custard', 'flan', 'caramel pudding'], zh: '布丁', emoji: '🍮', color: 'yellow', footprint: 0.24, rodin: gen('eefae296-33a8-4165-b113-ea5bac4431bc', 'A caramel custard pudding on a small plate, stylized 3D toy style', 'Custard') }),
  menu('hot-dog', { name: 'hot dog', synonyms: ['hot dog', 'hot dogs', 'hotdog', 'hotdogs', 'sausage'], zh: '热狗', emoji: '🌭', color: 'red', footprint: 0.28, rodin: gen('fba0aa19-100e-4a12-a919-a519fbad1427', 'A hot dog in a bun with a mustard zigzag, lying horizontally, stylized 3D toy style', 'Hot dog') }),
  menu('spaghetti', { name: 'plate of spaghetti', plural: 'plates of spaghetti', synonyms: ['plate of spaghetti', 'plates of spaghetti', 'spaghetti', 'pasta'], zh: '意大利面/意面', emoji: '🍝', color: 'yellow', footprint: 0.28, rodin: gen('e824a5cc-ef4a-4590-9a32-a51ab741f6fa', 'A plate of spaghetti with tomato sauce and a fork, stylized 3D toy style', 'Spaghetti') }),
  menu('salad', { name: 'salad', synonyms: ['salad', 'salads', 'green salad', 'bowl of salad'], zh: '沙拉', emoji: '🥗', color: 'green', footprint: 0.26, rodin: gen('dcbb917c-85e2-40a3-8e27-80f21667903b', 'A bowl of green salad with tomatoes and egg, stylized 3D toy style', 'Green salad') }),
  menu('pretzel', { name: 'pretzel', synonyms: ['pretzel', 'pretzels'], zh: '椒盐卷饼/扭结饼', emoji: '🥨', color: 'brown', footprint: 0.26, rodin: gen('0e43536d-d087-4860-97db-2417333bc794', 'A golden salted pretzel, stylized 3D toy style', 'Pretzel') }),
  menu('taco', { name: 'taco', synonyms: ['taco', 'tacos'], zh: '塔可/墨西哥卷饼', emoji: '🌮', color: 'yellow', footprint: 0.26, rodin: gen('ab1db9c4-b8d9-4acb-8f3e-757248d561e1', 'A crunchy taco with lettuce and tomato, stylized 3D toy style', 'Taco') }),
];

/** Scenery Rodin models (never mission targets), by name. */
const d = (id: string) => `/models/decor/${id}.glb`;
export const DECOR = {
  cactus: d('cactus'),
  tulip: d('tulip'),
  sunflower: d('sunflower'),
  rose: d('rose'),
  seedling: d('seedling'),
  pineTree: d('pine-tree'),
  bicycle: d('bicycle'),
  car: d('car'),
  bus: d('bus'),
  taxi: d('taxi'),
  postbox: d('postbox'),
  motorScooter: d('motor-scooter'),
  truck: d('truck'),
  ambulance: d('ambulance'),
  shoppingCart: d('shopping-cart'),
  kickScooter: d('kick-scooter'),
  balloon: d('balloon'),
  kite: d('kite'),
  soccerBall: d('soccer-ball'),
  basketball: d('basketball'),
  basket: d('basket'),
  bucket: d('bucket'),
  umbrella: d('umbrella'),
  gift: d('gift'),
  trophy: d('trophy'),
  candle: d('candle'),
  laptop: d('laptop'),
  television: d('television'),
  radio: d('radio'),
  telephone: d('telephone'),
  mantelClock: d('mantel-clock'),
  picture: d('picture'),
  chair: d('chair'),
  suitcase: d('suitcase'),
  handbag: d('handbag'),
  dice: d('dice'),
  lantern: d('lantern'),
  bird: d('bird'),
  swan: d('swan'),
  tropicalFish: d('tropical-fish'),
  fish: d('fish'),
  snail: d('snail'),
  // pets double as scenery elsewhere (a cat in the café, a dog in the town)
  kitten: '/models/pets/kitten.glb',
  puppy: '/models/pets/puppy.glb',
  duck: '/models/pets/duck.glb',
  parrot: '/models/pets/parrot.glb',
  turtle: '/models/pets/turtle.glb',
} as const;

/** Generation records of the scenery models (for the Rodin manifest and the credits page). */
export const DECOR_GENERATIONS: Record<string, string> = {
  cactus: '5d16458d-cc65-425d-a293-b5f5ddb5a504',
  tulip: '7bf76722-f1f3-448c-b3e7-647aed613689',
  sunflower: 'e65b7ff2-aec2-4f67-9c1d-97158b43d685',
  rose: '53df140d-8d6f-4b07-8592-b31bbb428232',
  seedling: '0f6eac08-7e00-408d-a8c1-354cda341233',
  'pine-tree': 'a879e205-0c80-4b55-b4c3-d237957dfece',
  bicycle: 'e63b3ba1-c73e-49f3-95ab-c5725a146e06',
  car: '09bfc069-da88-44be-b9a3-cdf33b5c1edf',
  bus: '1b2563a8-cad7-43bd-94e1-5398a5a3b503',
  taxi: '931f3b69-d614-45b5-b2fa-f2ec1b0fdc20',
  postbox: 'a2c97b6e-328d-4892-9402-f5fe765220c4',
  'motor-scooter': '63b9c205-f6d8-459b-94ae-700f8b288791',
  truck: '4dd74d19-2cd2-4075-be50-3814c77665e4',
  ambulance: 'd1991818-f4e4-4029-9020-67ec24af2185',
  'shopping-cart': '0ac1ee3f-c9e2-445a-9ec7-a0beb9caabaf',
  'kick-scooter': '156512b9-726b-4218-bffd-2debacbac44e',
  balloon: '39f02d3a-1ee1-4936-b5ab-0d3e7b893e1f',
  kite: '64632276-6328-4f5a-949e-dff243c789bc',
  'soccer-ball': '50b957c0-3a18-4c6e-af3c-678c4a4a4a77',
  basketball: '1d0f0b83-6d44-449b-828b-3d6ddd4f0955',
  basket: '7b9ebe25-ded2-4f4a-818c-472fa4a87375',
  bucket: '3a5843d4-cf5c-4606-8b36-b93e3d71787f',
  umbrella: '8b5d48b6-8a73-45e9-af0f-b58e68c02539',
  gift: '6178edbe-2fb1-44e6-b5a1-5ebfb766f246',
  trophy: 'e6580193-4ca2-48c0-8af7-385507d0f108',
  candle: 'e13d0424-8cea-4ce8-85d2-67652fec106e',
  laptop: '9a69f989-dfed-49c7-b6de-a4376910425a',
  television: 'e4dba3f7-17d1-42bb-b892-8c2991b86966',
  radio: '18f1908f-24b9-4da6-9d4e-6af55d7f6193',
  telephone: '2da4234d-d047-4002-a559-33045c435e45',
  'mantel-clock': 'b72b7e17-bcb9-4cb8-86fe-a0628cd51374',
  picture: '5d124410-0632-454a-86fa-ad8b7ed3f301',
  chair: '053d0518-bbef-4f79-8fe8-9ef5d38b64f7',
  suitcase: 'e60aa618-088c-4639-b4f7-3318dcf0dfd3',
  handbag: '11926b76-8b5b-4c71-bd8c-246d833dd7f5',
  dice: '429aff66-9ec5-4f09-8eba-da0c7bc1b9fa',
  lantern: '0e19e75c-5a1e-475e-9211-e71e112c0304',
  bird: 'fe0adf0d-d622-45d7-8770-65e177729290',
  swan: 'cfb1502e-ee99-4c56-bcf4-f4c8fce3b011',
  'tropical-fish': 'a423b2c7-52a6-4641-a10a-91016e95fb8d',
  fish: '409018a7-7538-4bfa-a612-90dc7411f7a0',
  snail: 'e7370da0-8fc0-48a1-aee6-3542f2127944',
};
