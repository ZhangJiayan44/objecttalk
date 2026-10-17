import * as THREE from 'three';
import type { SolidRect } from '@shared/collision';

/** Read solid props in world space, including their actual model scale, rotation and idle pose. */
export function sceneSolids(scene: THREE.Object3D, eye: number): SolidRect[] {
  const solids: SolidRect[] = [];
  const box = new THREE.Box3();
  scene.traverse((object) => {
    if (!object.visible || !object.userData.walkSolid) return;
    object.updateWorldMatrix(true, false);
    box.setFromObject(object);
    if (box.isEmpty() || box.max.y < 0.15 || box.min.y > eye + 0.2) return;
    solids.push({ x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, w: box.max.x - box.min.x, d: box.max.z - box.min.z });
  });
  return solids;
}
