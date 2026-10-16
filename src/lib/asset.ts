/**
 * Public asset URL under the deploy base. The app is served from "/" by the
 * Node server and from "/objecttalk/" on GitHub Pages; data paths such as
 * "/models/x.glb" stay root-relative in the catalog and get the base here.
 * Absolute URLs (http, data:, blob:) pass through.
 */
export function asset(path: string): string;
export function asset(path: string | undefined): string | undefined;
export function asset(path: string | undefined): string | undefined {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return path;
  const base = import.meta.env.BASE_URL;
  return base === '/' ? path : `${base.replace(/\/$/, '')}${path}`;
}
