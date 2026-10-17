/** Public service location only; provider credentials stay on the Node server. */
const configured = (import.meta.env.VITE_BACKEND_URL || '').trim().replace(/\/+$/, '');
export const backendOrigin = configured;

export function backendUrl(path: string): string {
  return configured && (path.startsWith('/api/') || path.startsWith('/generated/')) ? `${configured}${path}` : path;
}
