import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { allKinds, registerKinds } from '../../shared/catalog';
import type { ColorName, InterestId, ItemKind } from '../../shared/types';
import { config } from '../config';
import { optimizeGlb } from './optimize';
import { generateModel, type RodinStage } from './rodin';
import type { Store } from './store';

/**
 * Object Studio: a player uploads a photo of something they own, Rodin turns
 * it into a 3D model, and it joins the item catalog so it can appear on the
 * table in their next run ("your things, in the game").
 */

export interface StudioJob {
  id: string;
  name: string;
  stage: RodinStage | 'optimizing';
  createdAt: number;
  error?: string;
  kind?: ItemKind;
  rodinUuid?: string;
}

export interface StudioRequest {
  image: Uint8Array;
  mime: string;
  filename: string;
  name: string;
  synonyms: string[];
  interest: InterestId | 'everyday';
  color: ColorName;
  prompt?: string;
}

export class Studio {
  private jobs = new Map<string, StudioJob>();
  private generated: ItemKind[] = [];

  constructor(private store: Store) {}

  async init() {
    this.generated = await this.store.loadItems();
    registerKinds(this.generated);
  }

  get enabled() {
    return !!config.rodin.apiKey;
  }

  kinds() {
    return allKinds();
  }

  getJob(id: string) {
    return this.jobs.get(id) ?? null;
  }

  submit(req: StudioRequest): StudioJob {
    const job: StudioJob = { id: nanoid(10), name: req.name, stage: 'submitting', createdAt: Date.now() };
    this.jobs.set(job.id, job);
    void this.run(job, req);
    return job;
  }

  private async run(job: StudioJob, req: StudioRequest) {
    try {
      const { uuid, glb } = await generateModel(
        config.rodin,
        { image: req.image, mime: req.mime, filename: req.filename, prompt: req.prompt },
        (stage, info) => {
          job.stage = stage;
          if (stage === 'queued' && info) job.rodinUuid = info;
        },
      );
      job.stage = 'optimizing';
      const slug = `my-${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
      let bytes: Uint8Array = glb;
      try {
        bytes = (await optimizeGlb(glb)).glb;
      } catch (err) {
        console.warn('[studio] optimize failed, keeping raw GLB:', (err as Error).message);
      }
      await writeFile(path.join(this.store.modelDir, `${slug}.glb`), bytes);
      const ext = req.mime.includes('png') ? 'png' : req.mime.includes('webp') ? 'webp' : 'jpg';
      await writeFile(path.join(this.store.modelDir, `${slug}.${ext}`), req.image);
      const name = req.name.trim().toLowerCase().slice(0, 32) || 'thing';
      const kind: ItemKind = {
        id: slug,
        name,
        plural: name.endsWith('s') ? name : `${name}s`,
        synonyms: [...new Set([name, ...req.synonyms.map((s) => s.trim().toLowerCase()).filter(Boolean)])],
        interest: req.interest,
        emoji: '✨',
        model: `/generated/${slug}.glb`,
        ref: `/generated/${slug}.${ext}`,
        baseColor: req.color,
        footprint: 0.34,
        source: 'rodin',
        rodin: { generationId: uuid, tier: config.rodin.tier, prompt: req.prompt ?? '', reference: 'player photo' },
      };
      this.generated.push(kind);
      registerKinds([kind]);
      await this.store.saveItems(this.generated);
      job.kind = kind;
      job.stage = 'done';
    } catch (err) {
      job.stage = 'failed';
      job.error = (err as Error).message;
      console.warn('[studio] job failed:', job.error);
    }
  }
}
