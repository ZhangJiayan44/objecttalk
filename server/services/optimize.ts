import { Logger, NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, getBounds, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

/**
 * Web-optimize a Rodin GLB: base at y=0, largest side = 1 unit, WebP textures,
 * meshopt geometry. Typically 8 MB -> ~300 KB. Shared by the asset script,
 * the Object Studio API and the Scene Agent.
 */

let io: NodeIO | null = null;

async function getIO() {
  if (io) return io;
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  return io;
}

function rootScene(doc: Document) {
  return doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
}

export function countTriangles(doc: Document) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += Math.floor((idx ? idx.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)) / 3);
    }
  return tris;
}

function normalizeScale(doc: Document, target = 1) {
  const { min, max } = getBounds(rootScene(doc));
  const largest = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(largest > 0)) return 1;
  const k = target / largest;
  for (const node of rootScene(doc).listChildren()) {
    const [x, y, z] = node.getTranslation();
    const [sx, sy, sz] = node.getScale();
    node.setTranslation([x * k, y * k, z * k]);
    node.setScale([sx * k, sy * k, sz * k]);
  }
  return k;
}

export interface OptimizeResult {
  glb: Uint8Array;
  dims: [number, number, number];
  triangles: number;
}

export async function optimizeGlb(input: Uint8Array, textureSize = 1024): Promise<OptimizeResult> {
  const nodeIO = await getIO();
  const doc = await nodeIO.readBinary(input);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  const triangles = countTriangles(doc);
  await doc.transform(dedup(), prune(), weld(), center({ pivot: 'below' }));
  normalizeScale(doc, 1);
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const { min, max } = getBounds(rootScene(doc));
  const dims = [0, 1, 2].map((i) => +(max[i] - min[i]).toFixed(4)) as [number, number, number];
  return { glb: await nodeIO.writeBinary(doc), dims, triangles };
}
