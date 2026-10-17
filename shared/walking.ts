import type { Role } from './types';

export interface WalkBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Clear aisles on each player's side, with clearance from the counter and scenery. */
export const COUNTER_WALK_BOUNDS: Record<Role, WalkBounds> = {
  builder: { minX: -2.7, maxX: 3.4, minZ: -1.5, maxZ: -0.85 },
  guide: { minX: -2.7, maxX: 3.4, minZ: 0.85, maxZ: 1.95 },
};

export const TABLE_WALK_BOUNDS: Record<Role, WalkBounds> = {
  builder: { minX: -2.3, maxX: 2.3, minZ: 1.25, maxZ: 2.65 },
  guide: { minX: -2.3, maxX: 2.3, minZ: -2.65, maxZ: -1.25 },
};

/** Clamp each axis independently so walking into an edge still lets the player slide along it. */
export function clampWalk(p: { x: number; z: number }, bounds: WalkBounds) {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, p.x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, p.z)),
  };
}
