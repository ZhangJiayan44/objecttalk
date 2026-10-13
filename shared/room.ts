import type { Cell, LandmarkKind, Role } from './types';

/**
 * Room geometry. The table is a COLS x ROWS grid centred at the origin.
 *
 *            GUIDE  (stands at -z, looks toward +z)
 *        c=0   c=1   c=2   c=3   c=4   c=5   c=6      r=0  (north, guide side)
 *        ...                                    r=1
 *        ...                                    r=2  (south, builder side)
 *            BUILDER (stands at +z, looks toward -z)
 *
 * Because the players face each other, the guide's left is the builder's right
 * and the guide's "in front of" is the builder's "behind". That mismatch is the
 * whole game.
 */
export const COLS = 7;
export const ROWS = 3;
export const CELL_W = 0.5;
export const CELL_D = 0.5;
export const TABLE_Y = 0.78;
export const TABLE_W = COLS * CELL_W + 0.3;
export const TABLE_D = ROWS * CELL_D + 0.3;

export function cellToWorld(cell: Cell): [number, number, number] {
  return [(cell.c - (COLS - 1) / 2) * CELL_W, TABLE_Y, (cell.r - (ROWS - 1) / 2) * CELL_D];
}

export function allCells(): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out.push({ c, r });
  return out;
}

export function inBounds(cell: Cell) {
  return cell.c >= 0 && cell.c < COLS && cell.r >= 0 && cell.r < ROWS;
}

/** Player stand positions (camera rigs are derived from these). */
export const VIEWPOINT: Record<Role, { position: [number, number, number]; yaw: number }> = {
  guide: { position: [0, 2.45, -3.55], yaw: Math.PI },
  builder: { position: [0, 2.45, 3.55], yaw: 0 },
};

/** Where each player's avatar stands (just behind their edge of the table). */
export const AVATAR_Z = 2.3;

/**
 * Convert a cell into a viewer-relative frame:
 *   x grows to the viewer's RIGHT, y grows TOWARD the viewer.
 */
export function toFrame(cell: Cell, view: Role): { x: number; y: number } {
  if (view === 'builder') return { x: cell.c, y: cell.r };
  return { x: COLS - 1 - cell.c, y: ROWS - 1 - cell.r };
}

export function fromFrame(p: { x: number; y: number }, view: Role): Cell {
  if (view === 'builder') return { c: p.x, r: p.y };
  return { c: COLS - 1 - p.x, r: ROWS - 1 - p.y };
}

/** Landmark layouts. One is picked per run so the room never feels identical. */
export const LAYOUTS: { id: string; landmarks: { kind: LandmarkKind; cell: Cell }[] }[] = [
  {
    id: 'cozy-a',
    landmarks: [
      { kind: 'lamp', cell: { c: 1, r: 0 } },
      { kind: 'plant', cell: { c: 5, r: 2 } },
      { kind: 'redBook', cell: { c: 3, r: 1 } },
      { kind: 'blueBook', cell: { c: 0, r: 2 } },
    ],
  },
  {
    id: 'cozy-b',
    landmarks: [
      { kind: 'lamp', cell: { c: 5, r: 1 } },
      { kind: 'plant', cell: { c: 0, r: 0 } },
      { kind: 'redBook', cell: { c: 2, r: 2 } },
      { kind: 'blueBook', cell: { c: 6, r: 0 } },
    ],
  },
  {
    id: 'cozy-c',
    landmarks: [
      { kind: 'lamp', cell: { c: 3, r: 1 } },
      { kind: 'plant', cell: { c: 6, r: 1 } },
      { kind: 'redBook', cell: { c: 0, r: 0 } },
      { kind: 'blueBook', cell: { c: 4, r: 2 } },
    ],
  },
];
