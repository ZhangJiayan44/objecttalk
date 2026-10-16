import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BLOCK, EXTENT, LOT, lotCenter, NODES, ROAD_W, SIDEWALK, type Town } from '@shared/city';
import { DECOR } from '@shared/wave4';
import { Prop, useProp } from './props';

/**
 * Life in Toy Town: Rodin cars, a bus and a taxi driving the streets
 * (they keep to their lane and never block the walker, who collides with
 * buildings only), plus parked bikes, a post box, flowers, a dog in the park
 * and a cat on a corner. All props carry word cards.
 */

/** A vehicle that drives back and forth along one street lane. */
function Driver({ name, size, lane, axis, speed, phase }: { name: 'car' | 'bus' | 'taxi' | 'truck' | 'ambulance' | 'motorScooter'; size: number; lane: number; axis: 'x' | 'z'; speed: number; phase: number }) {
  const obj = useProp(DECOR[name]);
  const ref = useRef<THREE.Group>(null);
  const span = EXTENT * 2 - 4;
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    // Ping-pong along the street; turn around at the ends.
    const t = (clock.elapsedTime * speed + phase * span) % (span * 2);
    const forward = t < span;
    const s = (forward ? t : span * 2 - t) - span / 2;
    const side = forward ? 1 : -1;
    if (axis === 'x') {
      g.position.set(s, 0.02, lane + side * (ROAD_W / 4));
      g.rotation.y = forward ? -Math.PI / 2 : Math.PI / 2;
    } else {
      g.position.set(lane - side * (ROAD_W / 4), 0.02, s);
      g.rotation.y = forward ? Math.PI : 0;
    }
  });
  return (
    <group ref={ref} scale={size * obj.userData.unit}>
      <primitive object={obj} />
    </group>
  );
}

export function TownLife({ town }: { town: Town }) {
  const roads = useMemo(() => Array.from({ length: NODES }, (_, k) => (k - (NODES - 1) / 2) * BLOCK), []);
  // Sidewalk props sit at block corners, away from building doors.
  const park = town.places.find((p) => p.id === 'park');
  const corner = (bi: number, bj: number, sx: number, sz: number): [number, number, number] => {
    const c = lotCenter(bi, bj);
    return [c.x + sx * (LOT / 2 + SIDEWALK * 0.5), 0.16, c.z + sz * (LOT / 2 + SIDEWALK * 0.5)];
  };
  return (
    <group>
      <Driver name="car" size={4.2} lane={roads[1]} axis="z" speed={6} phase={0.1} />
      <Driver name="taxi" size={4.4} lane={roads[2]} axis="x" speed={5} phase={0.55} />
      <Driver name="bus" size={7.5} lane={roads[0]} axis="x" speed={4} phase={0.3} />
      <Driver name="truck" size={5.2} lane={roads[3]} axis="z" speed={4.5} phase={0.75} />
      <Driver name="motorScooter" size={1.8} lane={roads[2]} axis="z" speed={7} phase={0.2} />
      <Prop name="postbox" position={corner(0, 0, 1, 1)} size={1.3} rotation={Math.PI / 4} />
      <Prop name="bicycle" position={corner(1, 0, -1, 1)} size={1.8} rotation={Math.PI / 2} />
      <Prop name="kickScooter" position={corner(2, 1, -1, -1)} size={1.1} rotation={0.6} />
      <Prop name="kitten" position={corner(2, 2, -1, -1)} size={0.6} rotation={2.2} />
      <Prop name="sunflower" position={corner(0, 2, 1, -1)} size={1.4} />
      <Prop name="tulip" position={corner(1, 2, 1, -1)} size={0.9} />
      {park && (
        <group position={[park.center.x, 0.17, park.center.z]}>
          <Prop name="puppy" position={[2.4, 0, 2.2]} size={0.75} rotation={-0.8} />
          <Prop name="kite" position={[-2.2, 5.2, -1.6]} size={1.5} alive />
          <Prop name="balloon" position={[2.8, 1.6, -2.6]} size={0.8} alive />
          <Prop name="soccerBall" position={[-1.4, 0, 2.6]} size={0.42} />
          <Prop name="duck" position={[1.2, 0.5, -1.2]} size={0.5} roam={1.6} />
          <Prop name="bird" position={[-2.4, 0, 3.4]} size={0.4} />
        </group>
      )}
    </group>
  );
}
