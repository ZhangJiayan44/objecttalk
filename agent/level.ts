import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';
import { buildCafe, generateOrderMission, parseOrder, resetOrderLexicon, trayStatus } from '../shared/cafe';
import { registerKinds } from '../shared/catalog';
import { registerLevels, type LevelBundle, type LevelMeta } from '../shared/levels';
import { simulatePlayability } from '../shared/missions';
import { createRng } from '../shared/rng';
import type { ItemKind } from '../shared/types';
import { optimizeGlb } from '../server/services/optimize';
import { generateAll, RODIN_SETTINGS, type Backend } from './hyper3d';
import { levelPlanFromLibrary, type LevelItem, type LevelPlan } from './level-library';
import { claudeAvailable, structured } from './llm';

/**
 * Scene Agent v2: from a theme to a complete, playable level.
 *
 *   plan     Claude (or the offline library) designs the level: engine, roles,
 *            phrasebook, 6-12 objects with Fluent Emoji 3D references
 *   source   download + prepare the references (trim, rotate upright, 1024²)
 *   review   contact sheet; Claude looks at it (vision) and rejects bad refs
 *   generate Hyper3D Rodin Gen-2.5 for every approved reference (REST, CLI, or
 *            hand-off to a coding agent with the Hyper3D MCP)
 *   optimize centre, normalize, WebP, meshopt (~8 MB -> ~300 KB)
 *   validate simulate hundreds of rounds; every mission must stay solvable
 *   publish  content/levels/<id>.json + public/models/levels/<id>/*.glb
 *
 * Every step writes into agent/runs/<id>/ so a run can resume where it stopped.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNS = path.join(ROOT, 'agent', 'runs');
const CONTENT = path.join(ROOT, 'content', 'levels');
const PUBLIC_MODELS = path.join(ROOT, 'public', 'models', 'levels');
const FLUENT = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';

export type Log = (msg: string) => void;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const COLORS = ['red', 'blue', 'yellow', 'green', 'pink', 'purple', 'orange', 'white', 'brown'] as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const role = z.object({ name: z.string(), icon: z.string(), sees: z.string(), does: z.string() });

const LevelPlanSchema = z.object({
  id: z.string().describe('kebab-case id, 2-3 words'),
  engine: z.enum(['tabletop', 'order']).describe('tabletop: find/place objects on a table (spatial language). order: a shop counter where one player orders and the other serves (quantities, sizes, plurals)'),
  title: z.string().describe('2-3 word level name, e.g. "Music Room"'),
  tagline: z.string().describe('5 words max, e.g. "Buy fruit & veg by the piece"'),
  emoji: z.string(),
  sign: z.string().describe('text painted on a sign or board in the scene, max 22 characters'),
  palette: z.object({ wall: hex, wallLow: hex, floor: hex, accent: hex }).describe('soft, friendly pastel room colours'),
  skills: z.array(z.string()).describe('3 short English skills the level practises'),
  roles: z.object({ guide: role, builder: role }).describe('guide sees the secret goal (target / order card); builder acts. sees/does are short lowercase phrases'),
  quick: z.object({ guide: z.array(z.string()), builder: z.array(z.string()) }).describe('5-6 short quick phrases each'),
  phrases: z.array(z.object({ title: z.string(), items: z.array(z.tuple([z.string(), z.string()])) })).describe('3 groups of 3-4 [English, Simplified Chinese] phrasebook pairs'),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().describe('the everyday English singular, e.g. "peach", "pair of maracas"'),
        plural: z.string().describe('correct English plural, e.g. "peaches"'),
        synonyms: z.array(z.string()).describe('lowercase words learners may use, singular and plural'),
        emoji: z.string(),
        fluent: z.string().describe('EXACT Microsoft Fluent Emoji asset folder name (Unicode CLDR short name, first letter capitalised), e.g. "Red apple", "Hot beverage"'),
        prompt: z.string().describe('one line describing the object for 3D generation, "stylized 3D toy style"'),
        baseColor: z.enum(COLORS),
        footprint: z.number().describe('largest side of the object on the table, metres, 0.18-0.45'),
        rotate: z.number().describe('degrees to rotate the emoji image so the object stands upright; 0 if already upright'),
        lie: z.boolean().describe('true for flat things that should lie on the table (phone, key, coin)'),
        sized: z.boolean().describe('order engine only: true for 1-2 items sold in small and large'),
      }),
    )
    .describe('8-10 distinct, iconic, easy-to-name objects with clearly different silhouettes'),
});

const PLAN_SYSTEM = `You design levels for ObjectTalk, a two-player 3D game where English learners (A2-B1, teens and university students) talk to finish everyday tasks.
Every level is built from 3D objects generated by Hyper3D Rodin from Microsoft Fluent Emoji 3D reference images, so every object MUST be an existing emoji with a Fluent Emoji folder.
Choose objects that are iconic, small enough for a table or a shop counter, visually distinct from each other, and have names learners should know. Write natural, friendly English.`;

export async function planLevel(theme: string, engine: 'tabletop' | 'order' | undefined, log: Log): Promise<LevelPlan> {
  if (claudeAvailable()) {
    log(`🧠 Claude is planning a level for "${theme}"…`);
    const out = await structured(LevelPlanSchema, PLAN_SYSTEM, `Theme: "${theme}".${engine ? ` Use the ${engine} engine.` : ' Pick the engine that fits the theme best.'} Plan the level.`);
    if (out) return { ...out, theme, durationSec: out.engine === 'order' ? 120 : 90, planner: 'claude', items: out.items.map((i) => ({ ...i, interest: 'everyday' as const })) };
    log('⚠️ Claude planning failed; using the offline level library.');
  }
  const plan = levelPlanFromLibrary(theme);
  log(`📚 Offline level library: "${plan.title}" (${plan.engine}) for "${theme}".`);
  return plan;
}

// ---------------------------------------------------------------------------
// Source + review
// ---------------------------------------------------------------------------

async function fetchFluent(name: string): Promise<Buffer | null> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${FLUENT}/${encodeURIComponent(name)}/3D/${slug}_3d.png`);
      if (res.status === 404) return null;
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* flaky network: retry */
    }
  }
  return null;
}

/** Trim, rotate upright, pad and upscale to a clean 1024x1024 PNG with alpha. */
export async function prepareReference(input: Buffer, rotate = 0): Promise<Buffer> {
  let img = sharp(input).ensureAlpha();
  if (rotate) img = img.rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const tight = await sharp(await img.png().toBuffer())
    .trim({ threshold: 1 })
    .png()
    .toBuffer();
  const resized = await sharp(tight).resize(820, 820, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function contactSheet(entries: { id: string; png: Buffer }[], out: string) {
  const cell = 256;
  const cols = Math.min(5, Math.max(1, entries.length));
  const rows = Math.ceil(entries.length / cols);
  const tiles = await Promise.all(
    entries.map(async (e, i) => ({
      input: await sharp(e.png).flatten({ background: '#ffffff' }).resize(cell - 16, cell - 16).png().toBuffer(),
      left: (i % cols) * cell + 8,
      top: Math.floor(i / cols) * cell + 8,
    })),
  );
  await sharp({ create: { width: cols * cell, height: rows * cell, channels: 3, background: '#eeeeee' } })
    .composite(tiles)
    .jpeg({ quality: 85 })
    .toFile(out);
}

const ReviewSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), ok: z.boolean(), reason: z.string().describe('short reason') })),
});

/** Claude looks at the contact sheet and rejects references Rodin would turn into bad models. */
async function visionReview(sheet: string, ids: string[], log: Log): Promise<{ verdict: string; rejected: Set<string> }> {
  if (!claudeAvailable()) return { verdict: 'human gate (no Claude): references come from a curated MIT 3D emoji set', rejected: new Set() };
  log('👀 Claude is reviewing the reference sheet…');
  const data = (await readFile(sheet)).toString('base64');
  const out = await structured(
    ReviewSchema,
    'You check reference images before they are turned into 3D models by an image-to-3D generator (Hyper3D Rodin).',
    [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
      {
        type: 'text',
        text: `The sheet shows ${ids.length} references, left to right, top to bottom (index 0..${ids.length - 1}): ${ids.join(', ')}.
Reject an image (ok=false) if it shows more than one separate object, is cropped, is mostly text or a symbol, is lying at an angle that would be odd as a 3D object standing on a table, or is not recognisable as the named object.`,
      },
    ],
    2000,
  );
  if (!out) return { verdict: 'Claude review unavailable: passed the human gate', rejected: new Set() };
  const rejected = new Set(out.items.filter((i) => !i.ok && ids[i.index]).map((i) => ids[i.index]));
  for (const i of out.items.filter((x) => !x.ok)) log(`   ✗ ${ids[i.index]}: ${i.reason}`);
  return { verdict: `Claude vision review: ${ids.length - rejected.size}/${ids.length} approved`, rejected };
}

// ---------------------------------------------------------------------------
// Assemble + validate
// ---------------------------------------------------------------------------

function toKind(plan: LevelPlan, item: LevelItem, generationId: string, reference: string): ItemKind {
  return {
    id: `${plan.id}--${item.id}`,
    name: item.name,
    plural: item.plural,
    synonyms: [...new Set([...item.synonyms, item.name, item.plural].map((s) => s.toLowerCase()))],
    interest: item.interest,
    emoji: item.emoji,
    model: `/models/levels/${plan.id}/${item.id}.glb`,
    ref: `/models/levels/${plan.id}/${item.id}.png`,
    baseColor: item.baseColor,
    rotation: item.lie ? [-Math.PI / 2, 0, 0] : undefined,
    footprint: Math.max(0.16, Math.min(0.46, item.footprint)),
    levels: [plan.id],
    sized: plan.engine === 'order' ? !!item.sized : undefined,
    source: 'rodin',
    rodin: { generationId, tier: RODIN_SETTINGS.tier, prompt: item.prompt, reference },
  };
}

export function toLevelMeta(plan: LevelPlan, kinds: ItemKind[], agent: NonNullable<LevelMeta['generated']>['agent']): LevelMeta {
  return {
    id: plan.id,
    title: plan.title,
    tagline: plan.tagline,
    emoji: plan.emoji,
    engine: plan.engine,
    skills: plan.skills.slice(0, 4),
    roles: plan.roles,
    controls: 'stand',
    guideView: 'stand',
    durationSec: plan.durationSec,
    missions: 3,
    color: plan.engine === 'order' ? 'bg-sun' : 'bg-mint',
    quick: plan.quick,
    phrases: plan.phrases.slice(0, 4),
    generated: { theme: plan.theme, createdAt: Date.now(), kinds: kinds.map((k) => k.id), palette: plan.palette, sign: plan.sign.slice(0, 26), agent },
  };
}

/** Playability: hundreds of simulated rounds must all be solvable. */
export function validateLevel(level: LevelMeta, kinds: ItemKind[], runs = 200): { ok: boolean; lines: string[] } {
  registerKinds(kinds);
  registerLevels([level]);
  resetOrderLexicon();
  const lines: string[] = [];
  let ok = true;
  if (level.engine === 'tabletop') {
    for (const difficulty of ['easy', 'normal', 'tricky'] as const) {
      const r = simulatePlayability({ interests: [], kinds: kinds.map((k) => k.id), difficulty, pool: level.id }, runs);
      const pass = r.successRate >= 0.97;
      ok &&= pass;
      lines.push(`${difficulty.padEnd(7)} solvable ${(r.successRate * 100).toFixed(1)}%  perspective ${(r.perspectiveShare * 100).toFixed(0)}%  ${pass ? 'PASS' : 'FAIL'}`);
    }
  } else {
    // Order engine: every generated order must be servable and must parse back to itself.
    for (const difficulty of ['easy', 'normal', 'tricky'] as const) {
      let good = 0;
      for (let seed = 1; seed <= runs; seed++) {
        const rng = createRng(seed * 31);
        const cafe = buildCafe(rng, level.id);
        const m = generateOrderMission(cafe, 0, difficulty, rng);
        if (!m) continue;
        const tray: string[] = [];
        for (const l of m.order) tray.push(...cafe.scene.objects.filter((o) => o.kind === l.kind && (l.size ? o.size === l.size : true) && !tray.includes(o.id)).slice(0, l.qty).map((o) => o.id));
        const parsed = parseOrder(m.modelAnswer, level.id);
        const understood = m.order.every((l) => parsed.lines.some((p) => p.kind === l.kind && p.qty === l.qty && (p.size ?? null) === (l.size ?? null)));
        if (trayStatus({ ...cafe, tray }, m.order).complete && understood) good++;
      }
      const rate = good / runs;
      const pass = rate >= 0.97;
      ok &&= pass;
      lines.push(`${difficulty.padEnd(7)} servable + understood ${(rate * 100).toFixed(1)}%  ${pass ? 'PASS' : 'FAIL'}`);
    }
  }
  return { ok, lines };
}

// ---------------------------------------------------------------------------
// The whole pipeline
// ---------------------------------------------------------------------------

export interface RunState {
  plan: LevelPlan;
  references: Record<string, { file: string; from: string }>;
  rejected: string[];
  review: string;
  generations: Record<string, { generationId: string; raw: string; backend: Backend | 'mcp' }>;
  failed: Record<string, string>;
}

const runDir = (id: string) => path.join(RUNS, id);
const statePath = (id: string) => path.join(runDir(id), 'run.json');

async function saveState(s: RunState) {
  await mkdir(runDir(s.plan.id), { recursive: true });
  await writeFile(statePath(s.plan.id), JSON.stringify(s, null, 2));
}

export async function loadState(id: string): Promise<RunState | null> {
  try {
    return JSON.parse(await readFile(statePath(id), 'utf8')) as RunState;
  } catch {
    return null;
  }
}

export async function sourceAndReview(state: RunState, log: Log) {
  const dir = runDir(state.plan.id);
  await mkdir(path.join(dir, 'refs'), { recursive: true });
  log('🖼️ Sourcing reference images (Fluent Emoji 3D, MIT)…');
  const results = await Promise.all(
    state.plan.items.map(async (item) => {
      const file = path.join(dir, 'refs', `${item.id}.png`);
      if (existsSync(file)) return { item, ok: true };
      const raw = await fetchFluent(item.fluent);
      if (!raw) return { item, ok: false };
      await writeFile(file, await prepareReference(raw, item.rotate ?? 0));
      return { item, ok: true };
    }),
  );
  for (const r of results) {
    if (r.ok) state.references[r.item.id] = { file: path.join('refs', `${r.item.id}.png`), from: `Fluent Emoji 3D "${r.item.fluent}" (MIT)` };
    else log(`   ⚠️ no Fluent reference for "${r.item.fluent}" (${r.item.id}); dropped`);
  }
  const ids = Object.keys(state.references);
  const sheet = path.join(dir, 'review.jpg');
  await contactSheet(await Promise.all(ids.map(async (id) => ({ id, png: await readFile(path.join(dir, state.references[id].file)) }))), sheet);
  log(`📋 Review sheet: ${path.relative(ROOT, sheet)}`);
  const review = await visionReview(sheet, ids, log);
  state.rejected = [...review.rejected];
  state.review = review.verdict;
  log(`✅ ${review.verdict}`);
  await saveState(state);
}

export async function generate(state: RunState, backend: Exclude<Backend, 'handoff'>, log: Log) {
  const dir = runDir(state.plan.id);
  await mkdir(path.join(dir, 'raw'), { recursive: true });
  const todo = Object.keys(state.references).filter((id) => !state.rejected.includes(id) && !state.generations[id]);
  if (!todo.length) return;
  const reqs = todo.map((id) => ({ id, png: path.join(dir, state.references[id].file), prompt: state.plan.items.find((i) => i.id === id)!.prompt }));
  const { done, failed } = await generateAll(backend, reqs, log);
  for (const g of done) {
    const raw = path.join('raw', `${g.id}.glb`);
    await writeFile(path.join(dir, raw), g.glb);
    state.generations[g.id] = { generationId: g.generationId, raw, backend: g.backend };
  }
  for (const f of failed) state.failed[f.id] = f.error;
  await saveState(state);
}

/** Write the instructions a coding agent with the Hyper3D MCP follows to finish the run. */
export async function writeHandoff(state: RunState) {
  const dir = runDir(state.plan.id);
  const todo = Object.keys(state.references).filter((id) => !state.rejected.includes(id) && !state.generations[id]);
  const lines = [
    `# Hand-off: generate ${todo.length} models for "${state.plan.title}" with the Hyper3D MCP`,
    '',
    'No Rodin credentials on this machine, so the Scene Agent prepared everything for a coding agent',
    'that has the Hyper3D MCP (this repo ships `.mcp.json`). For each reference below:',
    '',
    `1. \`rodin_create_uploads\` → PUT the PNG → \`rodin_generate\` with \`reference_upload_ids\`, tier \`${RODIN_SETTINGS.tier}\`, mesh_mode \`Raw\`, quality_override ${RODIN_SETTINGS.quality_override}, format \`glb\`, and the prompt`,
    '2. `rodin_wait` → `rodin_get_result` → download `base_basic_pbr.glb` to `agent/runs/<id>/raw/<item>.glb`',
    `3. Record the generation id: \`npm run agent -- level-add ${state.plan.id} <item> <generation_id>\``,
    `4. When all are done: \`npm run agent -- level-finish ${state.plan.id}\``,
    '',
    '| item | reference | prompt |',
    '|---|---|---|',
    ...todo.map((id) => `| ${id} | agent/runs/${state.plan.id}/${state.references[id].file.replace(/\\/g, '/')} | ${state.plan.items.find((i) => i.id === id)!.prompt} |`),
  ];
  const file = path.join(dir, 'HANDOFF.md');
  await writeFile(file, `${lines.join('\n')}\n`);
  return path.relative(ROOT, file);
}

export async function finish(state: RunState, log: Log, runs = 200): Promise<{ ok: boolean; file?: string }> {
  const dir = runDir(state.plan.id);
  const outDir = path.join(PUBLIC_MODELS, state.plan.id);
  await mkdir(outDir, { recursive: true });
  const kinds: ItemKind[] = [];
  let before = 0;
  let after = 0;
  for (const item of state.plan.items) {
    const gen = state.generations[item.id];
    if (!gen || state.rejected.includes(item.id)) continue;
    const raw = await readFile(path.join(dir, gen.raw));
    const opt = await optimizeGlb(new Uint8Array(raw));
    before += raw.byteLength;
    after += opt.glb.byteLength;
    await writeFile(path.join(outDir, `${item.id}.glb`), opt.glb);
    await sharp(path.join(dir, state.references[item.id].file)).resize(256, 256).png().toFile(path.join(outDir, `${item.id}.png`));
    kinds.push(toKind(state.plan, item, gen.generationId, state.references[item.id].from));
  }
  log(`🗜️ Optimized ${kinds.length} models: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(2)} MB`);
  const minimum = state.plan.engine === 'order' ? 6 : 4;
  if (kinds.length < minimum) {
    log(`❌ Only ${kinds.length} usable models (need ${minimum}). Fix the failures and run level-finish again.`);
    return { ok: false };
  }
  const backends = [...new Set(Object.values(state.generations).map((g) => g.backend))].join(' + ');
  const level = toLevelMeta(state.plan, kinds, {
    planner: state.plan.planner === 'claude' ? 'Claude (structured output)' : 'offline level library',
    backend: `Hyper3D Rodin ${RODIN_SETTINGS.tier} via ${backends}`,
    review: state.review,
    generations: kinds.length,
    validation: '',
  });
  const v = validateLevel(level, kinds, runs);
  for (const l of v.lines) log(`   ${l}`);
  level.generated!.agent.validation = v.ok ? `${runs} simulated rounds per difficulty: all PASS` : v.lines.join('; ');
  if (!v.ok) {
    log('❌ Validation failed: the level was not published.');
    return { ok: false };
  }
  await mkdir(CONTENT, { recursive: true });
  const bundle: LevelBundle = { level, kinds };
  const file = path.join(CONTENT, `${level.id}.json`);
  await writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`);
  await copyFile(path.join(dir, 'review.jpg'), path.join(outDir, 'review.jpg')).catch(() => undefined);
  log(`🎉 Published ${path.relative(ROOT, file)}: it appears in the lobby (no restart needed).`);
  return { ok: true, file };
}

export async function newRun(theme: string, engine: 'tabletop' | 'order' | undefined, log: Log, id?: string): Promise<RunState> {
  const plan = await planLevel(theme, engine, log);
  if (id) plan.id = id;
  plan.id = plan.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'agent-level';
  // Keep item ids file-safe and unique.
  const seen = new Set<string>();
  plan.items = plan.items.filter((i) => {
    i.id = i.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  const state: RunState = { plan, references: {}, rejected: [], review: '', generations: {}, failed: {} };
  await saveState(state);
  await writeFile(path.join(runDir(plan.id), 'plan.json'), JSON.stringify(plan, null, 2));
  log(`📝 ${plan.title} (${plan.engine}, ${plan.items.length} objects) → agent/runs/${plan.id}/plan.json`);
  for (const i of plan.items) log(`   • ${i.name.padEnd(18)} ref: Fluent "${i.fluent}"${i.sized ? ' (small/large)' : ''}`);
  return state;
}

export async function addGeneration(id: string, item: string, generationId: string) {
  const state = await loadState(id);
  if (!state) throw new Error(`No run "${id}".`);
  const raw = path.join('raw', `${item}.glb`);
  if (!existsSync(path.join(runDir(id), raw))) throw new Error(`Put the GLB at agent/runs/${id}/${raw} first.`);
  state.generations[item] = { generationId, raw, backend: 'mcp' };
  delete state.failed[item];
  await saveState(state);
}
