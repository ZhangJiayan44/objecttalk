import { describe, expect, it } from 'vitest';
import { cameraTrack, type ShotKey } from '../src/components/demo/camera';

const shots: ShotKey[] = [
  { t: 0, position: [0, 4, 8], target: [0, 1, 0], fov: 50 },
  { t: 1.2, position: [2, 3, 5], target: [0.2, 1, 0], fov: 43 },
  { t: 3.1, position: [3, 2, 3], target: [0.8, 1, 0], fov: 38 },
  { t: 5, position: [1, 4, 6], target: [0, 1, 0], fov: 48 },
];
describe('cinematic camera continuity', () => {
  it('passes through the intended views and keeps all interpolated axes within their segment bounds', () => {
    for (const s of shots) expect(cameraTrack(s.t, shots).position).toEqual(s.position);
    for (let i = 0; i < shots.length - 1; i++) {
      const a = shots[i], b = shots[i + 1];
      for (let n = 0; n <= 100; n++) {
        const s = cameraTrack(a.t + (b.t - a.t) * n / 100, shots);
        [...s.position, ...s.target, s.fov!].forEach((v, axis) => {
          const p = [...a.position, ...a.target, a.fov!][axis], q = [...b.position, ...b.target, b.fov!][axis];
          expect(v).toBeGreaterThanOrEqual(Math.min(p, q) - 1e-8);
          expect(v).toBeLessThanOrEqual(Math.max(p, q) + 1e-8);
        });
      }
    }
  });
  it('does not stop then jump to a new velocity at an internal waypoint', () => {
    const dt = 1e-5;
    for (const at of [1.2, 3.1]) {
      const a = cameraTrack(at - dt, shots), b = cameraTrack(at, shots), c = cameraTrack(at + dt, shots);
      [...a.position, ...a.target, a.fov!].forEach((v, axis) => {
        const center = [...b.position, ...b.target, b.fov!][axis], next = [...c.position, ...c.target, c.fov!][axis];
        expect(Math.abs((center - v) / dt - (next - center) / dt)).toBeLessThan(0.001);
      });
    }
  });
  it('retains deliberate editorial cuts and never flies between unrelated shots', () => {
    const cut: ShotKey = { t: 6, position: [40, 20, -10], target: [0, 0, 0], fov: 65, cut: true };
    expect(cameraTrack(5.99, [...shots, cut]).position).toEqual(shots.at(-1)!.position);
    expect(cameraTrack(6, [...shots, cut]).position).toEqual(cut.position);
  });
});
