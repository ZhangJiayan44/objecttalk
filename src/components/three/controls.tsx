import { events as createPointerEvents, useFrame, useThree, type EventManager, type RootState } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Pose } from '@shared/protocol';
import { collideSolids, intersectsSolids, moveWithCollision } from '@shared/collision';
import { sceneSolids } from './collision';
import { readMouseSensitivity } from '@/lib/settings';

/**
 * First-person controls, CS-style: click the 3D view once to capture the
 * mouse, then simply moving the mouse turns your head (no dragging); the
 * dot in the middle is your pointer and a click interacts with what it
 * is on. Esc releases the mouse for the UI. Walking levels add WASD / arrows
 * (Shift to run) with collision. On touch screens: drag to look, tap to
 * interact, and an on-screen joystick to walk.
 */

/** Shared, mutable input state (read every frame, so no React state). */
export const input = {
  locked: false,
  /** The view can capture the mouse (desktop with pointer lock support, first-person view active). */
  lockable: false,
  /** When the lock was last taken: the click that locked must not also pick something. */
  lockedAt: 0,
  joystick: { x: 0, y: 0 },
  keys: new Set<string>(),
};

/** True when a click should interact rather than just capture the mouse. */
export const clickInteracts = () => !input.lockable || (input.locked && performance.now() - input.lockedAt > 180);

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

/** Raycast from the interaction dot (screen centre) while captured, from the cursor otherwise. */
export function centerRayEvents(store: Parameters<typeof createPointerEvents>[0]): EventManager<HTMLElement> {
  const base = createPointerEvents(store);
  return {
    ...base,
    compute(event: { offsetX: number; offsetY: number }, state: RootState) {
      if (document.pointerLockElement === state.gl.domElement) state.pointer.set(0, 0);
      else state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
  };
}

export interface WalkOptions {
  speed: number;
  run: number;
  eye: number;
  radius?: number;
  groundHeight?(p: { x: number; z: number; y?: number }): number;
  collide(p: { x: number; z: number; y?: number }, previous?: { x: number; z: number; y?: number }): { x: number; z: number; y?: number };
  onPose?(pose: Pose): void;
}

export interface FirstPersonProps {
  /** Eye position for standing views; start position for walking (y = eye height). */
  position: [number, number, number];
  /** 0 faces -z (north); +PI/2 faces west. */
  yaw: number;
  pitch?: number;
  /** Max turn left/right from `yaw` (radians). Omit for free look. */
  yawRange?: number;
  pitchMin?: number;
  pitchMax?: number;
  walk?: WalkOptions;
  /** Re-centre the view when this changes (e.g. a new mission). */
  resetKey?: string | number;
  enabled?: boolean;
  /** Capture the mouse on click (players). Off: drag to look (spectators, demo screens). */
  capture?: boolean;
  onLockChange?(locked: boolean): void;
}

const SENS_LOCKED = 0.0022;
const SENS_DRAG = 0.0055;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function FirstPersonRig({ position, yaw: baseYaw, pitch: basePitch = -0.32, yawRange, pitchMin = -1.2, pitchMax = 0.5, walk, resetKey, enabled = true, capture = true, onLockChange }: FirstPersonProps) {
  const { camera, gl, events } = useThree();
  const look = useRef({ yaw: baseYaw, pitch: basePitch });
  const pos = useRef<{ x: number; z: number; y?: number }>({ x: position[0], z: position[2], ...(walk?.groundHeight ? { y: position[1] - walk.eye } : {}) });
  const bob = useRef(0);
  const lastSent = useRef('');
  const onLock = useRef(onLockChange);
  onLock.current = onLockChange;
  // Latest props for the long-lived listeners (re-binding them would drop the pointer lock).
  const opts = useRef({ baseYaw, yawRange, pitchMin, pitchMax, walk });
  opts.current = { baseYaw, yawRange, pitchMin, pitchMax, walk };

  // Reset when the spawn point or mission changes.
  useEffect(() => {
    look.current = { yaw: baseYaw, pitch: basePitch };
    pos.current = { x: position[0], z: position[2], ...(walk?.groundHeight ? { y: position[1] - walk.eye } : {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    const el = gl.domElement;
    const canLock = enabled && capture && 'requestPointerLock' in el && !window.matchMedia('(pointer: coarse)').matches;
    input.lockable = canLock;
    const clampLook = () => {
      const l = look.current;
      const o = opts.current;
      if (o.yawRange !== undefined) {
        const d = wrap(l.yaw - o.baseYaw);
        l.yaw = o.baseYaw + Math.max(-o.yawRange, Math.min(o.yawRange, d));
      }
      l.pitch = Math.max(o.pitchMin, Math.min(o.pitchMax, l.pitch));
    };
    const onLockChangeEv = () => {
      const locked = document.pointerLockElement === el;
      input.locked = locked;
      if (locked) input.lockedAt = performance.now();
      onLock.current?.(locked);
    };
    const onClick = () => {
      if (canLock && document.pointerLockElement !== el) {
        try {
          const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
          p?.catch?.(() => undefined);
        } catch {
          /* some browsers refuse outside a trusted gesture */
        }
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return;
      const sensitivity = readMouseSensitivity();
      look.current.yaw -= e.movementX * SENS_LOCKED * sensitivity;
      look.current.pitch -= e.movementY * SENS_LOCKED * sensitivity;
      clampLook();
    };
    // Drag to look (touch, or when the mouse is not captured).
    let drag: { id: number; x: number; y: number; moved: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (document.pointerLockElement === el) return;
      if (canLock && e.pointerType === 'mouse') return; // the click will capture the mouse instead
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      const sensitivity = readMouseSensitivity();
      look.current.yaw -= dx * SENS_DRAG * sensitivity;
      look.current.pitch -= dy * SENS_DRAG * sensitivity;
      clampLook();
    };
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (down && isTyping(e.target)) return;
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(k)) {
        if (down) input.keys.add(k);
        else input.keys.delete(k);
        if (opts.current.walk && k.startsWith('Arrow') && down) e.preventDefault();
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const blur = () => input.keys.clear();
    if (enabled) {
      el.addEventListener('click', onClick);
      el.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('pointerlockchange', onLockChangeEv);
      window.addEventListener('keydown', kd);
      window.addEventListener('keyup', ku);
      window.addEventListener('blur', blur);
    }
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChangeEv);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      input.keys.clear();
      input.lockable = false;
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, [gl, enabled, capture]);

  useFrame((state, dt) => {
    // Returning from a background tab must not create a single giant movement step.
    dt = Math.min(dt, 0.05);
    const l = look.current;
    let moved = false;
    if (walk && enabled) {
      const k = input.keys;
      let fx = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + -input.joystick.y;
      let sx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + input.joystick.x;
      // Arrow left/right turn (handy without a mouse); A/D strafe.
      const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
      if (turn) l.yaw += turn * 2.2 * dt;
      const len = Math.hypot(fx, sx);
      if (len > 1) {
        fx /= len;
        sx /= len;
      }
      if (len > 0.05) {
        const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? walk.run : walk.speed;
        const f = { x: -Math.sin(l.yaw), z: -Math.cos(l.yaw) };
        const r = { x: Math.cos(l.yaw), z: -Math.sin(l.yaw) };
        const destination = {
          x: pos.current.x + (f.x * fx + r.x * sx) * speed * dt,
          z: pos.current.z + (f.z * fx + r.z * sx) * speed * dt,
        };
        // Multi-floor scenes own their height-aware collision; other levels keep their existing solids.
        const radius = walk.radius ?? 0.35;
        const solids = walk.groundHeight ? [] : sceneSolids(state.scene, walk.eye);
        const next = walk.groundHeight
          ? walk.collide({ ...destination, y: pos.current.y }, pos.current)
          : moveWithCollision(pos.current, destination, (q) => walk.collide(collideSolids(walk.collide(q), solids, radius)), (q) => !intersectsSolids(q, solids, radius));
        moved = Math.hypot(next.x - pos.current.x, next.z - pos.current.z) > 1e-4;
        pos.current = next;
        bob.current += dt * speed * 2.2;
      }
      camera.position.set(pos.current.x, (walk.groundHeight?.(pos.current) ?? 0) + walk.eye + (moved ? Math.sin(bob.current) * 0.035 : 0), pos.current.z);
      const pose: Pose = { x: +pos.current.x.toFixed(2), z: +pos.current.z.toFixed(2), yaw: +wrap(l.yaw).toFixed(2), ...(walk.groundHeight ? { y: pos.current.y ?? walk.groundHeight(pos.current) } : {}) };
      const key = `${pose.x},${pose.z},${pose.yaw}${pose.y === undefined ? '' : `,${pose.y}`}`;
      if (key !== lastSent.current) {
        lastSent.current = key;
        walk.onPose?.(pose);
      }
    } else camera.position.set(...position);
    camera.rotation.set(l.pitch, l.yaw, 0, 'YXZ');
    // Keep hover targets fresh while the view moves without mouse events.
    if ((moved || input.locked) && events.update) events.update();
  });

  return null;
}

/** Reusable ray helpers for scenes that need "what am I looking at" without pointer events. */
export function forwardOf(yaw: number): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
}
