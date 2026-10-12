#!/usr/bin/env node
/**
 * ObjectTalk Scene Agent: batch-produces new object packs for the game.
 *
 *   npm run agent -- plan "breakfast table" [--count 4]
 *   npm run agent -- build <pack> [--images ./photos] [--yes] [--dry-run]
 *   npm run agent -- register <file.glb> --id panda-mug --name "panda mug" [--synonyms cup,panda] [--interest food] [--color white] [--ref ref.png] [--generation <uuid>]
 *   npm run agent -- validate [--kinds rocket,teddy] [--runs 300]
 *
 * Pipeline: plan -> source reference -> review gate -> Rodin Gen-2.5 -> optimize -> register -> validate.
 * "register" is the bridge for assets produced through the Hyper3D MCP by a coding agent.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { z } from 'zod';
import { allKinds, registerKinds } from '../shared/catalog';
import { simulatePlayability } from '../shared/missions';
import type { ColorName, InterestId, ItemKind } from '../shared/types';
import { config } from '../server/config';
import { optimizeGlb } from '../server/services/optimize';
import { generateModel } from '../server/services/rodin';
import { Store } from '../server/services/store';
import { libraryPlan, type PackPlan, type PlannedItem } from './themes';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKS = path.join(ROOT, 'agent', 'packs');
const RUNS = path.join(ROOT, 'agent', 'runs');
const FLUENT = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';

const say = (emoji: string, msg: string) => console.log(`${emoji}  ${msg}`);

function args() {
  const [cmd = 'help', ...rest] = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        flags[a.slice(2)] = next;
        i++;
      } else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { cmd, flags, positional };
}

// ---------------------------------------------------------------------------
// 1. Plan
// ---------------------------------------------------------------------------

const PlanSchema = z.object({
  pack: z.string().describe('short kebab-case pack id'),
  items: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().describe('simple English noun phrase learners know, e.g. "alarm clock"'),
        plural: z.string(),
        synonyms: z.array(z.string()),
        interest: z.enum(['space', 'animals', 'food', 'sports', 'games', 'everyday']),
        fluent: z.string().describe('exact Microsoft Fluent Emoji asset folder name, e.g. "Alarm clock"'),
        prompt: z.string(),
        baseColor: z.enum(['red', 'blue', 'yellow', 'green', 'pink', 'purple', 'orange', 'white', 'brown']),
        footprint: z.number().describe('largest side in metres, 0.2 to 0.45'),
      }),
    )
    .describe('distinct table-top objects with different shapes'),
});

async function planWithClaude(theme: string, count: number): Promise<PackPlan | null> {
  if (!config.llm.enabled) return null;
  const client = new Anthropic({ apiKey: config.llm.apiKey });
  try {
    const res = await client.beta.messages.parse({
      model: config.llm.model,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(PlanSchema) },
      system:
        'You design object packs for ObjectTalk, a 3D game where English learners describe table-top objects to each other. Choose objects that are small, iconic, easy to name, and visually distinct. Each must exist as a Microsoft Fluent Emoji (3D style).',
      messages: [{ role: 'user', content: `Theme: "${theme}". Plan ${count} objects.` }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return null;
    const out = res.parsed_output;
    return { pack: out.pack, theme, planner: 'claude', items: out.items.slice(0, count).map((i) => ({ ...i, interest: i.interest as InterestId | 'everyday', baseColor: i.baseColor as ColorName })) };
  } catch (err) {
    say('⚠️', `Claude planner unavailable (${(err as Error).message}); using the built-in theme library.`);
    return null;
  }
}

async function plan(theme: string, count: number) {
  say('🧠', `Planning an object pack for "${theme}"…`);
  const p = (await planWithClaude(theme, count)) ?? libraryPlan(theme, count);
  await mkdir(PACKS, { recursive: true });
  const file = path.join(PACKS, `${p.pack}.plan.json`);
  await writeFile(file, JSON.stringify(p, null, 2));
  say('📝', `Plan (${p.planner}) saved to ${path.relative(ROOT, file)}`);
  for (const i of p.items) console.log(`     • ${i.name.padEnd(16)} ${i.interest.padEnd(9)} ref: Fluent "${i.fluent}"`);
  say('👉', `Next: npm run agent -- build ${p.pack}`);
  return p;
}

// ---------------------------------------------------------------------------
// 2. Source + prepare reference images
// ---------------------------------------------------------------------------

async function fetchFluent(name: string): Promise<Buffer | null> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const url = `${FLUENT}/${encodeURIComponent(name)}/3D/${slug}_3d.png`;
  try {
    const res = await fetch(url);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Trim, optionally rotate upright, pad and upscale to a clean 1024x1024 PNG with alpha. */
async function prepare(input: Buffer, rotate = 0): Promise<Buffer> {
  let img = sharp(input).ensureAlpha();
  if (rotate) img = img.rotate(rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const trimmed = await img.png().toBuffer();
  const tight = await sharp(trimmed).trim({ threshold: 1 }).png().toBuffer();
  const resized = await sharp(tight).resize(820, 820, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function source(item: PlannedItem, imagesDir?: string): Promise<{ png: Buffer; from: string } | null> {
  if (imagesDir && existsSync(imagesDir)) {
    const files = await readdir(imagesDir);
    const own = files.find((f) => f.toLowerCase().startsWith(item.id.toLowerCase()) && /\.(png|jpe?g|webp)$/i.test(f));
    if (own) return { png: await prepare(await readFile(path.join(imagesDir, own)), item.rotate), from: `local:${own}` };
  }
  const fluent = await fetchFluent(item.fluent);
  return fluent ? { png: await prepare(fluent, item.rotate), from: `Fluent Emoji 3D "${item.fluent}" (MIT)` } : null;
}

/** Contact sheet so a human (or a vision model) can approve references before spending credits. */
async function reviewSheet(entries: { item: PlannedItem; png: Buffer }[], out: string) {
  const cell = 280;
  const tiles = await Promise.all(
    entries.map(async (e, i) => ({
      input: await sharp(e.png).flatten({ background: '#ffffff' }).resize(cell - 20, cell - 20).png().toBuffer(),
      left: i * cell + 10,
      top: 10,
    })),
  );
  await sharp({ create: { width: Math.max(1, entries.length) * cell, height: cell, channels: 3, background: '#eeeeee' } })
    .composite(tiles)
    .png()
    .toFile(out);
}

// ---------------------------------------------------------------------------
// 3-6. Generate, optimize, register, validate
// ---------------------------------------------------------------------------

async function registerKind(store: Store, kind: ItemKind, glb: Uint8Array, ref?: Buffer) {
  const opt = await optimizeGlb(glb);
  await writeFile(path.join(store.modelDir, `${kind.id}.glb`), opt.glb);
  if (ref) await writeFile(path.join(store.modelDir, `${kind.id}.png`), await sharp(ref).resize(256, 256).png().toBuffer());
  const items = (await store.loadItems()).filter((k) => k.id !== kind.id);
  items.push(kind);
  await store.saveItems(items);
  registerKinds([kind]);
  say('🗜️', `${kind.name}: ${(glb.byteLength / 1e6).toFixed(1)} MB -> ${(opt.glb.byteLength / 1e3).toFixed(0)} KB, ${opt.triangles} triangles`);
}

function validate(kinds: string[], runs: number) {
  say('✅', `Playability check: ${runs} simulated rounds per difficulty with [${kinds.join(', ') || 'default interests'}]`);
  let ok = true;
  for (const difficulty of ['easy', 'normal', 'tricky'] as const) {
    const r = simulatePlayability({ interests: kinds.length ? [] : ['space', 'animals', 'food'], kinds, difficulty }, runs);
    const pass = r.successRate >= 0.98;
    ok &&= pass;
    console.log(
      `     ${difficulty.padEnd(7)} solvable ${(r.successRate * 100).toFixed(1).padStart(5)}%  perspective ${(r.perspectiveShare * 100).toFixed(0).padStart(3)}%  avg answer ${r.avgModelAnswerWords.toFixed(1)} words  ${pass ? 'PASS' : 'FAIL'}`,
    );
  }
  return ok;
}

async function build(packId: string, flags: Record<string, string | boolean>) {
  const file = path.join(PACKS, `${packId}.plan.json`);
  if (!existsSync(file)) throw new Error(`No plan for "${packId}". Run: npm run agent -- plan "<theme>"`);
  const p = JSON.parse(await readFile(file, 'utf8')) as PackPlan;
  const dir = path.join(PACKS, p.pack);
  await mkdir(dir, { recursive: true });

  say('🖼️', 'Sourcing reference images…');
  const refs: { item: PlannedItem; png: Buffer; from: string }[] = [];
  for (const item of p.items) {
    const r = await source(item, typeof flags.images === 'string' ? flags.images : undefined);
    if (!r) {
      say('⚠️', `No reference for ${item.name}; skipping (add ./photos/${item.id}.png or fix "fluent").`);
      continue;
    }
    await writeFile(path.join(dir, `${item.id}.png`), r.png);
    refs.push({ item, ...r });
    console.log(`     • ${item.name}: ${r.from}`);
  }
  const sheet = path.join(dir, 'review.png');
  await reviewSheet(refs, sheet);
  say('👀', `Review gate: check ${path.relative(ROOT, sheet)} (one object, whole object, clean background).`);
  if (!flags.yes) {
    say('⏸️', 'Re-run with --yes to approve and spend Rodin credits.');
    return;
  }
  if (flags['dry-run']) {
    say('🧪', 'Dry run: stopping before Rodin.');
    return;
  }
  if (!config.rodin.apiKey) throw new Error('RODIN_API_KEY is not set. Use the Hyper3D MCP + "agent register", or set the key.');

  const store = new Store(config.dataDir);
  await store.init();
  registerKinds(await store.loadItems());
  const report: Record<string, unknown>[] = [];
  for (const r of refs) {
    say('🪄', `Rodin ${config.rodin.tier}: ${r.item.name}…`);
    const { uuid, glb } = await generateModel(config.rodin, { image: new Uint8Array(r.png), mime: 'image/png', filename: `${r.item.id}.png`, prompt: r.item.prompt }, (stage) => process.stdout.write(`     ${stage}\r`));
    const kind: ItemKind = {
      id: r.item.id,
      name: r.item.name,
      plural: r.item.plural,
      synonyms: r.item.synonyms,
      interest: r.item.interest,
      emoji: '✨',
      model: `/generated/${r.item.id}.glb`,
      ref: `/generated/${r.item.id}.png`,
      baseColor: r.item.baseColor,
      footprint: r.item.footprint,
      source: 'rodin',
      rodin: { generationId: uuid, tier: config.rodin.tier, prompt: r.item.prompt, reference: r.from },
    };
    await registerKind(store, kind, glb, r.png);
    report.push({ id: kind.id, generationId: uuid, reference: r.from });
  }
  const ok = validate(
    refs.map((r) => r.item.id),
    Number(flags.runs ?? 200),
  );
  await mkdir(RUNS, { recursive: true });
  await writeFile(path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}-${p.pack}.json`), JSON.stringify({ plan: p, report, playable: ok }, null, 2));
  say(ok ? '🎉' : '⚠️', ok ? `Pack "${p.pack}" is live. Restart the server and pick it in Object Studio.` : 'Some missions failed validation; check the run report.');
}

async function register(glbPath: string, flags: Record<string, string | boolean>) {
  const id = String(flags.id ?? path.basename(glbPath, '.glb'));
  const name = String(flags.name ?? id.replace(/[-_]/g, ' '));
  const store = new Store(config.dataDir);
  await store.init();
  registerKinds(await store.loadItems());
  const kind: ItemKind = {
    id,
    name,
    plural: String(flags.plural ?? `${name}s`),
    synonyms: String(flags.synonyms ?? name)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    interest: (flags.interest as InterestId) ?? 'everyday',
    emoji: '✨',
    model: `/generated/${id}.glb`,
    ref: flags.ref ? `/generated/${id}.png` : undefined,
    baseColor: (flags.color as ColorName) ?? 'white',
    footprint: Number(flags.footprint ?? 0.32),
    source: 'rodin',
    rodin: { generationId: String(flags.generation ?? 'mcp'), tier: String(flags.tier ?? 'Gen-2.5'), prompt: String(flags.prompt ?? ''), reference: String(flags.reference ?? 'via Hyper3D MCP') },
  };
  await registerKind(store, kind, new Uint8Array(await readFile(glbPath)), flags.ref ? await readFile(String(flags.ref)) : undefined);
  validate([id], Number(flags.runs ?? 200));
}

async function main() {
  const { cmd, flags, positional } = args();
  if (cmd === 'plan') await plan(positional.join(' ') || 'breakfast', Number(flags.count ?? 4));
  else if (cmd === 'build') await build(positional[0] ?? '', flags);
  else if (cmd === 'register') await register(positional[0] ?? '', flags);
  else if (cmd === 'validate') {
    const store = new Store(config.dataDir);
    registerKinds(await store.loadItems());
    const kinds = typeof flags.kinds === 'string' ? flags.kinds.split(',') : [];
    const ok = validate(kinds.length ? kinds : allKinds().filter((k) => k.source === 'rodin').map((k) => k.id).slice(0, 3), Number(flags.runs ?? 300));
    process.exitCode = ok ? 0 : 1;
  } else {
    console.log(`ObjectTalk Scene Agent

  npm run agent -- plan "<theme>" [--count 4]       plan an object pack (Claude if ENABLE_LLM=1, else built-in library)
  npm run agent -- build <pack> [--images dir] [--yes] [--dry-run]
                                                    source + review + Rodin + optimize + register + validate
  npm run agent -- register <file.glb> --id <id> --name "<name>" [--synonyms a,b] [--interest food] [--color red] [--ref ref.png]
                                                    add a GLB made with the Hyper3D MCP
  npm run agent -- validate [--kinds a,b] [--runs 300]   playability simulation`);
  }
}

main().catch((err) => {
  console.error(`❌  ${(err as Error).message}`);
  process.exit(1);
});
