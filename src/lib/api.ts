import { registerKinds } from '@shared/catalog';
import { registerLevels } from '@shared/levels';
import type { ItemsResponse, LevelsResponse, Replay, ServerInfo } from '@shared/protocol';

/** Thin REST helpers for the ObjectTalk server. */

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return (await res.json()) as T;
}

let infoPromise: Promise<ServerInfo> | null = null;

export function fetchInfo(): Promise<ServerInfo> {
  infoPromise ??= getJson<ServerInfo>('/api/info').catch((err) => {
    infoPromise = null;
    throw err;
  });
  return infoPromise;
}

let itemsPromise: Promise<ItemsResponse> | null = null;

/** Load the item catalog (built-in + Rodin-generated) and register it for the NLU and renderer. */
export function loadItems(force = false): Promise<ItemsResponse> {
  if (force) itemsPromise = null;
  itemsPromise ??= getJson<ItemsResponse>('/api/items')
    .then((res) => {
      registerKinds(res.kinds);
      return res;
    })
    .catch((err) => {
      itemsPromise = null;
      throw err;
    });
  return itemsPromise;
}

let levelsPromise: Promise<LevelsResponse> | null = null;

/** Agent-made levels (Scene Agent output in data/levels), registered for the lobby and the game. */
export function loadLevels(force = false): Promise<LevelsResponse> {
  if (force) levelsPromise = null;
  levelsPromise ??= getJson<LevelsResponse>('/api/levels')
    .then((res) => {
      registerLevels(res.levels);
      return res;
    })
    .catch((err) => {
      levelsPromise = null;
      throw err;
    });
  return levelsPromise;
}

export const fetchReplay = (id: string) => getJson<Replay>(`/api/replays/${encodeURIComponent(id)}`);

export interface StudioJobStatus {
  id: string;
  name: string;
  stage: string;
  error?: string;
  kind?: ItemsResponse['kinds'][number];
}

export async function submitStudioJob(form: FormData): Promise<string> {
  const res = await fetch('/api/studio/generate', { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.jobId as string;
}

export const fetchStudioJob = (id: string) => getJson<StudioJobStatus>(`/api/studio/jobs/${encodeURIComponent(id)}`);

/** Best URL for a phone to reach this room (LAN address in dev, PUBLIC_URL in production). */
export function shareUrl(info: ServerInfo | null, pathname: string): string {
  const here = window.location;
  const isLocal = /^(localhost|127\.|\[::1\])/.test(here.hostname);
  if (info?.publicUrl) return `${info.publicUrl.replace(/\/$/, '')}${pathname}`;
  if (isLocal && info?.lanUrls[0]) {
    const lan = new URL(info.lanUrls[0]);
    return `${here.protocol}//${lan.hostname}:${here.port || lan.port}${pathname}`;
  }
  return `${here.origin}${pathname}`;
}

/** What the vision model saw in a studio photo (null when no LLM is configured). */
export interface IdentifiedObject {
  ok: boolean;
  name: string;
  plural: string;
  zh: string;
  synonyms: string[];
  color: string;
  example: string;
  tip: string;
}

export async function identifyStudioPhoto(file: File): Promise<IdentifiedObject | null> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch('/api/studio/identify', { method: 'POST', body: form });
  const body = (await res.json().catch(() => ({}))) as { identified?: IdentifiedObject | null; error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.identified ?? null;
}

const MINE_KEY = 'objecttalk:my-objects';

/** Object Studio objects made in this browser (so "your things" are yours, not everyone's). */
export function myObjectIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function rememberMyObject(id: string) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify([...new Set([id, ...myObjectIds()])].slice(0, 30)));
  } catch {
    /* storage unavailable */
  }
}
