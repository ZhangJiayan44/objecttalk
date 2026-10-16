import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Replay } from '../../shared/protocol';
import type { ItemKind } from '../../shared/types';

/**
 * Tiny JSON-file persistence. Replays and generated items survive restarts
 * without a database, which keeps `docker run` / `npm start` dependency-free.
 */
export class Store {
  private replays = new Map<string, Replay>();
  readonly replayDir: string;
  readonly modelDir: string;
  readonly itemsFile: string;

  constructor(readonly dataDir: string, private maxReplays = 300) {
    this.replayDir = path.join(dataDir, 'replays');
    this.modelDir = path.join(dataDir, 'models');
    this.itemsFile = path.join(dataDir, 'items.json');
  }

  async init() {
    await mkdir(this.replayDir, { recursive: true });
    await mkdir(this.modelDir, { recursive: true });
  }

  async saveReplay(replay: Replay) {
    this.replays.set(replay.id, replay);
    await writeFile(path.join(this.replayDir, `${replay.id}.json`), JSON.stringify(replay));
    await this.prune();
  }

  async getReplay(id: string): Promise<Replay | null> {
    if (!/^[\w-]{4,40}$/.test(id)) return null;
    const cached = this.replays.get(id);
    if (cached) return cached;
    try {
      const replay = JSON.parse(await readFile(path.join(this.replayDir, `${id}.json`), 'utf8')) as Replay;
      this.replays.set(id, replay);
      return replay;
    } catch {
      return null;
    }
  }

  private async prune() {
    const files = (await readdir(this.replayDir)).filter((f) => f.endsWith('.json'));
    if (files.length <= this.maxReplays) return;
    const sorted = files.sort();
    for (const f of sorted.slice(0, files.length - this.maxReplays)) {
      this.replays.delete(f.replace(/\.json$/, ''));
      await unlink(path.join(this.replayDir, f)).catch(() => undefined);
    }
  }

  async loadItems(): Promise<ItemKind[]> {
    try {
      return JSON.parse(await readFile(this.itemsFile, 'utf8')) as ItemKind[];
    } catch {
      return [];
    }
  }

  async saveItems(kinds: ItemKind[]) {
    await writeFile(this.itemsFile, JSON.stringify(kinds, null, 2));
  }
}
