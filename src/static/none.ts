/**
 * Stand-in for src/static/server.ts in normal builds (alias `@static-server`): the app talks
 * to the real server there, and the in-page server only ships in the GitHub Pages build.
 */
const unavailable = (): never => {
  throw new Error('The in-page server only exists in the static GitHub Pages build.');
};

export const connect = unavailable;
export const levels = unavailable;
export const getReplay = unavailable;
export const info = unavailable;
