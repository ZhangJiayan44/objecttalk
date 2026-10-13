import type { InterestId, ItemKind, Landmark, LandmarkKind } from './types';
import { WAVE4_KINDS } from './wave4';
import { withZh } from './zh';

/**
 * Built-in object catalog. The five hero items were generated with Hyper3D
 * Rodin Gen-2.5 (image-to-3D) from Microsoft Fluent Emoji 3D reference images,
 * then optimized with scripts/optimize-models.ts. Generation records live in
 * assets/rodin/manifest.json. Runtime-generated items (Object Studio / agent)
 * are merged in from data/items.json via /api/items.
 */
export const BUILTIN_KINDS: ItemKind[] = [
  {
    id: 'rocket',
    name: 'rocket',
    plural: 'rockets',
    synonyms: ['rocket ship', 'rocket', 'spaceship', 'space ship', 'spacecraft'],
    interest: 'space',
    emoji: '🚀',
    model: '/models/rocket.glb',
    ref: '/refs/rocket.png',
    baseColor: 'white',
    footprint: 0.36,
    source: 'rodin',
    rodin: {
      generationId: 'b0b3ebca-979c-4049-bcbe-0d2a2cade86b',
      tier: 'Gen-2.5-High',
      prompt: 'A cute cartoon toy rocket standing upright, glossy white body, red nose cone and red fins',
      reference: 'Fluent Emoji 3D "Rocket" (MIT), rotated upright',
    },
  },
  {
    id: 'teddy',
    name: 'teddy bear',
    plural: 'teddy bears',
    synonyms: ['teddy bear', 'teddy', 'bear', 'plush', 'stuffed bear', 'stuffed animal', 'toy bear'],
    interest: 'animals',
    emoji: '🧸',
    model: '/models/teddy_bear.glb',
    ref: '/refs/teddy_bear.png',
    baseColor: 'brown',
    footprint: 0.34,
    levels: ['study', 'bedroom'],
    source: 'rodin',
    rodin: {
      generationId: 'd2b71161-a27a-448b-93bc-cbbed50cea45',
      tier: 'Gen-2.5-High',
      prompt: 'A cute sitting teddy bear plush toy, soft orange-brown body, round ears',
      reference: 'Fluent Emoji 3D "Teddy bear" (MIT)',
    },
  },
  {
    id: 'cupcake',
    name: 'cupcake',
    plural: 'cupcakes',
    synonyms: ['cupcake', 'cup cake', 'muffin', 'cake'],
    interest: 'food',
    emoji: '🧁',
    model: '/models/cupcake.glb',
    ref: '/refs/cupcake.png',
    baseColor: 'pink',
    footprint: 0.3,
    levels: ['study', 'cafe'],
    source: 'rodin',
    rodin: {
      generationId: 'adcfcb14-d4fb-4cc8-8c32-62c762475518',
      tier: 'Gen-2.5-High',
      prompt: 'A cute cupcake with swirled pink frosting and colorful sprinkles in a ribbed blue paper cup',
      reference: 'Fluent Emoji 3D "Cupcake" (MIT)',
    },
  },
  {
    id: 'sneaker',
    name: 'sneaker',
    plural: 'sneakers',
    synonyms: ['running shoe', 'sneaker', 'shoe', 'trainer', 'sports shoe'],
    interest: 'sports',
    emoji: '👟',
    model: '/models/sneaker.glb',
    ref: '/refs/sneaker.png',
    baseColor: 'purple',
    footprint: 0.4,
    levels: ['study', 'bedroom'],
    source: 'rodin',
    rodin: {
      generationId: '72eac080-bff7-408c-86ec-7dc0ac721f81',
      tier: 'Gen-2.5-High',
      prompt: 'A cute stylized running shoe sneaker, light lavender and white upper with purple side stripes',
      reference: 'Fluent Emoji 3D "Running shoe" (MIT), sole levelled',
    },
  },
  {
    id: 'controller',
    name: 'game controller',
    plural: 'game controllers',
    synonyms: ['game controller', 'video game controller', 'controller', 'gamepad', 'game pad', 'joystick', 'joypad'],
    interest: 'games',
    emoji: '🎮',
    model: '/models/game_controller.glb',
    ref: '/refs/game_controller.png',
    baseColor: 'purple',
    // Rodin produced it standing up (face toward +Z); lay it face-up on the table.
    rotation: [-Math.PI / 2, 0, 0],
    footprint: 0.38,
    levels: ['study', 'bedroom'],
    source: 'rodin',
    rodin: {
      generationId: 'd025ef10-aa6b-47ba-88d2-d3332fd90269',
      tier: 'Gen-2.5-High',
      prompt: 'A cute stylized purple game controller gamepad with two thumbsticks, a D-pad and four colorful buttons',
      reference: 'Fluent Emoji 3D "Video game" (MIT)',
    },
  },
  {
    id: 'mug',
    name: 'mug',
    plural: 'mugs',
    synonyms: ['coffee mug', 'coffee cup', 'mug', 'cup', 'tea cup', 'teacup'],
    interest: 'everyday',
    emoji: '☕',
    procedural: 'mug',
    baseColor: 'red',
    colorVariants: ['red', 'blue', 'yellow', 'green'],
    footprint: 0.22,
    source: 'procedural',
  },
];

/** Generation record helper: every extra kind below was made with Rodin Gen-2.5-High via the Hyper3D MCP. */
const rodin = (generationId: string, prompt: string, reference: string): ItemKind['rodin'] => ({
  generationId,
  tier: 'Gen-2.5-High',
  prompt,
  reference: `Fluent Emoji 3D "${reference}" (MIT)`,
});

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0];

/**
 * Second wave of Rodin objects (2026-10-13): extra desk items, the cafe menu
 * and bedroom belongings. `levels` decides where each one can appear.
 */
export const EXTRA_KINDS: ItemKind[] = [
  // --- desk / bedroom belongings --------------------------------------------
  { id: 'camera', name: 'camera', plural: 'cameras', synonyms: ['camera', 'photo camera'], interest: 'everyday', emoji: '📷', model: '/models/camera.glb', baseColor: 'white', footprint: 0.3, levels: ['study', 'bedroom'], source: 'rodin', rodin: rodin('89d3c4bd-ed8d-4c4d-a603-2495fce3bec5', 'A cute retro camera with a grey body and a big black lens', 'Camera') },
  { id: 'alarm', name: 'alarm clock', plural: 'alarm clocks', synonyms: ['alarm clock', 'clock', 'alarm'], interest: 'everyday', emoji: '⏰', model: '/models/alarm_clock.glb', baseColor: 'red', footprint: 0.26, levels: ['study', 'bedroom'], source: 'rodin', rodin: rodin('b0bbc3be-6eb9-45d6-9f9c-c4f4ddb623b8', 'A cute red twin-bell alarm clock with yellow bells', 'Alarm clock') },
  { id: 'headphones', name: 'headphones', plural: 'headphones', synonyms: ['headphones', 'headphone', 'headset', 'earphones'], interest: 'games', emoji: '🎧', model: '/models/headphones.glb', baseColor: 'white', footprint: 0.3, levels: ['study', 'bedroom'], source: 'rodin', rodin: rodin('b52eed6c-1f29-46b4-baf9-88310cb257cf', 'Cute white over-ear headphones', 'Headphone') },
  { id: 'glasses', name: 'glasses', plural: 'glasses', synonyms: ['pair of glasses', 'glasses', 'spectacles', 'specs', 'sunglasses'], interest: 'everyday', emoji: '👓', model: '/models/glasses.glb', baseColor: 'blue', footprint: 0.26, levels: ['study', 'bedroom'], source: 'rodin', rodin: rodin('550e1a4a-7090-464a-91e7-28ed6c806a1c', 'A cute pair of glasses with dark purple frames', 'Glasses') },
  { id: 'watch', name: 'watch', plural: 'watches', synonyms: ['wristwatch', 'watch'], interest: 'everyday', emoji: '⌚', model: '/models/watch.glb', baseColor: 'blue', rotation: FLAT, footprint: 0.24, levels: ['study', 'bedroom'], source: 'rodin', rodin: rodin('311f47cc-c5e3-4e46-8bb9-eb31542b973b', 'A cute wristwatch with a purple round face and a blue strap', 'Watch') },
  { id: 'cap', name: 'cap', plural: 'caps', synonyms: ['baseball cap', 'cap', 'hat'], interest: 'sports', emoji: '🧢', model: '/models/cap.glb', baseColor: 'blue', footprint: 0.32, levels: ['study', 'bedroom'], source: 'rodin', rodin: rodin('a2f8b878-d41f-477f-85fe-dbfddd2c2e7f', 'A cute blue baseball cap', 'Billed cap') },
  { id: 'key', name: 'key', plural: 'keys', synonyms: ['house key', 'keys', 'key'], interest: 'everyday', emoji: '🔑', model: '/models/key.glb', baseColor: 'yellow', rotation: FLAT, footprint: 0.24, levels: ['bedroom'], source: 'rodin', rodin: rodin('2c0857b2-dcc8-43f0-aa0e-7f38ede39ad7', 'A cute yellow metal house key', 'Key') },
  { id: 'phone', name: 'phone', plural: 'phones', synonyms: ['mobile phone', 'cell phone', 'smartphone', 'phone', 'mobile'], interest: 'everyday', emoji: '📱', model: '/models/phone.glb', baseColor: 'purple', rotation: FLAT, footprint: 0.22, levels: ['bedroom'], source: 'rodin', rodin: rodin('523025d6-497c-451e-ac97-4d0d0ff73c48', 'A cute purple smartphone with colorful app icons', 'Mobile phone') },
  { id: 'backpack', name: 'backpack', plural: 'backpacks', synonyms: ['school bag', 'backpack', 'rucksack', 'bag'], interest: 'everyday', emoji: '🎒', model: '/models/backpack.glb', baseColor: 'pink', footprint: 0.5, levels: ['bedroom'], source: 'rodin', rodin: rodin('8b88f6fb-8816-4d6b-a9c4-c42ca72bbf6e', 'A cute pink school backpack with a yellow handle', 'Backpack') },
  // --- cafe menu ------------------------------------------------------------
  { id: 'coffee', name: 'coffee', plural: 'coffees', synonyms: ['cups of coffee', 'cup of coffee', 'coffees', 'coffee', 'latte', 'cappuccino', 'americano', 'mocha', 'tea'], interest: 'food', emoji: '☕', model: '/models/coffee.glb', baseColor: 'purple', footprint: 0.24, sized: true, levels: ['cafe'], source: 'rodin', rodin: rodin('d4f5ff83-4cc9-4c53-904d-54af09236429', 'A cute lavender ceramic coffee cup on a saucer', 'Hot beverage') },
  { id: 'soda', name: 'soda', plural: 'sodas', synonyms: ['soft drinks', 'soft drink', 'cola', 'coke', 'sodas', 'soda', 'juice', 'drinks', 'drink'], interest: 'food', emoji: '🥤', model: '/models/soda.glb', baseColor: 'red', footprint: 0.26, sized: true, levels: ['cafe'], source: 'rodin', rodin: rodin('9db44434-39d3-4347-abf3-54b9ba841f86', 'A cute paper soda cup with a red stripe and a straw', 'Cup with straw') },
  { id: 'doughnut', name: 'doughnut', plural: 'doughnuts', synonyms: ['chocolate doughnut', 'chocolate donut', 'doughnuts', 'doughnut', 'donuts', 'donut'], interest: 'food', emoji: '🍩', model: '/models/doughnut.glb', baseColor: 'brown', footprint: 0.22, levels: ['cafe'], source: 'rodin', rodin: rodin('9f0fbf09-c452-4a74-9a75-ff9d6732e12e', 'A cute chocolate glazed doughnut with sprinkles', 'Doughnut') },
  { id: 'croissant', name: 'croissant', plural: 'croissants', synonyms: ['croissants', 'croissant'], interest: 'food', emoji: '🥐', model: '/models/croissant.glb', baseColor: 'orange', rotation: FLAT, footprint: 0.26, levels: ['cafe'], source: 'rodin', rodin: rodin('a21a2bb1-4d45-4285-92a4-e08337b4a66d', 'A cute golden flaky croissant', 'Croissant') },
  { id: 'pizza', name: 'slice of pizza', plural: 'slices of pizza', synonyms: ['slices of pizza', 'slice of pizza', 'pizza slices', 'pizza slice', 'pieces of pizza', 'piece of pizza', 'pizzas', 'pizza'], interest: 'food', emoji: '🍕', model: '/models/pizza.glb', baseColor: 'yellow', rotation: FLAT, footprint: 0.26, levels: ['cafe'], source: 'rodin', rodin: rodin('1303a48f-f3da-4037-ad9e-90522e01bee6', 'A cute slice of pepperoni pizza', 'Pizza') },
  { id: 'burger', name: 'burger', plural: 'burgers', synonyms: ['cheeseburgers', 'cheeseburger', 'hamburgers', 'hamburger', 'burgers', 'burger'], interest: 'food', emoji: '🍔', model: '/models/hamburger.glb', baseColor: 'brown', footprint: 0.26, levels: ['cafe'], source: 'rodin', rodin: rodin('cdad0523-dfc2-474d-956e-dfbe14248bb9', 'A cute hamburger with sesame bun, lettuce and cheese', 'Hamburger') },
  { id: 'sandwich', name: 'sandwich', plural: 'sandwiches', synonyms: ['sandwiches', 'sandwich'], interest: 'food', emoji: '🥪', model: '/models/sandwich.glb', baseColor: 'yellow', footprint: 0.26, levels: ['cafe'], source: 'rodin', rodin: rodin('044e9182-c5a1-4769-9129-5a69ebfac34f', 'A cute triangle sandwich with lettuce and tomato', 'Sandwich') },
  { id: 'cake', name: 'slice of cake', plural: 'slices of cake', synonyms: ['slices of cake', 'slice of cake', 'pieces of cake', 'piece of cake', 'strawberry cake', 'shortcake', 'cakes', 'cake'], interest: 'food', emoji: '🍰', model: '/models/shortcake.glb', baseColor: 'pink', footprint: 0.26, levels: ['cafe'], source: 'rodin', rodin: rodin('0ecbd693-a2ea-443e-9577-b38fd2a7056e', 'A cute slice of strawberry shortcake', 'Shortcake') },
  { id: 'icecream', name: 'ice cream', plural: 'ice creams', synonyms: ['ice cream cones', 'ice cream cone', 'ice creams', 'ice cream', 'cones', 'cone', 'soft serve'], interest: 'food', emoji: '🍦', model: '/models/ice_cream.glb', baseColor: 'white', footprint: 0.26, levels: ['cafe'], source: 'rodin', rodin: rodin('cc0bc9b1-a89c-4595-8c17-06a497c8dda5', 'A cute vanilla soft serve ice cream cone', 'Soft ice cream') },
];

/** Decor-only Rodin models (never mission targets). */
export const DECOR_MODELS = {
  plant: '/models/potted_plant.glb',
  books: '/models/books.glb',
} as const;

export const INTERESTS: { id: InterestId; label: string; emoji: string; kind: string }[] = [
  { id: 'space', label: 'Space', emoji: '🚀', kind: 'rocket' },
  { id: 'animals', label: 'Animals', emoji: '🧸', kind: 'teddy' },
  { id: 'food', label: 'Food', emoji: '🧁', kind: 'cupcake' },
  { id: 'sports', label: 'Sports', emoji: '👟', kind: 'sneaker' },
  { id: 'games', label: 'Games', emoji: '🎮', kind: 'controller' },
];

/** Fixed table furniture. Names double as the words players use for them. */
export const LANDMARK_DEFS: Record<LandmarkKind, Omit<Landmark, 'id' | 'cell'> & { synonyms: string[] }> = {
  lamp: { kind: 'lamp', name: 'lamp', color: 'yellow', synonyms: ['desk lamp', 'yellow lamp', 'lamp', 'light'] },
  plant: { kind: 'plant', name: 'plant', color: 'green', synonyms: ['potted plant', 'green plant', 'plant', 'flower pot', 'pot', 'flower'] },
  redBook: { kind: 'redBook', name: 'red book', color: 'red', synonyms: ['red book', 'red books'] },
  blueBook: { kind: 'blueBook', name: 'blue book', color: 'blue', synonyms: ['blue book', 'blue books'] },
};

/** Mutable registry so runtime-generated kinds can be merged in on both ends. */
const registry = new Map<string, ItemKind>([...BUILTIN_KINDS, ...EXTRA_KINDS, ...WAVE4_KINDS].map((k) => [k.id, withZh(k)]));

export function registerKinds(kinds: ItemKind[]) {
  for (const k of kinds) registry.set(k.id, withZh(k));
}

export function getKind(id: string): ItemKind | undefined {
  return registry.get(id);
}

export function allKinds(): ItemKind[] {
  return [...registry.values()];
}

/** Item kinds that can appear in a given level. */
export function kindsFor(level: string): ItemKind[] {
  return allKinds().filter((k) => (k.levels ?? ['study']).includes(level));
}

/** Human name for an entity kind (item kind id or landmark kind). */
export function kindName(kind: string): string {
  const item = registry.get(kind);
  if (item) return item.name;
  const lm = (LANDMARK_DEFS as Record<string, { name: string } | undefined>)[kind];
  return lm?.name ?? kind;
}

export function kindPlural(kind: string): string {
  return registry.get(kind)?.plural ?? `${kindName(kind)}s`;
}
