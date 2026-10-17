import { createContext, memo, useCallback, useContext, useState } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { cellToWorld, TABLE_Y } from '@shared/room';
import { nodePos, parseNode, planRoute } from '@shared/city';
import type { Role, SceneState } from '@shared/types';
import { DECOR } from '@shared/wave4';
import { CafeScene } from '@/components/three/CafeScene';
import { CityScene } from '@/components/three/CityScene';
import { NightMarketScene } from '@/components/three/NightMarketScene';
import { RoomScene } from '@/components/three/RoomScene';
import { Showcase } from '@/components/three/Showcase';
import { preloadModels } from '@/components/three/models';
import { preloadProps } from '@/components/three/props';
import type { GraphicsMode } from '@/lib/graphics';
import type { PresentationShot } from '@/components/three/presentation';
import { CAFE, DESTINATION, MARKET, ROCKET, STUDY, TOWN } from './native-data';
import { ACTION, ease, progress } from './timeline';
import { cameraTrack, type ShotKey } from './camera';

export const DemoQualityContext = createContext<GraphicsMode>('low');
export const DemoPrewarmTimeContext = createContext<number | undefined>(undefined);
export const DemoClockContext = createContext<{ current: { time: number } } | null>(null);
export type WorldKind = 'study' | 'cafe' | 'town' | 'night';
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const townPath = [TOWN.start, ...(planRoute(TOWN, TOWN.start, 'bank')?.nodes ?? []).map((node) => nodePos(...parseNode(node)))];
const croissantIds = CAFE.scene.objects.filter(o => o.kind === 'croissant').slice(0, 2).map(o => o.id);
const NIGHT_SHOTS: ShotKey[] = [
  { t: 27, position: [24, 23, 24], target: [2, 2, -6], fov: 51 },
  { t: 28.8, position: [30, 21, 12], target: [3, 3, -9], fov: 48 },
  { t: 29.25, position: [-0.2, 1.85, 10], target: [-6, 1.8, 6], fov: 72, cut: true },
  { t: 29.9, position: [-2.8, 1.85, 6], target: [-8, 1.7, -3], fov: 72 },
  { t: 30, position: [18, 19, 9], target: [4, 3, -8], fov: 52, cut: true },
  { t: 32.5, position: [-9, 22, 14], target: [3, 2.5, -8], fov: 50 },
];
export function warmNativeScenes() {
  preloadModels('study');
  preloadProps(['kitten', 'trophy', 'radio', 'suitcase', 'basketball'] as (keyof typeof DECOR)[]);
}
export function studyShot(time: number, action = false, role?: Role, reduced = false): PresentationShot {
  if (role) {
    const p = reduced ? 0 : Math.sin(progress(time, 5, 5) * Math.PI);
    return { time, position: [p * (role === 'guide' ? 0.35 : -0.35), 2.5 - p * 0.12, (role === 'guide' ? -1 : 1) * (3.8 - p * 0.4)], target: [0, 0.75, 0], fov: 49 - p * 3 };
  }
  if (action) {
    return cameraTrack(reduced ? 10 : time, [
      { t: 10, position: [3.8, 4.1, 4.2], target: [0, 0.65, 0], fov: 48 },
      { t: 11.2, position: [3.1, 3.6, 3.6], target: [0, 0.8, 0], fov: 46 },
      { t: 12.5, position: [2.1, 2.8, 2.8], target: [0, 0.78, 0], fov: 30 },
      { t: 14.5, position: [2.7, 3.5, 3.3], target: [0, 0.78, 0], fov: 40 },
      { t: 16.45, position: [2.5, 3.4, 3.2], target: [0, 0.78, 0], fov: 41 },
      { t: 18.6, position: [3.8, 4.0, 4.1], target: [0, 0.7, 0], fov: 49 },
    ]);
  }
  return cameraTrack(reduced ? 0 : time, [
    { t: 0, position: [4.7, 4.1, 3.9], target: [0, 0.7, 0], fov: 47 },
    { t: 1.5, position: [3.4, 3.2, 3.1], target: [0, 0.72, 0], fov: 43 },
    { t: 3.1, position: [2.8, 3.0, 3.7], target: [0, 0.75, 0], fov: 42 },
    { t: 5, position: [4.0, 3.8, 3.8], target: [0, 0.65, 0], fov: 49 },
  ]);
}
export function studyAction(time: number) {
  const u = progress(time, ACTION.move, ACTION.moveDuration);
  const p = u * u * (3 - 2 * u);
  const held = time >= ACTION.pick && time < ACTION.drop;
  const lift = held ? 0.32 * ease(progress(time, ACTION.pick, 0.15)) * (1 - ease(progress(time, ACTION.drop - 0.15, 0.15)))
    : time >= ACTION.drop && time < ACTION.success ? 0.035 * Math.sin(progress(time, ACTION.drop, ACTION.success - ACTION.drop) * Math.PI) : 0;
  return { p, held, lift, complete: time >= ACTION.success,
    cell: { c: mix(ROCKET.cell.c, DESTINATION.c, p), r: mix(ROCKET.cell.r, DESTINATION.r, p) } };
}
export function studyPointer(time: number, reduced: boolean, width = 1060, height = 550) {
  const shot = studyShot(time, true, undefined, reduced);
  const camera = new PerspectiveCamera(shot.fov, width / height, 0.05, 80);
  camera.position.set(...shot.position);
  camera.lookAt(...shot.target);
  camera.updateMatrixWorld();
  const action = studyAction(time);
  const [x, , z] = cellToWorld(action.cell);
  const point = new Vector3(x, TABLE_Y + 0.2 + action.lift, z).project(camera);
  return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
}

export const NativeDemoScene = memo(function NativeDemoScene({
  kind = 'study',
  time,
  action = false,
  role,
  reduced = false,
}: {
  kind?: WorldKind;
  time: number;
  action?: boolean;
  role?: Role;
  reduced?: boolean;
}) {
  const prewarmTime = useContext(DemoPrewarmTimeContext);
  const clock = useContext(DemoClockContext);
  time = prewarmTime ?? time;
  const requested = useContext(DemoQualityContext);
  // Only the focused world advances; the other native canvases stay frozen.
  // This leaves enough budget for the site's existing low-tier shadows/bloom.
  const quality = requested;
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  let content;
  if (kind === 'study') {
    const state = studyAction(time);
    const scene: SceneState = action
      ? {
          ...STUDY,
          objects: STUDY.objects.map((o) =>
            o.id === ROCKET.id
              ? { ...o, cell: state.cell }
              : o,
          ),
        }
      : STUDY;
    const shot = { ...studyShot(time, action, role, reduced), quality, onReady,
      ...(action ? { objectId: ROCKET.id, objectLift: state.lift } : {}) };
    content = (
      <RoomScene
        scene={scene}
        view={role ?? 'overview'}
        presentation={shot}
        labels={false}
        names={{ guide: 'Mia', builder: 'Leo' }}
        heldId={action && state.held ? ROCKET.id : null}
        target={role === 'builder' || (action && state.complete) ? null : action && state.held ? { itemId: ROCKET.id, cell: DESTINATION } : { findId: ROCKET.id }}
      />
    );
  } else if (kind === 'cafe') {
    const p = reduced ? 0 : ease(progress(time, 20, 3));
    content = (
      <CafeScene
        scene={CAFE.scene}
        tray={croissantIds.filter((_, i) => time >= 21.1 + i * 0.45)}
        view="overview"
        interactive={false}
        presentation={{
          time,
          quality,
          objectProgress: ease(progress(time, 21.1, 0.7)),
          objectProgressById: Object.fromEntries(croissantIds.map((id, i) => [id, ease(progress(time, 21.1 + i * 0.45, 0.65))])),
          position: [mix(4, 2.0, p), mix(2.6, 1.9, p), mix(4.2, 3.0, p)],
          target: [mix(0.1, 0.7, p), 1.25, 0],
          fov: mix(62, 51, p),
          onReady,
        }}
        names={{ guide: 'Mia', builder: 'Leo' }}
      />
    );
  } else if (kind === 'town') {
    const p = reduced ? 0 : ease(progress(time, 23.2, 3.4));
    const index = Math.min(townPath.length - 2, Math.floor(p * (townPath.length - 1)));
    const a = townPath[Math.max(0, index)], b = townPath[Math.max(0, index + 1)] ?? a;
    const u = Math.min(1, p * (townPath.length - 1) - Math.max(0, index));
    content = (
      <CityScene
        town={TOWN}
        pose={{ x: mix(a.x, b.x, u), z: mix(a.z, b.z, u), yaw: Math.atan2(a.x - b.x, a.z - b.z) }}
        view="overview"
        interactive={false}
        destination="bank"
        showRoute
        presentation={{
          time,
          quality,
          position: [mix(37, 13, p), mix(53, 15, p), mix(49, 25, p)],
          target: [0, 0, 0],
          fov: mix(48, 56, p),
          onReady,
        }}
      />
    );
  } else {
    const shot = cameraTrack(reduced ? 27 : time, NIGHT_SHOTS);
    content = (
      <NightMarketScene
        scene={MARKET.scene}
        tray={[]}
        pose={{ x: 0, z: 16, yaw: 0 }}
        view="builder"
        interactive={false}
        presentation={{
          ...shot,
          quality,
          staticShadows: true,
          sample: clock && prewarmTime === undefined && !reduced
            ? () => cameraTrack(Math.max(27, Math.min(32.5, clock.current.time)), NIGHT_SHOTS) : undefined,
          onReady,
        }}
      />
    );
  }
  return (
    <div
      className="native-demo-scene"
      data-native-ready={ready}
      data-native-time={time}
      data-render-quality={quality}
      data-native-component={
        kind === 'study'
          ? 'RoomScene'
          : kind === 'cafe'
            ? 'CafeScene'
            : kind === 'town'
              ? 'CityScene'
              : 'NightMarketScene'
      }
    >
      {content}
    </div>
  );
});

export function NativeShowcase({ time }: { time: number }) {
  time = useContext(DemoPrewarmTimeContext) ?? time;
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className="native-demo-scene" data-native-ready={ready} data-native-time={time} data-native-component="Showcase">
      <Showcase labels={false} presentationTime={time} onPresentationReady={onReady} />
    </div>
  );
}
