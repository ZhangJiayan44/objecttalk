import type { InterestId, ItemKind, Landmark, LandmarkKind } from './types';

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
const registry = new Map<string, ItemKind>(BUILTIN_KINDS.map((k) => [k.id, k]));

export function registerKinds(kinds: ItemKind[]) {
  for (const k of kinds) registry.set(k.id, k);
}

export function getKind(id: string): ItemKind | undefined {
  return registry.get(id);
}

export function allKinds(): ItemKind[] {
  return [...registry.values()];
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
