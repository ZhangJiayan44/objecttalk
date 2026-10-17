import type { PresentationShot } from '../three/presentation';

export type ShotKey = Omit<PresentationShot, 'time'> & { t: number; cut?: boolean };
type Point = { t: number; value: number };

// Shape-preserving Hermite slopes keep camera speed continuous at waypoints
// without overshooting into the room. Explicit cuts split independent shots.
function slope(before: Point | undefined, here: Point, after: Point | undefined) {
  if (!before || !after) return 0;
  const a = (here.value - before.value) / (here.t - before.t);
  const b = (after.value - here.value) / (after.t - here.t);
  if (a * b <= 0) return 0;
  const h0 = here.t - before.t, h1 = after.t - here.t;
  const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
  return (w0 + w1) / (w0 / a + w1 / b);
}
export function cameraTrack(time: number, shots: ShotKey[]): PresentationShot {
  let index = 0;
  while (index + 1 < shots.length && shots[index + 1].t <= time) index++;
  const from = shots[index], to = shots[index + 1];
  if (!to || to.cut || time <= from.t) return { ...from, time };
  const duration = to.t - from.t, u = (time - from.t) / duration;
  const u2 = u * u, u3 = u2 * u;
  const interpolate = (read: (shot: ShotKey) => number) => {
    const point = (i: number) => ({ t: shots[i].t, value: read(shots[i]) });
    const a = point(index), b = point(index + 1);
    const previous = index > 0 && !from.cut ? point(index - 1) : undefined;
    const next = index + 2 < shots.length && !shots[index + 2].cut ? point(index + 2) : undefined;
    return (2 * u3 - 3 * u2 + 1) * a.value + (u3 - 2 * u2 + u) * duration * slope(previous, a, b)
      + (-2 * u3 + 3 * u2) * b.value + (u3 - u2) * duration * slope(a, b, next);
  };
  return {
    time,
    position: [0, 1, 2].map(i => interpolate(s => s.position[i])) as [number, number, number],
    target: [0, 1, 2].map(i => interpolate(s => s.target[i])) as [number, number, number],
    fov: interpolate(s => s.fov ?? 45),
  };
}
