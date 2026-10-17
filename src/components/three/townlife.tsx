import { LOT, lotCenter, SIDEWALK, type Town } from '@shared/city';
import { PARKED_VEHICLES } from '@shared/city-traffic';
import { Prop } from './props';

/**
 * Life in Toy Town: parked Rodin cars, a bus and a taxi,
 * plus parked bikes, a post box, flowers, a dog in the park
 * and a cat on a corner. All props carry word cards.
 */

export function TownLife({ town }: { town: Town }) {
  // Sidewalk props sit at block corners, away from building doors.
  const park = town.places.find((p) => p.id === 'park');
  const corner = (bi: number, bj: number, sx: number, sz: number): [number, number, number] => {
    const c = lotCenter(bi, bj);
    return [c.x + sx * (LOT / 2 + SIDEWALK * 0.5), 0.16, c.z + sz * (LOT / 2 + SIDEWALK * 0.5)];
  };
  return (
    <group>
      {PARKED_VEHICLES.map((v) => <Prop key={v.name} name={v.name} size={v.size} position={[...v.position]} rotation={v.rotation} alive={false} />)}
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
