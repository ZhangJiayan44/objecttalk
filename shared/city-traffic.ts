import type { SolidRect } from './collision';

/** Fixed parking positions, away from the street centre lines used for navigation. */
export const PARKED_VEHICLES = [
  { name: 'car', size: 4.2, position: [-14, 0.02, -30.4], rotation: Math.PI, width: 0.70, depth: 1 },
  { name: 'taxi', size: 4.4, position: [3.8, 0.02, 14.15], rotation: -Math.PI / 2, width: 1, depth: 0.73 },
  { name: 'bus', size: 7.5, position: [-24, 0.02, -32.75], rotation: -Math.PI / 2, width: 1, depth: 0.73 },
  { name: 'truck', size: 5.2, position: [34, 0.02, 19], rotation: Math.PI, width: 0.58, depth: 1 },
  { name: 'motorScooter', size: 1.8, position: [10, 0.02, -22.8], rotation: Math.PI, width: 0.45, depth: 1 },
] as const;

/** Normalized model footprints rounded up, shared by client prediction and authoritative movement. */
export const VEHICLE_SOLIDS: SolidRect[] = PARKED_VEHICLES.map((v) => ({
  x: v.position[0], z: v.position[2], w: v.width * v.size, d: v.depth * v.size,
}));
