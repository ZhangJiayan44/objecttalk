export interface WalkPoint { x: number; z: number }
export interface SolidRect extends WalkPoint { w: number; d: number }

export const intersectsSolids = (pos: WalkPoint, solids: readonly SolidRect[], radius: number) => solids.some((solid) =>
  Math.abs(pos.x - solid.x) < solid.w / 2 + radius - 1e-6 && Math.abs(pos.z - solid.z) < solid.d / 2 + radius - 1e-6,
);

/** Resolve a player's horizontal footprint against solid scenery. */
export function collideSolids(pos: WalkPoint, solids: readonly SolidRect[], radius: number): WalkPoint {
  let { x, z } = pos;
  for (let pass = 0; pass < 3; pass++) {
    let hit = false;
    for (const solid of solids) {
      const hx = solid.w / 2 + radius;
      const hz = solid.d / 2 + radius;
      const dx = x - solid.x;
      const dz = z - solid.z;
      if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
        hit = true;
        if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = solid.x + Math.sign(dx || 1) * hx;
        else z = solid.z + Math.sign(dz || 1) * hz;
      }
    }
    if (!hit) break;
  }
  return { x, z };
}

/** Check the entire movement path, keeping each axis on its original side of an obstacle. */
export function moveWithCollision(from: WalkPoint, to: WalkPoint, collide: (pos: WalkPoint) => WalkPoint, isFree: (pos: WalkPoint) => boolean = () => true): WalkPoint {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  const stepX = dx / steps;
  const stepZ = dz / steps;
  let pos = { ...from };
  for (let i = 0; i < steps; i++) {
    for (const [axis, step, other] of [['x', stepX, 'z'], ['z', stepZ, 'x']] as const) {
      if (!step) continue;
      const next = collide({ ...pos, [axis]: pos[axis] + step });
      const travel = next[axis] - pos[axis];
      // Push-out must not move the player sideways, backwards, or onto the far side of a wall.
      if (Math.abs(next[other] - pos[other]) < 1e-6 && travel * step >= -1e-8 && Math.abs(travel) <= Math.abs(step) + 1e-6 && isFree(next)) pos = next;
    }
  }
  return pos;
}
