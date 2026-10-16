import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { generateModel } from '../server/services/rodin';

/**
 * Three ways for the Scene Agent to reach Hyper3D Rodin (all Gen-2.5,
 * image-to-3D, Raw mesh, 20k faces, GLB):
 *
 *   rest     RODIN_API_KEY + the REST API (server/services/rodin.ts)
 *   cli      the official Hyper3D CLI (`@hyper3d/cli`, "backed by MCP"),
 *            logged in once with `npx @hyper3d/cli auth login`; same account
 *            and credits as the Hyper3D MCP server
 *   handoff  no credentials on this machine: the agent prepares everything
 *            and writes a hand-off file; a coding agent that has the Hyper3D
 *            MCP (see .mcp.json) runs the generations and calls `level-finish`
 */

export type Backend = 'rest' | 'cli' | 'handoff';

export interface GenerateRequest {
  id: string;
  png: string;
  prompt: string;
}

export interface Generated {
  id: string;
  generationId: string;
  glb: Uint8Array;
  backend: Backend;
}

const TIER = 'Gen-2.5-High';
const CLI = ['-y', '@hyper3d/cli@0.2.0'];

export function cliLoggedIn() {
  return existsSync(path.join(os.homedir(), '.hyper3d'));
}

/** Pick the best available backend (or the one asked for). */
export function chooseBackend(wanted?: string): Backend {
  if (wanted === 'rest' || wanted === 'cli' || wanted === 'handoff') return wanted;
  if (config.rodin.apiKey) return 'rest';
  if (cliLoggedIn()) return 'cli';
  return 'handoff';
}

function run(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', [...CLI, ...args], { shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`hyper3d ${args[0]} timed out`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`hyper3d ${args[0]} failed (${code}): ${err.trim() || out.trim()}`));
    });
  });
}

function json<T>(text: string): T {
  const start = text.indexOf('{');
  return JSON.parse(start >= 0 ? text.slice(start) : text) as T;
}

/** Generate one model through the Hyper3D CLI. */
async function viaCli(req: GenerateRequest, log: (s: string) => void): Promise<Generated> {
  const started = json<{ generation_id?: string; id?: string; uuid?: string }>(
    await run(['generate', '--image', req.png, '--prompt', req.prompt, '--tier', TIER, '--mesh-mode', 'Raw', '--quality', '20000', '--format', 'glb', '--output', 'json'], 120_000),
  );
  const generationId = started.generation_id ?? started.id ?? started.uuid;
  if (!generationId) throw new Error('hyper3d generate returned no id');
  log(`${req.id}: generation ${generationId}`);
  await run(['poll', generationId, '--timeout', '900', '--output', 'json'], 960_000);
  const result = json<{ files?: { name: string; url: string }[] }>(await run(['result', generationId, '--output', 'json'], 120_000));
  const files = result.files ?? [];
  const pick = files.find((f) => /pbr.*\.glb$/i.test(f.name)) ?? files.find((f) => f.name.toLowerCase().endsWith('.glb'));
  if (!pick) throw new Error(`hyper3d result for ${generationId} has no GLB`);
  const res = await fetch(pick.url);
  if (!res.ok) throw new Error(`downloading ${pick.name} failed: HTTP ${res.status}`);
  return { id: req.id, generationId, glb: new Uint8Array(await res.arrayBuffer()), backend: 'cli' };
}

async function viaRest(req: GenerateRequest): Promise<Generated> {
  const png = await readFile(req.png);
  const { uuid, glb } = await generateModel({ ...config.rodin, tier: TIER }, { image: new Uint8Array(png), mime: 'image/png', filename: path.basename(req.png), prompt: req.prompt });
  return { id: req.id, generationId: uuid, glb, backend: 'rest' };
}

/** Run up to `parallel` generations at once. Failures are reported, not thrown. */
export async function generateAll(backend: Exclude<Backend, 'handoff'>, reqs: GenerateRequest[], log: (s: string) => void, parallel = 4) {
  const done: Generated[] = [];
  const failed: { id: string; error: string }[] = [];
  const queue = [...reqs];
  await Promise.all(
    Array.from({ length: Math.min(parallel, queue.length) }, async () => {
      for (let req = queue.shift(); req; req = queue.shift()) {
        try {
          log(`🪄 Rodin ${TIER} (${backend}): ${req.id}…`);
          done.push(backend === 'cli' ? await viaCli(req, log) : await viaRest(req));
          log(`✅ ${req.id} generated`);
        } catch (err) {
          failed.push({ id: req.id, error: (err as Error).message });
          log(`⚠️ ${req.id}: ${(err as Error).message}`);
        }
      }
    }),
  );
  return { done, failed };
}

export const RODIN_SETTINGS = { tier: TIER, mesh_mode: 'Raw', quality_override: 20000, geometry_file_format: 'glb' } as const;
