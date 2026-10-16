/**
 * Hyper3D Rodin Gen-2.5 API client (image-to-3D).
 * Flow: POST /rodin (multipart) -> poll POST /status with jobs.subscription_key
 *       -> POST /download with the top-level uuid -> fetch the GLB.
 * Docs: https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5
 */

export interface RodinOptions {
  apiKey: string;
  base: string;
  tier: string;
}

export interface RodinSubmit {
  image: Uint8Array;
  filename: string;
  mime: string;
  prompt?: string;
}

export type RodinStage = 'submitting' | 'queued' | 'generating' | 'downloading' | 'done' | 'failed';

export class RodinError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postJson<T>(opts: RodinOptions, endpoint: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${opts.base}/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429 && attempt < 5) {
      const retry = Number(res.headers.get('retry-after')) || 5 * (attempt + 1);
      await sleep(retry * 1000);
      continue;
    }
    if (!res.ok) throw new RodinError(`Rodin ${endpoint} failed: HTTP ${res.status} ${await res.text().catch(() => '')}`, res.status);
    return (await res.json()) as T;
  }
}

export async function submitRodin(opts: RodinOptions, input: RodinSubmit) {
  const form = new FormData();
  form.append('images', new Blob([input.image as BlobPart], { type: input.mime }), input.filename);
  form.append('tier', opts.tier);
  form.append('mesh_mode', 'Raw');
  form.append('quality', 'medium');
  form.append('geometry_file_format', 'glb');
  // <= 20k faces + Raw + glb qualifies for Rodin's fast mode and stays light for the web.
  form.append('quality_override', '20000');
  if (input.prompt) form.append('prompt', input.prompt);
  const res = await fetch(`${opts.base}/rodin`, { method: 'POST', headers: { Authorization: `Bearer ${opts.apiKey}` }, body: form });
  const json = (await res.json().catch(() => ({}))) as { uuid?: string; error?: string; jobs?: { subscription_key?: string } };
  if (!res.ok || json.error || !json.uuid || !json.jobs?.subscription_key) {
    throw new RodinError(`Rodin submit failed: HTTP ${res.status} ${json.error ?? ''}`.trim(), res.status);
  }
  return { uuid: json.uuid, subscriptionKey: json.jobs.subscription_key };
}

export async function rodinStatus(opts: RodinOptions, subscriptionKey: string) {
  const json = await postJson<{ jobs?: { uuid: string; status: string }[] }>(opts, 'status', { subscription_key: subscriptionKey });
  const statuses = (json.jobs ?? []).map((j) => j.status);
  return {
    statuses,
    done: statuses.length > 0 && statuses.every((s) => s === 'Done'),
    failed: statuses.some((s) => s === 'Failed'),
  };
}

export async function rodinDownload(opts: RodinOptions, taskUuid: string) {
  const json = await postJson<{ list?: { url: string; name: string }[] }>(opts, 'download', { task_uuid: taskUuid });
  return json.list ?? [];
}

/** Run a full generation and return the GLB bytes. Polls with the documented back-off (5s, +5s, max 30s). */
export async function generateModel(opts: RodinOptions, input: RodinSubmit, onStage: (stage: RodinStage, info?: string) => void = () => {}) {
  onStage('submitting');
  const { uuid, subscriptionKey } = await submitRodin(opts, input);
  onStage('queued', uuid);
  const deadline = Date.now() + 20 * 60 * 1000;
  let delay = 5000;
  await sleep(delay);
  for (;;) {
    const s = await rodinStatus(opts, subscriptionKey);
    if (s.failed) {
      onStage('failed');
      throw new RodinError('Rodin reported the job as Failed');
    }
    if (s.done) break;
    onStage('generating', s.statuses.join(','));
    if (Date.now() > deadline) throw new RodinError('Rodin generation timed out');
    delay = Math.min(delay + 5000, 30000);
    await sleep(delay);
  }
  onStage('downloading');
  const files = await rodinDownload(opts, uuid);
  const glbs = files.filter((f) => f.name.toLowerCase().endsWith('.glb'));
  const pick = glbs.find((f) => /pbr/i.test(f.name)) ?? glbs[0];
  if (!pick) throw new RodinError('Rodin returned no GLB file');
  const res = await fetch(pick.url);
  if (!res.ok) throw new RodinError(`Downloading the GLB failed: HTTP ${res.status}`);
  const glb = new Uint8Array(await res.arrayBuffer());
  onStage('done');
  return { uuid, glb };
}
