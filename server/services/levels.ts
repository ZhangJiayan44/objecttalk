import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { registerKinds } from '../../shared/catalog';
import { resetOrderLexicon } from '../../shared/cafe';
import { generatedLevelList, registerLevels, type LevelBundle, type LevelMeta } from '../../shared/levels';

/**
 * Agent-made levels. Two places are scanned:
 *   content/levels/*.json  curated levels shipped with the repo (models in public/models/levels)
 *   <data>/levels/*.json   levels the Scene Agent made on this server (models in <data>/models)
 * Files are re-read when they change, so a level the agent publishes shows up
 * in the lobby without restarting the server.
 */
export class LevelStore {
  private seen = new Map<string, number>();
  readonly dirs: string[];

  constructor(dataDir: string, contentDir = path.resolve('content', 'levels')) {
    this.dirs = [contentDir, path.join(dataDir, 'levels')];
  }

  async init() {
    await mkdir(this.dirs[1], { recursive: true });
    await this.refresh();
  }

  /** Load new or changed level files. Cheap enough to call on every /api/levels request. */
  async refresh(): Promise<LevelMeta[]> {
    let changed = false;
    for (const dir of this.dirs) {
      if (!existsSync(dir)) continue;
      for (const f of await readdir(dir)) {
        if (!f.endsWith('.json')) continue;
        const file = path.join(dir, f);
        const mtime = (await stat(file)).mtimeMs;
        if (this.seen.get(file) === mtime) continue;
        this.seen.set(file, mtime);
        try {
          const bundle = JSON.parse(await readFile(file, 'utf8')) as LevelBundle;
          if (!bundle.level?.id || !bundle.level.generated) continue;
          registerKinds(bundle.kinds.map((k) => ({ ...k, levels: [...new Set([...(k.levels ?? []), bundle.level.id])] })));
          registerLevels([bundle.level]);
          changed = true;
        } catch (err) {
          console.warn(`[levels] skipping ${f}: ${(err as Error).message}`);
        }
      }
    }
    if (changed) resetOrderLexicon();
    return generatedLevelList();
  }

  /** Save a bundle the agent produced at runtime. */
  async save(bundle: LevelBundle) {
    await writeFile(path.join(this.dirs[1], `${bundle.level.id}.json`), JSON.stringify(bundle, null, 2));
    return this.refresh();
  }
}
