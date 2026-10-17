const RELOAD_KEY = 'objecttalk:module-reload';
const RELOAD_COOLDOWN_MS = 60_000;

/** Recover an old tab after a deployment, without looping on a broken connection. */
export function recoverModuleLoad(storage: Pick<Storage, 'getItem' | 'setItem'>, reload: () => void, now = Date.now()): boolean {
  try {
    const previous = Number(storage.getItem(RELOAD_KEY));
    if (previous > 0 && now - previous < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
  } catch {
    // If the retry cannot be remembered, let the route offer a manual refresh.
    return false;
  }
  reload();
  return true;
}

export function installModuleRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (recoverModuleLoad(window.sessionStorage, () => window.location.reload())) event.preventDefault();
    } catch {
      // Storage access itself can be disabled. The route error screen still works.
    }
  });
}

export function isModuleLoadError(error: unknown): boolean {
  return error instanceof Error && /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk .* failed/i.test(error.message);
}
