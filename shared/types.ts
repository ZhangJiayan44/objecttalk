/**
 * Core domain types shared by the server (authoritative game state) and the
 * client (rendering + local AI preview). Keep this file dependency-free.
 */

/** The two asymmetric roles. The guide sees the goal; the builder moves things. */
export type Role = 'guide' | 'builder';

export const ROLES: readonly Role[] = ['guide', 'builder'] as const;

export const otherRole = (r: Role): Role => (r === 'guide' ? 'builder' : 'guide');

export type ColorName = 'red' | 'blue' | 'yellow' | 'green' | 'pink' | 'purple' | 'orange' | 'white' | 'brown';

export const COLOR_HEX: Record<ColorName, string> = {
  red: '#f25f5c',
  blue: '#4f8ef7',
  yellow: '#ffd166',
  green: '#3fbf7f',
  pink: '#ff8fb8',
  purple: '#9b7bf2',
  orange: '#ff9f43',
  white: '#f4f4f4',
  brown: '#a9744f',
};

/** Size adjectives used to tell duplicates apart. `regular` is never spoken. */
export type SizeName = 'small' | 'regular' | 'big';

export type InterestId = 'space' | 'animals' | 'food' | 'sports' | 'games';

/** A grid cell on the table. `c` grows toward +x (east), `r` grows toward +z (south). */
export interface Cell {
  c: number;
  r: number;
}

export const cellKey = (cell: Cell) => `${cell.c},${cell.r}`;
export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined) =>
  !!a && !!b && a.c === b.c && a.r === b.r;

/** Static definition of something that can appear on the table. */
export interface ItemKind {
  id: string;
  name: string;
  plural: string;
  /** Lowercase words/phrases the NLU accepts for this kind (multi-word allowed). */
  synonyms: string[];
  interest: InterestId | 'everyday';
  emoji: string;
  /** GLB url for Rodin-generated items. */
  model?: string;
  /** Procedural fallback geometry (no model file needed). */
  procedural?: 'mug';
  /** 2D reference image (also used as UI icon). */
  ref?: string;
  /** The natural colour of the model, used in descriptions. */
  baseColor: ColorName;
  /** Colours this kind can be tinted to (procedural kinds only). */
  colorVariants?: ColorName[];
  /** Euler rotation applied to the normalized model so it rests naturally on the table. */
  rotation?: [number, number, number];
  /** Largest dimension of a regular-size instance, in metres. */
  footprint: number;
  /** Levels this kind appears in (defaults to the study table). Agent-made levels use their own id. */
  levels?: string[];
  /** Can be served/placed as small and large variants (cups, drinks). */
  sized?: boolean;
  source: 'rodin' | 'procedural';
  rodin?: {
    generationId: string;
    tier: string;
    prompt: string;
    reference: string;
  };
}

/** A movable object instance in a scene. */
export interface SceneObject {
  id: string;
  kind: string;
  color: ColorName;
  size: SizeName;
  cell: Cell;
  /** Yaw in radians, purely cosmetic. */
  yaw: number;
}

export type LandmarkKind = 'lamp' | 'plant' | 'redBook' | 'blueBook';

/** Fixed furniture on the table that both players can use as a reference. */
export interface Landmark {
  id: string;
  kind: LandmarkKind;
  name: string;
  color: ColorName;
  cell: Cell;
}

export interface SceneState {
  layoutId: string;
  objects: SceneObject[];
  landmarks: Landmark[];
}

/** Anything with a position that language can refer to. */
export interface Entity {
  id: string;
  /** Item kind id or landmark kind. */
  kind: string;
  color: ColorName;
  size: SizeName;
  cell: Cell;
  landmark: boolean;
}

// ---------------------------------------------------------------------------
// Language structures
// ---------------------------------------------------------------------------

/**
 * Whose point of view a direction word uses.
 * `guide` / `builder` are explicit ("my left" said by the guide = guide frame),
 * `unmarked` means a bare "left"/"in front of" with no owner, `none` means the
 * relation is perspective-free ("next to", "between").
 */
export type ViewSpec = Role | 'unmarked' | 'none';

export type RelType = 'nextTo' | 'near' | 'leftOf' | 'rightOf' | 'inFrontOf' | 'behind' | 'between';

export type SuperlativeType = 'leftmost' | 'rightmost' | 'nearest' | 'farthest';

export interface Relation {
  type: RelType;
  view: ViewSpec;
  /** One reference for most relations, two for `between`. */
  refs: RefDesc[];
}

/** A (possibly partial) description of an object or landmark. */
export interface RefDesc {
  kind?: string;
  color?: ColorName;
  size?: Exclude<SizeName, 'regular'>;
  rel?: Relation;
  sup?: { type: SuperlativeType; view: ViewSpec };
  /** Set when the phrase was only a pointer word like "this one" / "it". */
  deictic?: boolean;
}

/** A description of a destination cell. */
export interface PlaceDesc {
  rel: Relation;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/** Tabletop missions (study + agent-made tabletop levels). */
export type TableMissionType = 'find' | 'place';
/** Every mission kind across all levels: order (cafe), route (city), seek (bedroom). */
export type MissionType = TableMissionType | 'order' | 'route' | 'seek';

export interface MissionBase {
  id: string;
  index: number;
  type: TableMissionType;
  /** Model answer the AI guide uses and the coach suggests, from the builder's view. */
  modelAnswer: string;
  /** Why this mission is interesting (shown to the guide as a hint). */
  hint: string;
}

export interface FindMission extends MissionBase {
  type: 'find';
  targetId: string;
  target: RefDesc;
}

export interface PlaceMission extends MissionBase {
  type: 'place';
  itemId: string;
  item: RefDesc;
  targetCell: Cell;
  place: PlaceDesc;
}

export type Mission = FindMission | PlaceMission;

export type Difficulty = 'easy' | 'normal' | 'tricky';
