import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { config } from '../server/config';
import { generateModel } from '../server/services/rodin';

/**
 * Three ways for the Scene Agent to reach Hyper3D Rodin (all Gen-2.5,
 * image-to-3D, Raw mesh, 20k faces, GLB):
 *
 *   rest     RODIN_API_KEY + the REST API (server/services/rodin.ts).
 *            Key: https://hyper3d.ai/workspace/api-dashboard (API access needs the Business plan)
 *   cli      the official Hyper3D CLI (`@hyper3d/cli`, which talks to the Hyper3D MCP
 *            server), logged in once with `npm run agent -- login`; uses the credits of
 *            the workspace you approve in the browser. Needs Node >= 22.
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
const CLI_VERSION = '0.2.0';

/** Where the CLI keeps its OAuth tokens (override with HYPER3D_CONFIG_DIR). */
export const cliConfigDir = () => process.env.HYPER3D_CONFIG_DIR || path.join(os.homedir(), '.hyper3d');

export function cliLoggedIn() {
  return existsSync(cliConfigDir());
}

/** Pick the best available backend (or the one asked for). */
export function chooseBackend(wanted?: string): Backend {
  if (wanted === 'rest' || wanted === 'cli' || wanted === 'handoff') return wanted;
  if (config.rodin.apiKey) return 'rest';
  if (cliLoggedIn()) return 'cli';
  return 'handoff';
}

/**
 * The CLI's entry script. A locally installed `@hyper3d/cli` (devDependency) is run with the
 * current Node directly: no shell, so prompts with spaces and quotes are passed safely.
 * Without it we fall back to `npx`, where arguments must be shell-quoted on Windows.
 */
function cliCommand(): { cmd: string; pre: string[]; shell: boolean } {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('@hyper3d/cli/package.json');
    const pkg = require(pkgPath) as { bin?: string | Record<string, string> };
    const bin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin?.hyper3d ?? Object.values(pkg.bin ?? {})[0]);
    if (bin) return { cmd: process.execPath, pre: [path.join(path.dirname(pkgPath), bin)], shell: false };
  } catch {
    /* not installed locally */
  }
  const win = process.platform === 'win32';
  return { cmd: win ? 'npx.cmd' : 'npx', pre: ['-y', `@hyper3d/cli@${CLI_VERSION}`], shell: win };
}

const quote = (a: string) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : `"${a.replace(/(["^&|<>%])/g, '^$1')}"`);

/** Run the CLI. `--output json` is a global option, so it goes before the sub-command. */
export function runCli(args: string[], opts: { timeoutMs?: number; json?: boolean; inherit?: boolean } = {}): Promise<string> {
  const { cmd, pre, shell } = cliCommand();
  const full = [...pre, ...(opts.json === false ? [] : ['--output', 'json']), ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, shell ? full.map(quote) : full, { shell, stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`hyper3d ${args[0]} timed out`));
    }, opts.timeoutMs ?? 120_000);
    child.stdout?.on('data', (d) => (out += d));
    child.stderr?.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`hyper3d ${args.join(' ').slice(0, 60)} failed (${code}): ${(err.trim() || out.trim()).slice(0, 300)}`));
    });
  });
}

/** The first JSON value in the CLI's output (it may print notices before it). */
export function parseCliJson<T>(text: string): T {
  const start = text.search(/[{[]/);
  if (start < 0) throw new Error(`hyper3d printed no JSON: ${text.trim().slice(0, 120)}`);
  return JSON.parse(text.slice(start)) as T;
}

interface CliGeneration {
  generation_id?: string;
  status?: string;
  timed_out?: boolean;
  files?: { name: string; url: string }[];
}

/** Generate one model through the Hyper3D CLI. */
async function viaCli(req: GenerateRequest, log: (s: string) => void): Promise<Generated> {
  const started = parseCliJson<CliGeneration>(
    await runCli(['generate', '--image', req.png, '--prompt', req.prompt, '--tier', TIER, '--mesh-mode', 'Raw', '--quality', '20000', '--format', 'glb'], { timeoutMs: 180_000 }),
  );
  const generationId = started.generation_id;
  if (!generationId) throw new Error('hyper3d generate returned no generation_id');
  log(`   ${req.id}: generation ${generationId}`);
  // Fast-mode generations take 1-3 minutes; poll in chunks so a slow queue cannot hang the run.
  const deadline = Date.now() + 15 * 60_000;
  for (;;) {
    const state = parseCliJson<CliGeneration>(await runCli(['poll', generationId, '--timeout', '240'], { timeoutMs: 300_000 }));
    if (state.status === 'completed') break;
    if (state.status === 'failed' || state.status === 'cancelled') throw new Error(`generation ${generationId} ${state.status}`);
    if (Date.now() > deadline) throw new Error(`generation ${generationId} is still ${state.status ?? 'running'} after 15 minutes`);
  }
  const result = parseCliJson<CliGeneration>(await runCli(['result', generationId]));
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

// ---------------------------------------------------------------------------
// Preflight checks (`npm run agent -- doctor`)
// ---------------------------------------------------------------------------

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

/** REST: is the key accepted, and is there balance? (GET /check_balance spends nothing.) */
export async function checkRest(): Promise<Check> {
  if (!config.rodin.apiKey)
    return { name: 'Rodin API key (REST backend)', ok: false, detail: 'RODIN_API_KEY is not set', fix: 'Create a key at https://hyper3d.ai/workspace/api-dashboard (needs the Business plan) and put RODIN_API_KEY=... in .env' };
  try {
    const res = await fetch(`${config.rodin.base}/check_balance`, { headers: { Authorization: `Bearer ${config.rodin.apiKey}` }, signal: AbortSignal.timeout(20_000) });
    const json = (await res.json().catch(() => ({}))) as { balance?: number; error?: string; message?: string };
    if (!res.ok) return { name: 'Rodin API key (REST backend)', ok: false, detail: `HTTP ${res.status} ${json.error ?? json.message ?? ''}`.trim(), fix: 'Check the key was copied in full and belongs to a workspace with API access.' };
    const balance = Number(json.balance ?? 0);
    return { name: 'Rodin API key (REST backend)', ok: balance > 0, detail: `key accepted, balance ${balance} credits`, fix: balance > 0 ? undefined : 'The workspace has no credits: top up or redeem a code at https://hyper3d.ai' };
  } catch (err) {
    return { name: 'Rodin API key (REST backend)', ok: false, detail: `api.hyper3d.com unreachable: ${(err as Error).message}` };
  }
}

/** CLI: Node version, login state and the authorized workspace's credits. */
export async function checkCli(): Promise<Check> {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) return { name: 'Hyper3D CLI backend', ok: false, detail: `Node ${process.versions.node}: the Hyper3D CLI needs Node 22 or newer` };
  try {
    const out = await runCli(['auth', 'status'], { timeoutMs: 90_000 });
    // With --output json the CLI exits 0 even when signed out, so read the flag.
    const status = parseCliJson<{ authenticated?: boolean; [k: string]: unknown }>(out);
    if (status.authenticated === false)
      return { name: 'Hyper3D CLI backend', ok: false, detail: 'not signed in', fix: 'Run: npm run agent -- login   (approve the code shown in the terminal in your browser)' };
    return { name: 'Hyper3D CLI backend', ok: true, detail: JSON.stringify(status).slice(0, 260) };
  } catch (err) {
    const msg = (err as Error).message;
    const notLoggedIn = /not authenticated|auth login/i.test(msg);
    return { name: 'Hyper3D CLI backend', ok: false, detail: notLoggedIn ? 'not signed in' : msg.slice(0, 200), fix: notLoggedIn ? 'Run: npm run agent -- login   (opens the browser; approve the code shown in the terminal)' : undefined };
  }
}

/** Interactive sign-in: prints a code, opens the browser, saves tokens to ~/.hyper3d. */
export function cliLogin(noBrowser: boolean) {
  return runCli(['auth', 'login', ...(noBrowser ? ['--no-browser'] : [])], { json: false, inherit: true, timeoutMs: 10 * 60_000 });
}
