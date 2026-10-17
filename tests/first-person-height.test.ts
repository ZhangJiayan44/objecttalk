import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { collideMarket, marketHeight } from '../shared/nightmarket';
import { FirstPersonRig, input } from '../src/components/three/controls';
import { sceneSolids } from '../src/components/three/collision';

const state = vi.hoisted(() => ({ frame: null as null | ((state: unknown, dt: number) => void), root: null as unknown }));
vi.mock('@react-three/fiber', () => ({ useFrame: (fn: typeof state.frame) => { state.frame = fn; }, useThree: () => state.root, events: vi.fn() }));
vi.mock('../src/components/three/collision', () => ({ sceneSolids: vi.fn(() => []) }));
let tree: ReactTestRenderer;
let camera: THREE.PerspectiveCamera;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) }));
  vi.stubGlobal('document', new EventTarget());
  camera = new THREE.PerspectiveCamera();
  state.root = { camera, gl: { domElement: new EventTarget() }, events: {}, scene: new THREE.Scene() };
  input.keys.clear();
  input.joystick = { x: 0, y: 0 };
  vi.mocked(sceneSolids).mockClear();
});
afterEach(() => {
  act(() => tree?.unmount());
  vi.unstubAllGlobals();
});
const frame = (dt = 0.05) => state.frame!(state.root, dt);

describe('first-person floor height', () => {
  it('preserves ordinary scene collision, eye height and poses without a floor field', () => {
    const onPose = vi.fn(), collide = vi.fn((p: { x: number; z: number }) => p);
    act(() => { tree = create(createElement(FirstPersonRig, { position: [0, 1.65, 0], yaw: 0, walk: { speed: 4.5, run: 7, eye: 1.65, collide, onPose } })); });
    input.keys.add('KeyW');
    frame(10);
    expect(sceneSolids).toHaveBeenCalledOnce();
    const pose = onPose.mock.calls[0][0];
    expect(pose).not.toHaveProperty('y');
    expect(Math.abs(pose.z + 0.225)).toBeLessThanOrEqual(0.0051);
    expect(collide).toHaveBeenCalled();
    input.keys.clear(); frame();
    expect(camera.position.y).toBe(1.65);
  });

  it('climbs the night-market stair with matching camera and network height', () => {
    const onPose = vi.fn();
    act(() => { tree = create(createElement(FirstPersonRig, { position: [8, 1.65, -3], yaw: -Math.PI / 2, walk: { speed: 4.5, run: 7, eye: 1.65, groundHeight: marketHeight, collide: collideMarket, onPose } })); });
    input.keys.add('KeyW');
    for (let i = 0; i < 30; i++) frame();
    input.keys.clear(); frame();
    const pose = onPose.mock.calls.at(-1)![0];
    expect(pose.y).toBeGreaterThan(4);
    expect(camera.position.y).toBeCloseTo(pose.y + 1.65);
    expect(sceneSolids).not.toHaveBeenCalled();
    expect(pose.z).toBe(-3);
  });
});
