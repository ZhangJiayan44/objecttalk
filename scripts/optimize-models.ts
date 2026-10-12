/**
 * Optimize raw Rodin GLB exports for the web.
 *
 *   tsx scripts/optimize-models.ts <inDir> <outDir> [--size 1024]
 *
 * Uses the same optimizer as the Object Studio API and the Scene Agent
 * (server/services/optimize.ts) and prints a JSON size report.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { optimizeGlb } from '../server/services/optimize';

async function main() {
  const [inDir, outDir] = process.argv.slice(2);
  const sizeFlag = process.argv.indexOf('--size');
  const texSize = sizeFlag > 0 ? Number(process.argv[sizeFlag + 1]) : 1024;
  if (!inDir || !outDir) {
    console.error('usage: tsx scripts/optimize-models.ts <inDir> <outDir> [--size 1024]');
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });
  const report = [];
  for (const file of (await readdir(inDir)).filter((f) => f.toLowerCase().endsWith('.glb'))) {
    const input = await readFile(path.join(inDir, file));
    const out = await optimizeGlb(new Uint8Array(input), texSize);
    await writeFile(path.join(outDir, file), out.glb);
    report.push({ file, sizeBefore: input.byteLength, sizeAfter: out.glb.byteLength, triangles: out.triangles, dims: out.dims });
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
