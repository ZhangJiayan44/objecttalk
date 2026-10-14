/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "1" for the static GitHub Pages build (no backend: the server runs in the page). */
  readonly VITE_STATIC?: string;
}

declare module 'virtual:objecttalk-levels' {
  import type { LevelBundle } from '@shared/levels';
  /** content/levels/*.json, bundled at build time. */
  export const LEVEL_BUNDLES: LevelBundle[];
}
