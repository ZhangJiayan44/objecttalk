import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { optimizeGlb } from '../server/services/optimize';

const result = await optimizeGlb(new Uint8Array(await readFile(process.argv[2] ?? 'output/nightmarket/shopkeeper.raw.glb')), 512);
await mkdir('public/models/nightmarket', { recursive: true });
await writeFile('public/models/nightmarket/shopkeeper.glb', result.glb);
console.log({ bytes: result.glb.length, triangles: result.triangles, dimensions: result.dims });
