const MOUSE_SENSITIVITY_KEY = 'objecttalk:mouse-sensitivity';

export const MOUSE_SENSITIVITY_DEFAULT = 1;
export const MOUSE_SENSITIVITY_MIN = 0.5;
export const MOUSE_SENSITIVITY_MAX = 2;

export function clampMouseSensitivity(value: number) {
  if (!Number.isFinite(value)) return MOUSE_SENSITIVITY_DEFAULT;
  return Math.min(MOUSE_SENSITIVITY_MAX, Math.max(MOUSE_SENSITIVITY_MIN, value));
}

export function readMouseSensitivity() {
  if (typeof window === 'undefined') return MOUSE_SENSITIVITY_DEFAULT;
  try {
    const raw = Number(localStorage.getItem(MOUSE_SENSITIVITY_KEY));
    return clampMouseSensitivity(raw || MOUSE_SENSITIVITY_DEFAULT);
  } catch {
    return MOUSE_SENSITIVITY_DEFAULT;
  }
}

export function writeMouseSensitivity(value: number) {
  const next = clampMouseSensitivity(value);
  try {
    localStorage.setItem(MOUSE_SENSITIVITY_KEY, String(next));
    window.dispatchEvent(new CustomEvent('objecttalk:mouse-sensitivity', { detail: next }));
  } catch {
    /* private mode */
  }
  return next;
}
