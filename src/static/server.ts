import { LEVEL_BUNDLES } from 'virtual:objecttalk-levels';
import { resetOrderLexicon } from '@shared/cafe';
import { registerKinds } from '@shared/catalog';
import { generatedLevelList, registerLevels } from '@shared/levels';
import type { Replay, ServerInfo } from '@shared/protocol';
import { RoomManager } from '../../server/game/manager';
import { attachRealtime } from '../../server/realtime';
import { Hub } from './hub';

/**
 * The whole ObjectTalk server, in the browser tab: the static GitHub Pages
 * build has no backend, so the real Room / engines / AI partners / coach run
 * here behind an in-page Socket.IO hub. Solo play (AI partner), AI vs AI,
 * replays, the coach, CEFR, the Chinese lifeline (offline glossary) and the
 * word book all work; two devices playing together need the full server.
 */

export const STATIC = true;

const hub = new Hub();
const REPLAYS_KEY = 'objecttalk:static-replays';

function loadReplays(): Record<string, Replay> {
  try {
    return JSON.parse(localStorage.getItem(REPLAYS_KEY) ?? '{}') as Record<string, Replay>;
  } catch {
    return {};
  }
}

const replays = loadReplays();

function saveReplay(replay: Replay) {
  replays[replay.id] = replay;
  // Keep the newest 12 (replays carry pose trails; localStorage is small).
  const keep = Object.values(replays)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12);
  try {
    localStorage.setItem(REPLAYS_KEY, JSON.stringify(Object.fromEntries(keep.map((r) => [r.id, r]))));
  } catch {
    /* storage full or unavailable: the replay stays available in this tab */
  }
}

const rooms = new RoomManager(hub as never, { saveReplay: async (r) => saveReplay(r) });
attachRealtime(hub as never, rooms, { assist: async () => null });

// Agent-made levels ship with the build (content/levels/*.json).
for (const b of LEVEL_BUNDLES) registerKinds(b.kinds.map((k) => ({ ...k, levels: [...new Set([...(k.levels ?? []), b.level.id])] })));
registerLevels(LEVEL_BUNDLES.map((b) => b.level));
resetOrderLexicon();

export const connect = () => hub.connect();
export const levels = () => generatedLevelList();
export const getReplay = (id: string): Replay | null => replays[id] ?? null;

export const info = (): ServerInfo => ({
  version: '0.1.0',
  lanUrls: [],
  publicUrl: null,
  features: { rodin: false, llm: false },
  iceServers: [],
});
