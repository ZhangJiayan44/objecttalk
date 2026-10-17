import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../server/config';
import { startServer } from '../server/index';

describe('separately hosted frontend', () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let directory: string;
  const originalOrigins = [...config.allowedOrigins];
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'objecttalk-deployment-'));
    config.allowedOrigins.splice(0, config.allowedOrigins.length, 'https://play.example.com');
    server = await startServer({ port: 0, quiet: true, dataDir: directory });
  });
  afterAll(async () => {
    await server?.close();
    config.allowedOrigins.splice(0, config.allowedOrigins.length, ...originalOrigins);
    if (directory && path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('objecttalk-deployment-')) await rm(directory, { recursive: true, force: true });
  });
  it('lets the published frontend read API data and complete upload preflights', async () => {
    const url = `http://localhost:${server.port}`;
    const health = await fetch(`${url}/api/health`, { headers: { Origin: 'https://play.example.com' } });
    expect(health.status).toBe(200);
    expect(health.headers.get('access-control-allow-origin')).toBe('https://play.example.com');
    const preflight = await fetch(`${url}/api/studio/generate`, { method: 'OPTIONS', headers: { Origin: 'https://play.example.com', 'Access-Control-Request-Method': 'POST' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  });
  it('rejects other browser origins without reflecting permissive CORS headers', async () => {
    const response = await fetch(`http://localhost:${server.port}/api/info`, { headers: { Origin: 'https://unrelated.example.com' } });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('routes API and generated uploads to the configured backend while static models stay on the CDN', async () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://api.example.com/');
    vi.resetModules();
    try {
      const { backendUrl } = await import('../src/lib/backend');
      expect(backendUrl('/api/info')).toBe('https://api.example.com/api/info');
      expect(backendUrl('/generated/rocket.glb')).toBe('https://api.example.com/generated/rocket.glb');
      expect(backendUrl('/models/rocket.glb')).toBe('/models/rocket.glb');
    } finally { vi.unstubAllEnvs(); }
  });
});
