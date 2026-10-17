import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { collideRoom, ROOM_D, ROOM_W } from '../shared/bedroom';
import { buildTown, collide } from '../shared/city';
import { PARKED_VEHICLES, VEHICLE_SOLIDS } from '../shared/city-traffic';
import { collideSolids, intersectsSolids, moveWithCollision } from '../shared/collision';
import { createRng } from '../shared/rng';
import { DECOR } from '../shared/wave4';
import { sceneSolids } from '../src/components/three/collision';

describe('walking collision', () => {
  const walls = [{ x: 0, z: 0, w: 0.1, d: 4 }];
  const constrain = (p: { x: number; z: number }) => collideSolids(p, walls, 0.35);

  it('cannot tunnel through a thin obstacle even in a very large movement step', () => {
    const a = moveWithCollision({ x: -3, z: 0 }, { x: 3, z: 0 }, constrain);
    const b = moveWithCollision({ x: 3, z: 0 }, { x: -3, z: 0 }, constrain);
    expect(a.x).toBeCloseTo(-0.4);
    expect(b.x).toBeCloseTo(0.4);
  });

  it('slides along an obstacle instead of getting pushed through its far side', () => {
    const result = moveWithCollision({ x: -0.5, z: -1 }, { x: 0.8, z: 1 }, constrain);
    expect(result.x).toBeCloseTo(-0.4);
    expect(result.z).toBeCloseTo(1);
    expect(intersectsSolids(result, walls, 0.35)).toBe(false);
  });

  it('does not cross the wardrobe or get pushed through the bedroom wall', () => {
    const result = moveWithCollision({ x: 2.8, z: -2.1 }, { x: 6, z: -2.1 }, collideRoom);
    expect(result.x).toBeLessThanOrEqual(3.25 + 1e-6);
    expect(Math.abs(result.x)).toBeLessThanOrEqual(ROOM_W / 2 - 0.35);
    expect(Math.abs(result.z)).toBeLessThanOrEqual(ROOM_D / 2 - 0.35);
  });

  it('detects real rotated and scaled scenery at body height', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.position.set(10, 0, 5);
    parent.rotation.y = Math.PI / 2;
    const prop = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
    prop.userData.walkSolid = true;
    prop.position.set(1, 0.5, 0);
    prop.scale.setScalar(2);
    parent.add(prop);
    scene.add(parent);
    const solids = sceneSolids(scene, 1.65);
    expect(solids).toHaveLength(1);
    expect(solids[0].x).toBeCloseTo(10);
    expect(solids[0].z).toBeCloseTo(4);
    expect(solids[0].w).toBeCloseTo(2);
    expect(solids[0].d).toBeCloseTo(4);
    expect(intersectsSolids({ x: 10, z: 4 }, solids, 0.4)).toBe(true);
    const result = moveWithCollision({ x: 7, z: 4 }, { x: 13, z: 4 }, (p) => collideSolids(p, solids, 0.4));
    expect(result.x).toBeCloseTo(8.6);
  });

  it('does not turn overhead props and floor decoration into invisible walls', () => {
    const scene = new THREE.Scene();
    for (const y of [4, 0]) {
      const prop = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1));
      prop.userData.walkSolid = true;
      prop.position.y = y;
      scene.add(prop);
    }
    expect(sceneSolids(scene, 1.65)).toHaveLength(0);
  });
});

describe('parked city traffic', () => {
  it('parks vehicles without overlapping one another', () => {
    for (let i = 0; i < VEHICLE_SOLIDS.length; i++) {
      for (let j = i + 1; j < VEHICLE_SOLIDS.length; j++) {
        const a = VEHICLE_SOLIDS[i];
        const b = VEHICLE_SOLIDS[j];
        expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2).toBe(true);
      }
    }
  });

  it('stops the walker before each parked vehicle', () => {
    for (const solid of VEHICLE_SOLIDS) {
      const start = { x: solid.x - solid.w / 2 - 0.8, z: solid.z };
      const end = { x: solid.x + solid.w / 2 + 0.8, z: solid.z };
      const result = moveWithCollision(start, end, collide);
      expect(result.x).toBeLessThanOrEqual(solid.x - solid.w / 2 - 0.4 + 1e-6);
      expect(intersectsSolids(result, VEHICLE_SOLIDS, 0.4)).toBe(false);
    }
  });

  it('keeps every street centre line clear for direction-following AI and players', () => {
    for (const lane of [-36, -12, 12, 36]) {
      const vertical = moveWithCollision({ x: lane, z: -36 }, { x: lane, z: 36 }, collide);
      const horizontal = moveWithCollision({ x: -36, z: lane }, { x: 36, z: lane }, collide);
      expect(vertical.z).toBeCloseTo(36);
      expect(horizontal.x).toBeCloseTo(36);
    }
    for (let seed = 1; seed <= 100; seed++) {
      expect(intersectsSolids(buildTown(createRng(seed)).start, VEHICLE_SOLIDS, 0.4)).toBe(false);
    }
  });

  it('covers the actual GLB vehicle footprints, including the wide bus', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    for (const v of PARKED_VEHICLES) {
      const doc = await io.read(`public${DECOR[v.name]}`);
      const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
      const dims = max.map((value, i) => value - min[i]);
      const unit = 1 / Math.max(...dims);
      const c = Math.abs(Math.cos(v.rotation));
      const s = Math.abs(Math.sin(v.rotation));
      expect(v.width + 1e-4).toBeGreaterThanOrEqual((dims[0] * c + dims[2] * s) * unit);
      expect(v.depth + 1e-4).toBeGreaterThanOrEqual((dims[0] * s + dims[2] * c) * unit);
    }
  });
});
